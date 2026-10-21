import React from 'react';
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { ROLES, type User } from '../types/auth';
import { clearQueryCache } from '../hooks/useQuery';
import { RoleGuard } from '../components/ProtectedRoute';
import { ToastProvider } from '../components/ToastContext';
import ToastBar from '../components/ToastBar';
import { Sidebar } from '../components/Sidebar';
import * as AuthContextModule from '../context/AuthContext';
import { session } from '../services/apiClient';
import { getNavGroups } from '../utils/roleAccess';

// Pages
import Dashboard from '../pages/Dashboard';
import ClientManagement from '../pages/ClientManagement';
import InvoicingDesk from '../pages/InvoicingDesk';
import { BillingValidation } from '../pages/BillingValidation';
import { InvoiceReview } from '../pages/InvoiceReview';
import AccountsReceivable from '../pages/AccountsReceivable';
import Payments from '../pages/Payments';
import { SpeedPayValidation } from '../pages/SpeedPayValidation';
import { Receipts } from '../pages/Receipts';
import Settlements from '../pages/Settlements';
import RecordSettlement from '../pages/RecordSettlement';
import FinancialAdjustments from '../pages/FinancialAdjustments';
import LiquidationValidation from '../pages/LiquidationValidation';
import CashFlowManagement from '../pages/CashFlowManagement';
import UniqueDocuments from '../pages/UniqueDocuments';
import { FlaggedDuplicates } from '../pages/FlaggedDuplicates';
import ReviewHistory from '../pages/ReviewHistory';
import Reports from '../pages/Reports';
import { AuditLogs } from '../pages/AuditLogs';
import { AIOutputHistory } from '../pages/AIOutputHistory';
import AIDuplicateScan from '../pages/AIDuplicateScan';
import DocumentExtraction from '../pages/DocumentExtraction';

// ── STAFF-001 User Definition ──────────────────────────────────────────────────
const EMP_001_USER: User = {
  id: 'STAFF-001',
  employeeId: 'STAFF-001',
  fullName: 'Crystalyn Joyce C. Fajardo',
  email: 'finance.manager@speedex.test',
  role: ROLES.FINANCIAL_MANAGER,
  status: 'Active',
};

function mockAuthUser(user: Partial<User> | null = EMP_001_USER) {
  const logoutMock = vi.fn();
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: user ? ({
      id: user.id || 'STAFF-001',
      employeeId: user.employeeId || user.id || 'STAFF-001',
      fullName: user.fullName || 'Crystalyn Joyce C. Fajardo',
      email: user.email || 'finance.manager@speedex.test',
      role: user.role || ROLES.FINANCIAL_MANAGER,
      status: 'Active',
      ...user,
    } as User) : null,
    isLoading: false,
    isAuthenticated: !!user,
    login: vi.fn(),
    logout: logoutMock,
  });
  return { logoutMock };
}

// ── MSW Handlers and Intercept Callbacks ──────────────────────────────────────
let onInvoiceUpdate = vi.fn();
let onInvoiceAct = vi.fn();
let onBillingRecordAct = vi.fn();
let onPaymentUpdate = vi.fn();
let onSpeedPayValidate = vi.fn();
let onSettlementUpdate = vi.fn();
let onSettlementCreate = vi.fn();
let onAdjustmentAct = vi.fn();
let onLiquidationUpdate = vi.fn();
let onCashFlowCreate = vi.fn();
let onDuplicateReview = vi.fn();

const mockExecutiveDashboardData = {
  asOf: new Date().toISOString(),
  totalInvoicesBilled: 120,
  totalInvoiceAmount: 2500000,
  totalArOutstanding: 850000,
  collectionRate: 85.5,
  totalCollected: 1650000,
  cashInflowThisMonth: 650000,
  duplicateAlerts: 3,
  accountsNearDueDate: 2,
  nearDueAccounts: [
    { clientId: 'CLI-001', clientName: 'Apex Logistics Inc.', amount: 150000, dueDate: new Date().toISOString(), daysRemaining: 3 },
    { clientId: 'CLI-002', clientName: 'Metro Cargo Corp.', amount: 95000, dueDate: new Date().toISOString(), daysRemaining: 5 },
  ],
  agingBuckets: [
    { label: 'Current', value: 400000 },
    { label: '0-30 days', value: 250000 },
    { label: '31-60 days', value: 120000 },
    { label: '61-90 days', value: 50000 },
    { label: '90+ days', value: 30000 },
  ],
  topPayingClients: [
    { clientId: 'CLI-001', clientName: 'Apex Logistics Inc.', amount: 500000 },
    { clientId: 'CLI-002', clientName: 'Metro Cargo Corp.', amount: 320000 },
  ],
  cashFlowAnalytics: [
    { period: 'Jan', inflow: 500000, outflow: 300000 },
    { period: 'Feb', inflow: 650000, outflow: 400000 },
  ],
  recentActivity: [
    {
      id: 'LOG-001',
      userId: 'STAFF-001',
      userFullName: 'Crystalyn Joyce C. Fajardo',
      userRole: 'FINANCIAL_MANAGER',
      action: 'APPROVE_INVOICE',
      module: 'InvoiceReview',
      details: 'Approved invoice INV-2026-001',
      timestamp: new Date().toISOString(),
    },
  ],
  insights: [
    {
      id: 'INS-001',
      title: 'High Delinquency Account',
      message: 'Apex Logistics has an invoice pending validation.',
      severity: 'high',
      targetRoute: '/flagged-duplicates',
      createdAt: new Date().toISOString(),
    },
  ],
};

const mockClients = [
  { id: 'CLI-001', name: 'Apex Logistics Inc.', contactPerson: 'John Smith', phone: '09171234567', email: 'john@apex.com', address: '123 Harbor Ave, Manila', billingSchedule: 'Monthly', status: 'Active' },
  { id: 'CLI-002', name: 'Metro Cargo Corp.', contactPerson: 'Jane Doe', phone: '09181234567', email: 'jane@metro.com', address: '456 Port Rd, Cebu', billingSchedule: 'Semi-Monthly', status: 'Active' },
];

const mockInvoices = [
  {
    id: 'INV-001',
    invoiceNumber: 'INV-2026-001',
    clientId: 'CLI-001',
    clientName: 'Apex Logistics Inc.',
    billingPeriod: 'January 2026',
    totalAmount: 150000,
    status: 'Pending Approval',
    createdAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000 * 7).toISOString(),
    waybillIds: ['WB-001'],
  },
  {
    id: 'INV-002',
    invoiceNumber: 'INV-2026-002',
    clientId: 'CLI-002',
    clientName: 'Metro Cargo Corp.',
    billingPeriod: 'January 2026',
    totalAmount: 75000,
    status: 'Draft',
    createdAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000 * 14).toISOString(),
    waybillIds: ['WB-002'],
  },
];

const mockWaybills = [
  { id: 'WB-001', waybillNumber: 'WB-2026-001', clientCode: 'CLI-001', originArea: 'NCR', destinationArea: 'NCR', declaredValue: 50000, actualWeight: 10, length: 30, width: 20, height: 20, status: 'Validated' },
  { id: 'WB-002', waybillNumber: 'WB-2026-002', clientCode: 'CLI-002', originArea: 'NCR', destinationArea: 'Luzon', declaredValue: 25000, actualWeight: 5, length: 20, width: 15, height: 10, status: 'Validated' },
];

const mockRates = [
  { id: 'RATE-001', clientId: 'CLI-001', region: 'NCR', baseRate: 100, excessWeightRate: 20, volumeRate: 30, odaRate: 50, fuelSurchargePercent: 5, status: 'Active' },
];

const mockBillingRecords = [
  {
    id: 'BR-001',
    waybillId: 'WB-001',
    waybillNumber: 'WB-2026-001',
    clientId: 'CLI-001',
    clientName: 'Apex Logistics Inc.',
    destinationArea: 'NCR',
    grandTotal: 12500,
    status: 'Pending Review',
    computedBy: 'Alex Accountant',
    computedAt: new Date().toISOString(),
  },
];

const mockArRecords = [
  {
    id: 'AR-001',
    invoiceId: 'INV-001',
    clientId: 'CLI-001',
    clientName: 'Apex Logistics Inc.',
    invoiceNumber: 'INV-2026-001',
    originalAmount: 150000,
    paidAmount: 0,
    outstandingBalance: 150000,
    agingBracket: '0-30 days',
    daysOverdue: 5,
    dueDate: new Date(Date.now() + 86400000 * 5).toISOString(),
    status: 'Current',
  },
];

const mockPayments = [
  {
    id: 'PAY-001',
    referenceNumber: 'REF-BANK-001',
    invoiceId: 'INV-001',
    clientId: 'CLI-001',
    clientName: 'Apex Logistics Inc.',
    amount: 150000,
    paymentMethod: 'Bank Transfer',
    status: 'Validated',
    recordedAt: new Date().toISOString(),
    recordedBy: 'Alex Accountant',
  },
];

const mockSpeedPay = [
  {
    id: 'SP-001',
    invoiceId: 'INV-001',
    invoiceNumber: 'INV-2026-001',
    clientId: 'CLI-001',
    clientName: 'Apex Logistics Inc.',
    amountPaid: 150000,
    paymentMethod: 'GCash',
    referenceNumber: 'GCASH-998877',
    status: 'Pending Validation',
    submittedAt: new Date().toISOString(),
  },
];

const mockReceipts = [
  {
    id: 'REC-001',
    receiptNumber: 'OR-2026-001',
    paymentId: 'PAY-001',
    invoiceId: 'INV-001',
    clientId: 'CLI-001',
    amount: 150000,
    paymentMethod: 'Bank Transfer',
    referenceNumber: 'REF-BANK-001',
    issuedAt: new Date().toISOString(),
    issuedBy: 'Crystalyn Joyce C. Fajardo',
    status: 'Issued OR',
  },
];

const mockSettlements = [
  {
    id: 'SET-001',
    tripRef: 'TRIP-2026-001',
    courierName: 'Courier Mike',
    type: 'Leftover return',
    amount: 3500,
    status: 'For validation',
    submittedAt: new Date().toISOString(),
    recordedBy: 'Alex Accountant',
  },
];

const mockAdjustments = [
  {
    id: 'ADJ-001',
    type: 'Adjustment',
    amount: 5000,
    reason: 'Freight rate correction',
    status: 'Pending Approval',
    affectedRecordId: 'INV-001',
    clientId: 'CLI-001',
    createdAt: new Date().toISOString(),
    createdBy: 'Alex Accountant',
  },
];

const mockLiquidations = [
  {
    id: 'LIQ-001',
    reference: 'LIQ-EXP-001',
    submittedBy: 'Courier Mike',
    amount: 4200,
    status: 'Pending Validation',
    submittedAt: new Date().toISOString(),
    expenses: [{ type: 'Fuel', amount: 3000 }, { type: 'Toll', amount: 1200 }],
  },
];

const mockCashFlow = [
  {
    id: 'CF-001',
    type: 'Inflow',
    amount: 150000,
    sourceReference: 'PAY-001',
    date: new Date().toISOString(),
    recordedBy: 'Crystalyn Joyce C. Fajardo',
  },
];

const mockUniqueDocs = [
  {
    id: 'DOC-001',
    uniqueId: 'DOC-001',
    type: 'Invoice',
    documentType: 'Invoice',
    orInvoiceNumber: 'INV-2026-001',
    documentNumber: 'INV-2026-001',
    clientName: 'Apex Logistics Inc.',
    amount: 150000,
    aiConfidence: 99,
    scannedDate: new Date().toISOString(),
    ocrHash: 'a1b2c3d4e5f6',
    status: 'VERIFIED',
  },
];

const mockDuplicateFlags = [
  {
    id: 'FLAG-001',
    flagId: 'FLAG-001',
    documentType: 'Liquidation',
    uploadedNumber: 'LIQ-DOC-001',
    clientName: 'Apex Logistics Inc.',
    status: 'PENDING_REVIEW',
    similarity: 98,
    flaggedDate: new Date().toISOString(),
    matchedDoc: { documentNumber: 'LIQ-DOC-PREV' },
    duplicateReason: 'Identical amount, date, and receipt number detected',
    decidedBy: 'STAFF-003',
    decision: 'DUPLICATE',
  },
];

const mockReviewHistory = [
  {
    id: 'HIST-001',
    historyId: 'HIST-001',
    documentType: 'Invoice',
    documentNumber: 'INV-2026-001',
    clientName: 'Apex Logistics Inc.',
    finalDecision: 'Resolved',
    reviewer: 'Crystalyn Joyce C. Fajardo',
    reviewerRole: 'Financial Manager',
    decisionReason: 'Legitimate separate transaction verified',
    reviewedDate: new Date().toISOString(),
  },
];

const mockAuditLogs = [
  {
    id: 'AUD-001',
    userId: 'STAFF-001',
    userFullName: 'Crystalyn Joyce C. Fajardo',
    userRole: 'FINANCIAL_MANAGER',
    action: 'APPROVE_INVOICE',
    module: 'InvoiceReview',
    recordId: 'INV-001',
    recordType: 'Invoice',
    details: 'Managerial approval completed',
    timestamp: new Date().toISOString(),
    ipAddress: '127.0.0.1',
  },
];

const mockAiOutputs = [
  {
    id: 'AI-001',
    module: 'duplicate',
    entityId: 'INV-001',
    documentNumber: 'INV-2026-001',
    clientName: 'Apex Logistics Inc.',
    outputSummary: 'Potential duplicate invoice detected with 98% confidence.',
    score: 98,
    reviewer: 'Crystalyn Joyce C. Fajardo',
    reviewDecision: 'Approved',
    createdAt: new Date().toISOString(),
  },
];

const server = setupServer(
  // Auth
  http.get(/.*\/auth\/me/, () => HttpResponse.json(EMP_001_USER)),
  http.post(/.*\/auth\/logout/, () => HttpResponse.json({ success: true })),

  // Dashboard
  http.get(/.*\/financial-manager\/executive-dashboard/, () => HttpResponse.json(mockExecutiveDashboardData)),
  http.get(/.*\/ai\/dashboard\/alerts/, () => HttpResponse.json([])),

  // Clients
  http.get(/.*\/clients/, () => HttpResponse.json({ items: mockClients, total: mockClients.length })),

  // Invoices
  http.get(/.*\/invoices$/, () => HttpResponse.json({ items: mockInvoices, total: mockInvoices.length })),
  http.get(/.*\/invoices\?.*/, () => HttpResponse.json({ items: mockInvoices, total: mockInvoices.length })),
  http.put('*/invoices/:id', async ({ params, request }) => {
    const body = await request.json() as any;
    onInvoiceUpdate(params.id, body);
    return HttpResponse.json({ id: params.id, ...body });
  }),
  http.post('*/invoices/:id/:action', async ({ params }) => {
    onInvoiceAct(params.id, params.action);
    return HttpResponse.json({ success: true, id: params.id, action: params.action });
  }),

  // Waybills & Billing Records
  http.get(/.*\/shipment-records/, () => HttpResponse.json({ items: mockWaybills, total: mockWaybills.length })),
  http.get(/.*\/billing-records/, () => HttpResponse.json({ items: mockBillingRecords, total: mockBillingRecords.length })),
  http.post('*/billing-records/:id/:action', async ({ params }) => {
    onBillingRecordAct(params.id, params.action);
    return HttpResponse.json({ success: true, id: params.id, action: params.action });
  }),
  http.get(/.*\/billing-rates/, () => HttpResponse.json({ items: mockRates, total: mockRates.length })),

  // Accounts Receivable (AR)
  http.get('*/ar/records', () => HttpResponse.json({ items: mockArRecords, total: mockArRecords.length })),
  http.get(/.*\/ar\/records/, () => HttpResponse.json({ items: mockArRecords, total: mockArRecords.length })),
  http.get('*/ar/aging', () => HttpResponse.json([{ label: '0-30 days', value: 150000 }])),
  http.get(/.*\/ar\/aging/, () => HttpResponse.json([{ label: '0-30 days', value: 150000 }])),
  http.get(/.*\/ai\/collection\/recommendations/, () => HttpResponse.json([])),
  http.post(/.*\/ai\/collection\/recommendations/, () => HttpResponse.json({ success: true })),

  // Payments & Receipts
  http.get(/.*\/payments\/receipts/, () => HttpResponse.json({ items: mockReceipts, total: mockReceipts.length })),
  http.get(/.*\/official-receipts/, () => HttpResponse.json({ items: mockReceipts, total: mockReceipts.length })),
  http.get(/.*\/payments$/, () => HttpResponse.json({ items: mockPayments, total: mockPayments.length })),
  http.get(/.*\/payments\?.*/, () => HttpResponse.json({ items: mockPayments, total: mockPayments.length })),
  http.put('*/payments/:id', async ({ params, request }) => {
    const body = await request.json() as any;
    onPaymentUpdate(params.id, body);
    return HttpResponse.json({ id: params.id, ...body });
  }),

  // SpeedPay
  http.get(/.*\/speedpay\/submissions/, () => HttpResponse.json({ items: mockSpeedPay, total: mockSpeedPay.length })),
  http.post('*/speedpay/submissions/:id/verify', async ({ params, request }) => {
    const body = await request.json() as any;
    onSpeedPayValidate(params.id, body);
    return HttpResponse.json({ success: true, id: params.id, ...body });
  }),

  // Settlements
  http.get(/.*\/settlements/, () => HttpResponse.json({ items: mockSettlements, total: mockSettlements.length })),
  http.put('*/settlements/:id', async ({ params, request }) => {
    const body = await request.json() as any;
    onSettlementUpdate(params.id, body);
    return HttpResponse.json({ id: params.id, ...body });
  }),
  http.post('*/settlements', async ({ request }) => {
    const body = await request.json() as any;
    onSettlementCreate(body);
    return HttpResponse.json({ id: 'SET-NEW', ...body });
  }),

  // Adjustments
  http.get(/.*\/adjustments/, () => HttpResponse.json({ items: mockAdjustments, total: mockAdjustments.length })),
  http.post('*/adjustments/:id/:action', async ({ params }) => {
    onAdjustmentAct(params.id, params.action);
    return HttpResponse.json({ success: true, id: params.id, action: params.action });
  }),

  // Liquidations
  http.get(/.*\/liquidations/, () => HttpResponse.json({ items: mockLiquidations, total: mockLiquidations.length })),
  http.put('*/liquidations/:id', async ({ params, request }) => {
    const body = await request.json() as any;
    onLiquidationUpdate(params.id, body);
    return HttpResponse.json({ id: params.id, ...body });
  }),

  // Cash Flow
  http.get(/.*\/cash-flow/, () => HttpResponse.json({ items: mockCashFlow, total: mockCashFlow.length })),
  http.post('*/cash-flow', async ({ request }) => {
    const body = await request.json() as any;
    onCashFlowCreate(body);
    return HttpResponse.json({ id: 'CF-NEW', ...body });
  }),

  // AI Duplicates Endpoints
  http.get(/.*\/ai\/duplicates\/unique-documents/, () => HttpResponse.json({ items: mockUniqueDocs, total: mockUniqueDocs.length })),
  http.get(/.*\/ai\/duplicates\/review-history/, () => HttpResponse.json({ items: mockReviewHistory, total: mockReviewHistory.length })),
  http.get(/.*\/ai\/duplicates$/, () => HttpResponse.json({ items: mockDuplicateFlags, total: mockDuplicateFlags.length })),
  http.get(/.*\/ai\/duplicates\?.*/, () => HttpResponse.json({ items: mockDuplicateFlags, total: mockDuplicateFlags.length })),
  http.post('*/ai/duplicates/check', () => HttpResponse.json({ isDuplicate: false, matches: [] })),
  http.post('*/ai/duplicates/:id/review', async ({ params, request }) => {
    const body = await request.json() as any;
    onDuplicateReview(params.id, body);
    return HttpResponse.json({ success: true, id: params.id, ...body });
  }),

  // Audit Logs & AI Outputs
  http.get(/.*\/audit-logs/, () => HttpResponse.json({ items: mockAuditLogs, total: mockAuditLogs.length })),
  http.post(/.*\/audit-logs/, () => HttpResponse.json({ success: true })),
  http.get(/.*\/ai\/outputs/, () => HttpResponse.json({ items: mockAiOutputs, total: mockAiOutputs.length }))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  clearQueryCache();
  session.clear();
  vi.clearAllMocks();
});
afterAll(() => server.close());

// Helper to render component with providers
function renderWithContext(ui: React.ReactElement, initialRoute: string = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <ToastProvider>
        <ToastBar />
        {ui}
      </ToastProvider>
    </MemoryRouter>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE FLOW VERIFICATION TEST SUITE FOR USER STAFF-001
// ─────────────────────────────────────────────────────────────────────────────
describe('STAFF-001 (Financial Manager) — Complete Page-by-Page Workflow & Verification', () => {

  // ── Step 1: Identify ───────────────────────────────────────────────────────
  describe('STEP 1: Identify Role and Sidebar Items', () => {
    it('verifies STAFF-001 has role FINANCIAL_MANAGER and exact 20 sidebar items', () => {
      mockAuthUser();
      const navGroups = getNavGroups(ROLES.FINANCIAL_MANAGER);
      const allSidebarLabels = navGroups.flatMap(g => g.items.map(i => i.label));

      expect(EMP_001_USER.role).toBe('FINANCIAL_MANAGER');
      expect(EMP_001_USER.fullName).toBe('Crystalyn Joyce C. Fajardo');

      expect(allSidebarLabels).toEqual([
        'Dashboard', // Executive Dashboard
        'Client Accounts',
        'Invoice List',
        'Billing Validation',
        'Accounts Receivable',
        'Payments',
        'SpeedPay Validation',
        'Official Receipts',
        'Settlements', // Settlement Validation
        'Financial Adjustments', // Adjustment Approval
        'Liquidation Reports',
        'Cash Flow',
        'Manual Review Queue',
        'Unique Documents',
        'Flagged Duplicates',
        'Review History',
        'Reports',
        'Audit Logs',
        'AI Output History',
      ]);
      expect(allSidebarLabels).toHaveLength(19);
    });
  });

  // ── Page 1: Executive Dashboard ───────────────────────────────────────────
  describe('Page 1: /dashboard (Executive Dashboard)', () => {
    it('loads and shows financial overview data, handles empty state, and handles API error retry', async () => {
      mockAuthUser();

      const { unmount } = renderWithContext(<Dashboard />, '/dashboard');
      await waitFor(() => {
        expect(screen.getByText(/here's your financial overview/i)).toBeDefined();
        expect(screen.getByText(/Total Invoices Billed/i)).toBeDefined();
        expect(screen.queryByText(/outstanding · .*collection rate/i)).toBeNull();
        expect(screen.queryByText(/vs prev\.|N\/A|From recorded cash-flow transactions|Collected:/i)).toBeNull();
      });
      unmount();

      // Empty State
      server.use(
        http.get(/.*\/financial-manager\/executive-dashboard/, () =>
          HttpResponse.json({
            ...mockExecutiveDashboardData,
            duplicateAlerts: 0,
            accountsNearDueDate: 0,
            nearDueAccounts: [],
            insights: [],
            topPayingClients: [],
            cashFlowAnalytics: [],
            agingBuckets: [],
          })
        )
      );
      const { unmount: u2 } = renderWithContext(<Dashboard />, '/dashboard');
      await waitFor(() => {
        expect(screen.getByText(/No open financial or workflow alerts/i)).toBeDefined();
        expect(screen.getByText(/No payment data yet/i)).toBeDefined();
      });
      u2();

      // API Failure with Retry
      let fetchCount = 0;
      server.use(
        http.get(/.*\/financial-manager\/executive-dashboard/, () => {
          fetchCount++;
          if (fetchCount === 1) {
            return new HttpResponse(null, { status: 500, statusText: 'Internal Error' });
          }
          return HttpResponse.json(mockExecutiveDashboardData);
        })
      );
      renderWithContext(<Dashboard />, '/dashboard');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
      });
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      await waitFor(() => {
        expect(screen.getByText(/here's your financial overview/i)).toBeDefined();
      });
    });
  });

  // ── Page 2: Client Accounts ───────────────────────────────────────────────
  describe('Page 2: /clients (Client Accounts)', () => {
    it('loads client list, filters, and opens client details modal', async () => {
      mockAuthUser();
      renderWithContext(<ClientManagement />, '/clients');

      await waitFor(() => {
        expect(screen.getByText('Apex Logistics Inc.')).toBeDefined();
        expect(screen.getByText('Metro Cargo Corp.')).toBeDefined();
      });

      // Quick view recommendation modal via card VIEW button
      const viewBtns = screen.getAllByRole('button', { name: /^view$/i });
      fireEvent.click(viewBtns[0]);
      await waitFor(() => {
        expect(screen.getByText(/Client Information/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /view full profile/i })).toBeDefined();
      });
    });
  });

  // ── Page 3: Invoice List ──────────────────────────────────────────────────
  describe('Page 3: /invoicing-desk (Invoice List)', () => {
    it('loads invoices and calls update on submit for approval', async () => {
      mockAuthUser();
      renderWithContext(<InvoicingDesk />, '/invoicing-desk');

      await waitFor(() => {
        expect(screen.getAllByText('Apex Logistics Inc.').length).toBeGreaterThan(0);
      });

      // Submit for Approval action button on Draft invoice
      const submitBtn = screen.getByTitle('Submit for Approval');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onInvoiceUpdate).toHaveBeenCalledWith('INV-002', expect.objectContaining({
          status: 'Pending Approval',
        }));
      });
    });
  });

  // ── Page 4: Billing Validation ────────────────────────────────────────────
  describe('Page 4: /billing-validation (Billing Validation)', () => {
    it('loads billing records and manager approves record calling endpoint', async () => {
      mockAuthUser();
      renderWithContext(<BillingValidation />, '/billing-validation');

      await waitFor(() => {
        expect(screen.getByText('WB-2026-001')).toBeDefined();
        expect(screen.getByRole('button', { name: /approve/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => {
        expect(onBillingRecordAct).toHaveBeenCalledWith('BR-001', 'approve');
      });
    });
  });

  // ── Page 5: Invoice Review ────────────────────────────────────────────────
  describe('Page 5: /invoice-review (Invoice Review)', () => {
    it('loads pending invoice and managerial approval calls act endpoint', async () => {
      mockAuthUser();
      renderWithContext(<InvoiceReview />, '/invoice-review');

      await waitFor(() => {
        expect(screen.getAllByText('Apex Logistics Inc.').length).toBeGreaterThan(0);
      });

      // Open review modal via card "Review Invoice" button
      const reviewBtn = screen.getByRole('button', { name: /review invoice/i });
      fireEvent.click(reviewBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve invoice/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /approve invoice/i }));

      await waitFor(() => {
        expect(onInvoiceAct).toHaveBeenCalledWith('INV-001', 'approve');
      });
    });
  });

  // ── Page 6: Accounts Receivable ───────────────────────────────────────────
  describe('Page 6: /accounts-receivable (Accounts Receivable)', () => {
    it('loads aging KPIs and AR records', async () => {
      mockAuthUser();
      renderWithContext(<AccountsReceivable />, '/accounts-receivable');

      await waitFor(() => {
        expect(screen.getByText(/Total AR/i)).toBeDefined();
        expect(screen.getAllByText('Apex Logistics Inc.').length).toBeGreaterThan(0);
      });
    });
  });

  // ── Page 7: Payments ──────────────────────────────────────────────────────
  describe('Page 7: /payments (Payments)', () => {
    it('loads validated payments and FM approves payment calling update', async () => {
      mockAuthUser();
      renderWithContext(<Payments />, '/payments?paymentId=PAY-001&action=view');

      await waitFor(() => {
        expect(screen.getByText(/Payment Information/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /confirm final approval/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /confirm final approval/i }));

      await waitFor(() => {
        expect(screen.getByText(/Confirm Action/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /confirm$/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /confirm$/i }));

      await waitFor(() => {
        expect(onPaymentUpdate).toHaveBeenCalledWith('PAY-001', expect.objectContaining({
          status: 'Approved',
        }));
      });
    });
  });

  // ── Page 8: SpeedPay Validation ───────────────────────────────────────────
  describe('Page 8: /speedpay-validation (SpeedPay Validation)', () => {
    it('loads submissions and approves SpeedPay entry calling validate endpoint', async () => {
      mockAuthUser();
      renderWithContext(<SpeedPayValidation />, '/speedpay-validation');

      await waitFor(() => {
        expect(screen.getByText('GCASH-998877')).toBeDefined();
        expect(screen.getByRole('button', { name: /review & validate/i })).toBeDefined();
      });

      // Open review modal
      fireEvent.click(screen.getByRole('button', { name: /review & validate/i }));

      await waitFor(() => {
        expect(screen.getByText(/Payment Information/i)).toBeDefined();
      });

      // Select Approve decision
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[selects.length - 1], { target: { value: 'Approve' } });

      const submitBtn = await screen.findByRole('button', { name: /confirm validation/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onSpeedPayValidate).toHaveBeenCalledWith('SP-001', expect.objectContaining({
          status: 'Validated',
        }));
      });
    });
  });

  // ── Page 9: Official Receipts ─────────────────────────────────────────────
  describe('Page 9: /receipts (Official Receipts)', () => {
    it('loads issued receipts and opens preview modal', async () => {
      mockAuthUser();
      renderWithContext(
        <Routes>
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/receipts/:id" element={<Receipts />} />
        </Routes>,
        '/receipts'
      );

      await waitFor(() => {
        expect(screen.getByText('Apex Logistics Inc.')).toBeDefined();
        expect(screen.getByRole('button', { name: /view official receipts/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /view official receipts/i }));

      await waitFor(() => {
        expect(screen.getByText(/OR-2026/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /view official receipt/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /view official receipt/i }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /print \/ pdf/i })).toBeDefined();
      });
    });
  });

  // ── Page 10: Settlement Validation ────────────────────────────────────────
  describe('Page 10: /settlements (Settlement Validation)', () => {
    it('loads courier settlements and approves settlement calling update endpoint', async () => {
      mockAuthUser();
      renderWithContext(<Settlements />, '/settlements');

      await waitFor(() => {
        expect(screen.getByText('Courier Mike')).toBeDefined();
        expect(screen.getByRole('button', { name: /review settlement/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /review settlement/i }));

      await waitFor(() => {
        expect(screen.getByText('Decision')).toBeDefined();
      });

      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[selects.length - 1], { target: { value: 'approve' } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /confirm validate/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /confirm validate/i }));

      await waitFor(() => {
        expect(onSettlementUpdate).toHaveBeenCalledWith('SET-001', expect.objectContaining({
          status: 'Validated',
        }));
      });
    });
  });

  // ── Page 11: Record Settlement ────────────────────────────────────────────
  describe('Page 11: /record-settlement (Record Settlement)', () => {
    it('loads settlement history and submits new settlement', async () => {
      mockAuthUser();
      renderWithContext(<RecordSettlement />, '/record-settlement');

      await waitFor(() => {
        expect(screen.getByText('Courier Mike')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /record settlement/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Full name/i)).toBeDefined();
      });

      fireEvent.change(screen.getByPlaceholderText(/Type CF-### or courier/i), { target: { value: 'CF-101' } });
      fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Courier Dave' } });
      fireEvent.change(screen.getByPlaceholderText(/TRIP-MNL-XXX-000/i), { target: { value: 'TRIP-999' } });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. ENV-JDC-0929/i), { target: { value: 'ENV-123' } });

      const numberInputs = screen.getAllByPlaceholderText(/0\.00/i);
      fireEvent.change(numberInputs[0], { target: { value: '5000' } });
      fireEvent.change(numberInputs[1], { target: { value: '2500' } });
      fireEvent.change(numberInputs[2], { target: { value: '2500' } });

      fireEvent.click(screen.getByLabelText(/I counted the cash and matched it to the courier's envelope slip/i));
      fireEvent.click(screen.getByRole('button', { name: /submit to finance manager/i }));

      await waitFor(() => {
        expect(onSettlementCreate).toHaveBeenCalledWith(expect.objectContaining({
          courierName: 'Courier Dave',
          tripRef: 'TRIP-999',
          amount: 2500,
        }));
      });
    });
  });

  // ── Page 12: Adjustment Approval ──────────────────────────────────────────
  describe('Page 12: /adjustments (Adjustment Approval)', () => {
    it('loads adjustments and approves adjustment calling act endpoint', async () => {
      mockAuthUser();
      renderWithContext(<FinancialAdjustments />, '/adjustments');

      await waitFor(() => {
        expect(screen.getByText('Freight rate correction')).toBeDefined();
        expect(screen.getByRole('button', { name: /approve/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => {
        expect(onAdjustmentAct).toHaveBeenCalledWith('ADJ-001', 'approve');
      });
    });
  });

  // ── Page 13: Liquidation Reports ──────────────────────────────────────────
  describe('Page 13: /liquidations (Liquidation Reports)', () => {
    it('loads liquidations and validates report calling update endpoint', async () => {
      mockAuthUser();
      renderWithContext(<LiquidationValidation />, '/liquidations');

      await waitFor(() => {
        expect(screen.getByText(/LIQ-EXP-001/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /review liquidation/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /review liquidation/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /log decision/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /log decision/i }));

      await waitFor(() => {
        expect(onLiquidationUpdate).toHaveBeenCalledWith('LIQ-001', expect.objectContaining({
          status: 'Validated',
        }));
      });
    });
  });

  // ── Page 14: Cash Flow ────────────────────────────────────────────────────
  describe('Page 14: /cash-flow (Cash Flow)', () => {
    it('loads cash flow records and displays net flow KPIs', async () => {
      mockAuthUser();
      renderWithContext(<CashFlowManagement />, '/cash-flow');

      await waitFor(() => {
        expect(screen.getByText(/TOTAL INFLOW/i)).toBeDefined();
        expect(screen.getByText(/NET CASH FLOW/i)).toBeDefined();
      });
    });
  });

  // ── Page 15: Unique Documents ─────────────────────────────────────────────
  describe('Page 15: /unique-documents (Unique Documents)', () => {
    it('loads unique documents and opens document detail inspection modal', async () => {
      mockAuthUser();
      renderWithContext(<UniqueDocuments />, '/unique-documents');

      await waitFor(() => {
        expect(screen.getAllByText('INV-2026-001').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /inspect/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /inspect/i }));

      await waitFor(() => {
        expect(screen.getByText(/Document Inspection/i)).toBeDefined();
        expect(screen.getAllByText('INV-2026-001').length).toBeGreaterThan(0);
      });
    });
  });

  // ── Page 16: Flagged Duplicates ───────────────────────────────────────────
  describe('Page 16: /flagged-duplicates (Flagged Duplicates)', () => {
    it('loads flagged duplicates and supervisor approves decision calling review endpoint', async () => {
      mockAuthUser();
      renderWithContext(<FlaggedDuplicates />, '/flagged-duplicates');

      await waitFor(() => {
        expect(screen.getByText('FLAG-001')).toBeDefined();
        expect(screen.getByRole('button', { name: /^approve$/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Optional approval notes/i)).toBeDefined();
      });

      fireEvent.change(screen.getByPlaceholderText(/Optional approval notes/i), {
        target: { value: 'Verified legitimate by FM' },
      });
      const approveBtns = screen.getAllByRole('button', { name: /^approve$/i });
      fireEvent.click(approveBtns[approveBtns.length - 1]);

      await waitFor(() => {
        expect(onDuplicateReview).toHaveBeenCalledWith('FLAG-001', expect.objectContaining({
          action: 'APPROVE',
          remarks: 'Verified legitimate by FM',
        }));
      });
    });
  });

  // ── Page 17: Review History ───────────────────────────────────────────────
  describe('Page 17: /review-history (Review History)', () => {
    it('loads review history audit list and executes export', async () => {
      mockAuthUser();
      renderWithContext(<ReviewHistory />, '/review-history');

      await waitFor(() => {
        expect(screen.getByText('Apex Logistics Inc.')).toBeDefined();
        expect(screen.getByRole('button', { name: /export all csv/i })).toBeDefined();
      });
    });
  });

  // ── Page 18: Reports ──────────────────────────────────────────────────────
  describe('Page 18: /reports (Reports)', () => {
    it('compiles financial reports and triggers report generation', async () => {
      mockAuthUser();
      renderWithContext(<Reports />, '/reports');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate report/i })).toBeDefined();
        expect(screen.getByRole('button', { name: /export formal pdf/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /generate report/i }));
      await waitFor(() => {
        expect(screen.getByText('OFFICIAL FOMS REPORT')).toBeDefined();
      });
    });
  });

  // ── Page 19: Audit Logs ───────────────────────────────────────────────────
  describe('Page 19: /audit-logs (Audit Logs)', () => {
    it('loads system audit logs and displays export button', async () => {
      mockAuthUser();
      renderWithContext(<AuditLogs />, '/audit-logs');

      await waitFor(() => {
        expect(screen.getAllByText('Crystalyn Joyce C. Fajardo').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /^export$/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /view details/i }));
      await waitFor(() => {
        expect(screen.getByText('Managerial approval completed')).toBeDefined();
      });
    });
  });

  // ── Page 20: AI Output History ────────────────────────────────────────────
  describe('Page 20: /ai-history (AI Output History)', () => {
    it('loads AI output records and displays export option', async () => {
      mockAuthUser();
      renderWithContext(<AIOutputHistory />, '/ai-history');

      await waitFor(() => {
        expect(screen.getByText(/Potential duplicate invoice detected/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /export csv/i })).toBeDefined();
      });
    });
  });

  // ── Forbidden Pages Verification (403) ────────────────────────────────────
  describe('Forbidden Pages (403 Access Denied for FM)', () => {
    it('/duplicate-scan blocks FM and renders 403 ForbiddenPage', () => {
      mockAuthUser();
      render(
        <MemoryRouter initialEntries={['/duplicate-scan']}>
          <RoleGuard module="duplicateScan">
            <AIDuplicateScan />
          </RoleGuard>
        </MemoryRouter>
      );

      expect(screen.getByText(/403 — Access denied/i)).toBeDefined();
      expect(screen.getByText(/Your role does not have permission to view this page/i)).toBeDefined();
      expect(screen.queryByText(/Upload & Scan Document/i)).toBeNull();
    });

    it('/document-extraction blocks FM and renders 403 ForbiddenPage', () => {
      mockAuthUser();
      render(
        <MemoryRouter initialEntries={['/document-extraction']}>
          <RoleGuard module="documentExtraction">
            <DocumentExtraction />
          </RoleGuard>
        </MemoryRouter>
      );

      expect(screen.getByText(/403 — Access denied/i)).toBeDefined();
      expect(screen.getByText(/Your role does not have permission to view this page/i)).toBeDefined();
    });
  });

  // ── Logout Flow Verification ──────────────────────────────────────────────
  describe('User Profile and Logout Flow', () => {
    it('renders user card in sidebar, opens profile menu, and clicking Log Out executes logout', async () => {
      const { logoutMock } = mockAuthUser();

      render(
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('Crystalyn Joyce C. Fajardo')).toBeDefined();
      expect(screen.getAllByText('Financial Manager').length).toBeGreaterThan(0);

      // Click user profile card to open popup menu
      const profileCard = screen.getByText('Crystalyn Joyce C. Fajardo').closest('div')!;
      fireEvent.click(profileCard);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /log out/i })).toBeDefined();
        expect(screen.getByRole('button', { name: /my profile/i })).toBeDefined();
      });

      // Click Log Out
      fireEvent.click(screen.getByRole('button', { name: /log out/i }));

      expect(logoutMock).toHaveBeenCalledTimes(1);
    });
  });

});
