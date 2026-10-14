import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ROLES, type User } from '../types/auth';
import {
  getNavGroups,
  canDo,
  getDuplicateScope,
  isLiquidationDoc,
  canUploadDocuments,
  canCheckDuplicateInForm,
  LANDING_PATH,
  MODULES,
  moduleLabel,
} from '../utils/roleAccess';
import {
  canPerformDuplicateAction,
  canDecideDuplicate,
  canReviewDuplicate,
  canApproveOwnCheck,
  getNextDuplicateStatus,
} from '../utils/duplicateWorkflow';
import { RoleGuard } from '../components/ProtectedRoute';
import Sidebar from '../components/Sidebar';
import FlaggedDuplicates from '../pages/FlaggedDuplicates';
import AIDuplicateScan from '../pages/AIDuplicateScan';
import UniqueDocuments from '../pages/UniqueDocuments';
import ReviewHistory from '../pages/ReviewHistory';
import * as AuthContextModule from '../context/AuthContext';
import { duplicatesService, type DuplicateFlagItem } from '../services/duplicates.service';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import * as DuplicatesHookModule from '../hooks/useDuplicates';

// ─── Mocks ─────────────────────────────────────────────────────────────
vi.mock('../services/duplicates.service', () => ({
  duplicatesService: {
    scan: vi.fn(),
    flagged: vi.fn(),
    uniqueDocuments: vi.fn(),
    reviewHistory: vi.fn(),
    decideDuplicate: vi.fn().mockResolvedValue({ success: true }),
    reviewDecision: vi.fn().mockResolvedValue({ success: true }),
    confirmDuplicate: vi.fn().mockResolvedValue({ success: true }),
    dismissDuplicate: vi.fn().mockResolvedValue({ success: true }),
    resolveDuplicate: vi.fn().mockResolvedValue({ success: true }),
  },
}));

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  showToast: vi.fn(),
};

vi.mock('../components/ToastContext', () => ({
  useToast: () => ({
    toast: mockToast,
    toasts: [],
    triggerToast: vi.fn(),
    dismissToast: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function mockAuthUser(user: Partial<User> | null) {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: user
      ? {
          employeeId: user.employeeId || 'TEST-001',
          fullName: user.fullName || 'Test User',
          role: user.role!,
          email: user.email,
        }
      : null,
    isAuthenticated: !!user,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const mockFlaggedItems: DuplicateFlagItem[] = [
  {
    id: 'dup-1',
    flagId: 'FLG-1001',
    matchType: 'Invoice',
    uploadedNumber: 'INV-2026-901',
    existingRecord: 'INV-2026-004',
    clientName: 'Acme Corp',
    amount: 45000,
    similarity: 98,
    status: 'FLAGGED',
    duplicateReason: 'Exact match on invoice number and client',
    flaggedBy: 'AI Scanner',
    flaggedDate: '2026-10-10',
    documentType: 'Commercial Invoice',
  },
  {
    id: 'dup-2',
    flagId: 'FLG-1002',
    matchType: 'Receipt',
    uploadedNumber: 'EXP-2026-88',
    existingRecord: 'EXP-2026-12',
    clientName: 'Logistics Fleet',
    amount: 3200,
    similarity: 95,
    status: 'FLAGGED',
    duplicateReason: 'Duplicate fuel receipt voucher',
    flaggedBy: 'AI Scanner',
    flaggedDate: '2026-10-09',
    documentType: 'Fuel Receipt',
  },
  {
    id: 'dup-3',
    flagId: 'FLG-1003',
    matchType: 'Invoice',
    uploadedNumber: 'INV-2026-777',
    existingRecord: 'INV-2026-111',
    clientName: 'Global Freight',
    amount: 88000,
    similarity: 99,
    status: 'PENDING_REVIEW',
    decision: 'DUPLICATE',
    decidedBy: 'ACC-001',
    duplicateReason: 'Confirmed exact duplicate',
    flaggedBy: 'AI Scanner',
    flaggedDate: '2026-10-08',
    decidedRemarks: 'Verified duplicate by Accountant',
    documentType: 'Commercial Invoice',
  },
];

function setupHookMock(items: DuplicateFlagItem[] = mockFlaggedItems, isLoading = false, error: Error | null = null) {
  vi.spyOn(DuplicatesHookModule, 'useFlaggedDuplicates').mockReturnValue({
    items,
    total: items.length,
    isLoading,
    error,
    refetch: vi.fn(),
    page: 1,
    setPage: vi.fn(),
    pageSize: 10,
    setPageSize: vi.fn(),
    search: '',
    setSearch: vi.fn(),
    filter: '',
    setFilter: vi.fn(),
    statusFilter: '',
    setStatusFilter: vi.fn(),
    docTypeFilter: '',
    setDocTypeFilter: vi.fn(),
    decisionFilter: '',
    setDecisionFilter: vi.fn(),
    dateFrom: '',
    setDateFrom: vi.fn(),
    dateTo: '',
    setDateTo: vi.fn(),
    applyFilters: vi.fn(),
    resetFilters: vi.fn(),
    scope: 'all',
    lockedFilter: undefined,
  });
}

describe('Duplicate Detection — Four-Role Access, Routing & Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. HEAD ACCOUNTANT TESTS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Role 1: Head Accountant', () => {
    it('Sidebar has: Unique Documents, For Review, Review History. NO Duplicate Scan, NO Document Extraction.', () => {
      const groups = getNavGroups(ROLES.HEAD_ACCOUNTANT);
      const allItems = groups.flatMap((g) => g.items);
      const allKeys = allItems.map((i) => i.key);

      // Excluded globally
      expect(allKeys).not.toContain('duplicateScan');
      expect(allKeys).not.toContain('documentExtraction');

      // Duplicate Detection group
      const dupGroup = groups.find((g) => g.label === 'Duplicate Detection');
      expect(dupGroup).toBeDefined();
      const dupKeys = dupGroup!.items.map((i) => i.key);
      expect(dupKeys).toEqual(['uniqueDocuments', 'flaggedDuplicates', 'reviewHistory']);

      // Label for flaggedDuplicates is overridden to "For Review"
      const flaggedItem = dupGroup!.items.find((i) => i.key === 'flaggedDuplicates');
      expect(flaggedItem).toBeDefined();
      expect(moduleLabel(flaggedItem!, ROLES.HEAD_ACCOUNTANT)).toBe('For Review');
    });

    it('Typing /duplicate-scan renders 403 ForbiddenPage', () => {
      mockAuthUser({ role: ROLES.HEAD_ACCOUNTANT, email: 'ha@example.com', fullName: 'Head Accountant' });

      // Duplicate Scan -> 403
      const { unmount: unmountScan } = render(
        <MemoryRouter initialEntries={['/duplicate-scan']}>
          <RoleGuard module="duplicateScan">
            <div>Protected Duplicate Scan Page</div>
          </RoleGuard>
        </MemoryRouter>
      );
      expect(screen.queryByText('Protected Duplicate Scan Page')).toBeNull();
      expect(screen.getByText(/403 — Access denied/i)).toBeDefined();
      unmountScan();
    });

    it('Default landing / redirect lands on Dashboard (/dashboard), NOT Duplicate Scan', () => {
      expect(LANDING_PATH[ROLES.HEAD_ACCOUNTANT]).toBe('/dashboard');
      expect(LANDING_PATH[ROLES.HEAD_ACCOUNTANT]).not.toBe('/duplicate-scan');

      mockAuthUser({ role: ROLES.HEAD_ACCOUNTANT, email: 'ha@example.com', fullName: 'Head Accountant' });

      // Test redirect component matching App.tsx RoleHome
      const RoleHomeTest: React.FC = () => {
        const { user } = AuthContextModule.useAuth();
        return <Navigate to={user ? LANDING_PATH[user.role] : '/login'} replace />;
      };

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<RoleHomeTest />} />
            <Route path="/dashboard" element={<div>Head Accountant Dashboard Landing</div>} />
            <Route path="/duplicate-scan" element={<div>Forbidden Duplicate Scan</div>} />
          </Routes>
        </MemoryRouter>
      );
      expect(screen.getByText('Head Accountant Dashboard Landing')).toBeDefined();
      expect(screen.queryByText('Forbidden Duplicate Scan')).toBeNull();
    });

    it('"For Review" (/flagged-duplicates) page shows Approve and Return buttons for PENDING_REVIEW items', () => {
      mockAuthUser({ id: 'HA-001', employeeId: 'HA-001', role: ROLES.HEAD_ACCOUNTANT, email: 'ha@example.com', fullName: 'Head Accountant' });
      setupHookMock();

      render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );

      // On PENDING_REVIEW items (dup-3), Head Accountant sees Review, Approve, Return
      expect(screen.getByRole('button', { name: 'Review' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Approve' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Return' })).toBeDefined();

      // Does NOT see Level 1 decision buttons
      expect(screen.queryByRole('button', { name: 'Mark Real Duplicate' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Mark False Positive' })).toBeNull();
    });

    it('NO "Run scan", "Choose File", "Upload", or "Scan Document" button anywhere on any page for Head Accountant', () => {
      mockAuthUser({ id: 'HA-001', employeeId: 'HA-001', role: ROLES.HEAD_ACCOUNTANT, email: 'ha@example.com', fullName: 'Head Accountant' });

      // 1. Check permissions helper functions
      expect(canDo(ROLES.HEAD_ACCOUNTANT, 'duplicateScan', 'scan')).toBe(false);
      expect(canUploadDocuments(ROLES.HEAD_ACCOUNTANT)).toBe(false);
      expect(canCheckDuplicateInForm(ROLES.HEAD_ACCOUNTANT)).toBe(false);

      // 2. AIDuplicateScan page
      const { unmount: unmountScan } = render(
        <MemoryRouter>
          <AIDuplicateScan />
        </MemoryRouter>
      );
      expect(screen.queryByText('Choose File')).toBeNull();
      expect(screen.queryByText('Scan Document')).toBeNull();
      expect(screen.queryByText('Run Scan')).toBeNull();
      expect(screen.queryByText(/Drag & Drop or Upload Document/i)).toBeNull();
      expect(screen.getByText(/Read-Only Console/i)).toBeDefined();
      unmountScan();

      // 3. FlaggedDuplicates ("For Review") page
      setupHookMock();
      const { unmount: unmountFlags } = render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );
      expect(screen.queryByText(/Choose File/i)).toBeNull();
      expect(screen.queryByText(/Scan Document/i)).toBeNull();
      expect(screen.queryByText(/Run Scan/i)).toBeNull();
      expect(screen.queryByText(/Upload/i)).toBeNull();
      unmountFlags();

      // 4. UniqueDocuments page
      vi.spyOn(DuplicatesHookModule, 'useUniqueDocuments').mockReturnValue({
        items: [], total: 0, isLoading: false, error: null, refetch: vi.fn(),
        page: 1, setPage: vi.fn(), pageSize: 10, setPageSize: vi.fn(),
        search: '', setSearch: vi.fn(), filter: '', setFilter: vi.fn(),
        statusFilter: '', setStatusFilter: vi.fn(), docTypeFilter: '', setDocTypeFilter: vi.fn(),
        decisionFilter: '', setDecisionFilter: vi.fn(), dateFrom: '', setDateFrom: vi.fn(),
        dateTo: '', setDateTo: vi.fn(), applyFilters: vi.fn(), resetFilters: vi.fn(),
        scope: 'all', lockedFilter: undefined,
      });
      const { unmount: unmountUnique } = render(
        <MemoryRouter>
          <UniqueDocuments />
        </MemoryRouter>
      );
      expect(screen.queryByText(/Choose File/i)).toBeNull();
      expect(screen.queryByText(/Scan Document/i)).toBeNull();
      expect(screen.queryByText(/Run Scan/i)).toBeNull();
      unmountUnique();

      // 5. ReviewHistory page
      vi.spyOn(DuplicatesHookModule, 'useReviewHistory').mockReturnValue({
        items: [], total: 0, isLoading: false, error: null, refetch: vi.fn(),
        page: 1, setPage: vi.fn(), pageSize: 10, setPageSize: vi.fn(),
        search: '', setSearch: vi.fn(), filter: '', setFilter: vi.fn(),
        statusFilter: '', setStatusFilter: vi.fn(), docTypeFilter: '', setDocTypeFilter: vi.fn(),
        decisionFilter: '', setDecisionFilter: vi.fn(), dateFrom: '', setDateFrom: vi.fn(),
        dateTo: '', setDateTo: vi.fn(), applyFilters: vi.fn(), resetFilters: vi.fn(),
        scope: 'all', lockedFilter: undefined,
      });
      const { unmount: unmountHist } = render(
        <MemoryRouter>
          <ReviewHistory />
        </MemoryRouter>
      );
      expect(screen.queryByText(/Choose File/i)).toBeNull();
      expect(screen.queryByText(/Scan Document/i)).toBeNull();
      expect(screen.queryByText(/Run Scan/i)).toBeNull();
      unmountHist();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. ACCOUNTANT TESTS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Role 2: Accountant', () => {
    it('Sidebar has: Duplicate Scan, Unique Documents, Flagged, Review History, Document Extraction', () => {
      const groups = getNavGroups(ROLES.ACCOUNTANT);
      const allItems = groups.flatMap((g) => g.items);
      const allKeys = allItems.map((i) => i.key);

      expect(allKeys).toContain('duplicateScan');
      expect(allKeys).toContain('documentExtraction');

      const dupGroup = groups.find((g) => g.label === 'Duplicate Detection');
      expect(dupGroup).toBeDefined();
      const dupKeys = dupGroup!.items.map((i) => i.key);
      expect(dupKeys).toEqual(['duplicateScan', 'uniqueDocuments', 'flaggedDuplicates', 'reviewHistory']);

      const flaggedItem = dupGroup!.items.find((i) => i.key === 'flaggedDuplicates');
      expect(moduleLabel(flaggedItem!, ROLES.ACCOUNTANT)).toBe('Flagged');
    });

    it('Duplicate Scan has upload drop zone, "Run Scan", "Choose File"', () => {
      mockAuthUser({ role: ROLES.ACCOUNTANT, email: 'acc@example.com', fullName: 'Accountant User' });
      expect(canDo(ROLES.ACCOUNTANT, 'duplicateScan', 'scan')).toBe(true);

      render(
        <MemoryRouter>
          <AIDuplicateScan />
        </MemoryRouter>
      );

      expect(screen.getByText(/Drag & Drop or Upload Document/i)).toBeDefined();
      expect(screen.getByText('Choose File')).toBeDefined();
      expect(screen.getByText('Scan Document')).toBeDefined();
      expect(screen.queryByText(/Read-Only Console/i)).toBeNull();
    });

    it('Flagged Duplicates shows Mark Real Duplicate and Mark False Positive buttons, NO Approve, NO Return', () => {
      mockAuthUser({ id: 'ACC-001', employeeId: 'ACC-001', role: ROLES.ACCOUNTANT, email: 'acc@example.com', fullName: 'Accountant User' });
      setupHookMock();

      render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );

      // Level 1 actions are visible on FLAGGED items
      expect(screen.getByRole('button', { name: 'Mark Real Duplicate' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Mark False Positive' })).toBeDefined();

      // Level 2 supervisor buttons must NEVER appear for Accountant
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Return' })).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. FINANCIAL MANAGER & ASSISTANT FM TESTS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Role 3 & 4: Financial Manager & Assistant FM Access Table Verification', () => {
    it('Financial Manager: Duplicate Scan hidden, Unique Docs visible, Flagged hidden, Review History visible, Doc Extraction hidden', () => {
      const groups = getNavGroups(ROLES.FINANCIAL_MANAGER);
      const allKeys = groups.flatMap((g) => g.items).map((i) => i.key);

      expect(allKeys).not.toContain('duplicateScan');
      expect(allKeys).not.toContain('flaggedDuplicates');
      expect(allKeys).not.toContain('documentExtraction');
      expect(allKeys).toContain('uniqueDocuments');
      expect(allKeys).toContain('reviewHistory');

      const dupGroup = groups.find((g) => g.label === 'Duplicate Detection');
      expect(dupGroup).toBeDefined();
      expect(dupGroup!.items.map((i) => i.key)).toEqual(['uniqueDocuments', 'reviewHistory']);

      // 403 on hidden pages
      mockAuthUser({ role: ROLES.FINANCIAL_MANAGER, email: 'fm@example.com', fullName: 'Financial Manager' });

      const { unmount: u1 } = render(
        <MemoryRouter initialEntries={['/duplicate-scan']}>
          <RoleGuard module="duplicateScan"><div>FM Scan</div></RoleGuard>
        </MemoryRouter>
      );
      expect(screen.getByText(/403 — Access denied/i)).toBeDefined();
      u1();

      const { unmount: u2 } = render(
        <MemoryRouter initialEntries={['/flagged-duplicates']}>
          <RoleGuard module="flaggedDuplicates"><div>FM Flagged</div></RoleGuard>
        </MemoryRouter>
      );
      expect(screen.getByText(/403 — Access denied/i)).toBeDefined();
      u2();
    });

    it('Assistant FM: Duplicate Scan visible (liquidation), Unique Docs visible, Flagged visible, Review History visible', () => {
      const groups = getNavGroups(ROLES.ASSISTANT_FM);
      const allKeys = groups.flatMap((g) => g.items).map((i) => i.key);

      expect(allKeys).toContain('duplicateScan');
      expect(allKeys).toContain('uniqueDocuments');
      expect(allKeys).toContain('flaggedDuplicates');
      expect(allKeys).toContain('reviewHistory');
      expect(allKeys).not.toContain('documentExtraction');

      expect(getDuplicateScope(ROLES.ASSISTANT_FM)).toBe('liquidation');
      expect(canDo(ROLES.ASSISTANT_FM, 'duplicateScan', 'scan')).toBe(true);

      // Assistant FM can only decide on liquidation documents (dup-2), not commercial invoices (dup-1)
      mockAuthUser({ id: 'AFM-001', employeeId: 'AFM-001', role: ROLES.ASSISTANT_FM, email: 'afm@example.com', fullName: 'Asst FM' });
      setupHookMock();

      render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );

      expect(screen.getAllByRole('button', { name: 'Mark Real Duplicate' }).length).toBe(1);
      expect(screen.getAllByRole('button', { name: 'Mark False Positive' }).length).toBe(1);
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Return' })).toBeNull();
    });

    it('renders Sidebar per role using API user supplied by MSW', async () => {
      let currentMockRole: string = ROLES.HEAD_ACCOUNTANT;

      const server = setupServer(
        http.get('*/auth/me', () => {
          return HttpResponse.json({
            id: 'USER-001',
            fullName: 'Current User',
            role: currentMockRole,
            email: 'user@example.com',
          });
        }),
        http.get('*/dashboard/nav-badges', () => {
          return HttpResponse.json({});
        })
      );

      server.listen({ onUnhandledRequest: 'bypass' });

      try {
        // 1. Head Accountant: Unique Documents, For Review, Review History. NO Duplicate Scan, NO Document Extraction.
        currentMockRole = ROLES.HEAD_ACCOUNTANT;
        mockAuthUser({ role: ROLES.HEAD_ACCOUNTANT, fullName: 'Head Accountant' });
        const { unmount: unmountHA } = render(
          <MemoryRouter>
            <Sidebar />
          </MemoryRouter>
        );
        expect(screen.queryByText('Duplicate Scan')).toBeNull();
        expect(screen.queryByText('Document Extraction')).toBeNull();
        expect(screen.getByText('Unique Documents')).toBeDefined();
        expect(screen.getByText('For Review')).toBeDefined();
        expect(screen.getByText('Review History')).toBeDefined();
        unmountHA();

        // 2. Accountant: Duplicate Scan, Unique Documents, Flagged, Review History, Document Extraction.
        currentMockRole = ROLES.ACCOUNTANT;
        mockAuthUser({ role: ROLES.ACCOUNTANT, fullName: 'Accountant' });
        const { unmount: unmountACC } = render(
          <MemoryRouter>
            <Sidebar />
          </MemoryRouter>
        );
        expect(screen.getByText('Duplicate Scan')).toBeDefined();
        expect(screen.getByText('Unique Documents')).toBeDefined();
        expect(screen.getByText('Flagged')).toBeDefined();
        expect(screen.getByText('Review History')).toBeDefined();
        expect(screen.getByText('Document Extraction')).toBeDefined();
        unmountACC();

        // 3. Financial Manager: Duplicate Scan is HIDDEN; Flagged Duplicates is HIDDEN; Document Extraction is HIDDEN
        currentMockRole = ROLES.FINANCIAL_MANAGER;
        mockAuthUser({ role: ROLES.FINANCIAL_MANAGER, fullName: 'Finance Manager' });
        const { unmount: unmountFM } = render(
          <MemoryRouter>
            <Sidebar />
          </MemoryRouter>
        );
        expect(screen.queryByText('Duplicate Scan')).toBeNull();
        expect(screen.queryByText('Flagged Duplicates')).toBeNull();
        expect(screen.queryByText('Document Extraction')).toBeNull();
        expect(screen.getByText('Unique Documents')).toBeDefined();
        expect(screen.getByText('Review History')).toBeDefined();
        unmountFM();

        // 4. Assistant FM: Duplicate Scan, Unique Documents, Flagged Duplicates, Review History, Document Extraction
        currentMockRole = ROLES.ASSISTANT_FM;
        mockAuthUser({ role: ROLES.ASSISTANT_FM, fullName: 'Assistant FM' });
        const { unmount: unmountAFM } = render(
          <MemoryRouter>
            <Sidebar />
          </MemoryRouter>
        );
        expect(screen.getByText('Duplicate Scan')).toBeDefined();
        expect(screen.getByText('Unique Documents')).toBeDefined();
        expect(screen.getByText('Flagged Duplicates')).toBeDefined();
        expect(screen.getByText('Review History')).toBeDefined();
        expect(screen.getByText('Document Extraction')).toBeDefined();
        unmountAFM();
      } finally {
        server.close();
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. END-TO-END DUPLICATE FLOW (Level 1 Mark -> Level 2 Approve)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Flow 4: End-to-End Duplicate Workflow (Accountant Marks -> Head Accountant Approves)', () => {
    it('executes full flow: Accountant marks duplicate -> advances to PENDING_REVIEW -> Head Accountant approves -> CONFIRMED_DUPLICATE', async () => {
      // Step A: Accountant marks duplicate
      mockAuthUser({ id: 'ACC-100', employeeId: 'ACC-100', role: ROLES.ACCOUNTANT, fullName: 'Alice Accountant' });
      setupHookMock();

      const { unmount: unmountAcc } = render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Mark Real Duplicate' }));
      expect(screen.getByText(/Mark Real Duplicate — FLG-1001/i)).toBeDefined();

      const modalSubmitBtn = screen.getAllByRole('button', { name: 'Mark Real Duplicate' })[1];
      const remarksArea = screen.getByPlaceholderText(/Explain why this record is confirmed as a duplicate/i);
      fireEvent.change(remarksArea, { target: { value: 'Verified duplicate matching Invoice #INV-2026-004.' } });
      fireEvent.click(modalSubmitBtn);

      await waitFor(() => {
        expect(duplicatesService.decideDuplicate).toHaveBeenCalledWith(
          'dup-1',
          expect.objectContaining({
            decision: 'DUPLICATE',
            remarks: 'Verified duplicate matching Invoice #INV-2026-004.',
            reviewer: 'Alice Accountant',
          })
        );
      });
      unmountAcc();

      // State Transition check: mark_duplicate -> PENDING_REVIEW
      const transitionStatus = getNextDuplicateStatus('mark_duplicate');
      expect(transitionStatus).toBe('PENDING_REVIEW');

      // Step B: Head Accountant reviews and approves in For Review
      mockAuthUser({ id: 'HA-200', employeeId: 'HA-200', role: ROLES.HEAD_ACCOUNTANT, fullName: 'Harold Head Acct' });
      
      const pendingItem: DuplicateFlagItem = {
        ...mockFlaggedItems[0],
        status: 'PENDING_REVIEW',
        decision: 'DUPLICATE',
        decidedBy: 'ACC-100',
        decidedRemarks: 'Verified duplicate matching Invoice #INV-2026-004.',
      };
      setupHookMock([pendingItem]);

      const { unmount: unmountHA } = render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );

      // Head Accountant sees item in For Review and clicks Approve
      const approveBtn = screen.getByRole('button', { name: 'Approve' });
      fireEvent.click(approveBtn);

      expect(screen.getByText(/Approve Decision — FLG-1001/i)).toBeDefined();
      const modalApproveBtn = screen.getAllByRole('button', { name: 'Approve' })[1];
      const approvalNotes = screen.getByPlaceholderText(/Optional approval notes/i);
      fireEvent.change(approvalNotes, { target: { value: 'Confirmed by supervisor.' } });
      fireEvent.click(modalApproveBtn);

      await waitFor(() => {
        expect(duplicatesService.reviewDecision).toHaveBeenCalledWith(
          'dup-1',
          expect.objectContaining({
            action: 'APPROVE',
            reviewer: 'Harold Head Acct',
            remarks: 'Confirmed by supervisor.',
          })
        );
      });

      // Final State Transition: approve on DUPLICATE -> APPROVED_DUPLICATE
      const finalStatus = getNextDuplicateStatus('approve', 'DUPLICATE');
      expect(finalStatus).toBe('APPROVED_DUPLICATE');
      unmountHA();
    });

    it('prevents Head Accountant from approving their own decision (Separation of Duties)', () => {
      mockAuthUser({ id: 'USER-SAME', employeeId: 'USER-SAME', role: ROLES.HEAD_ACCOUNTANT, fullName: 'Self Reviewer' });
      
      const itemDecidedBySameUser: DuplicateFlagItem = {
        ...mockFlaggedItems[2],
        decidedBy: 'USER-SAME',
      };
      setupHookMock([itemDecidedBySameUser]);

      render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );

      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      expect(screen.getByText('Cannot Self-Approve')).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. RETURN FLOW (Level 1 Mark -> Level 2 Return with Note -> Re-decision)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Flow 5: Return Flow (Head Accountant Returns with Note -> Accountant Re-examines)', () => {
    it('executes return flow: Head Accountant returns with note -> advances to RETURNED -> Accountant sees it returned and can re-decide', async () => {
      // Step A: Head Accountant returns pending item to Accountant with required justification note
      mockAuthUser({ id: 'HA-200', employeeId: 'HA-200', role: ROLES.HEAD_ACCOUNTANT, fullName: 'Harold Head Acct' });
      setupHookMock();

      const { unmount: unmountHA } = render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );

      const returnBtn = screen.getByRole('button', { name: 'Return' });
      fireEvent.click(returnBtn);

      expect(screen.getByText(/Return to Accountant — FLG-1003/i)).toBeDefined();

      const modalReturnSubmitBtn = screen.getAllByRole('button', { name: 'Return' })[1];
      // Validate note is required
      fireEvent.click(modalReturnSubmitBtn);
      expect(screen.getByText(/Remarks and justification are required/i)).toBeDefined();
      expect(duplicatesService.reviewDecision).not.toHaveBeenCalled();

      // Enter return justification
      const textarea = screen.getByPlaceholderText(/Explain why the decision is returned/i);
      fireEvent.change(textarea, { target: { value: 'Waybill attachments show differing delivery dates. Please check again.' } });
      fireEvent.click(modalReturnSubmitBtn);

      await waitFor(() => {
        expect(duplicatesService.reviewDecision).toHaveBeenCalledWith(
          'dup-3',
          expect.objectContaining({
            action: 'RETURN',
            remarks: 'Waybill attachments show differing delivery dates. Please check again.',
            reviewer: 'Harold Head Acct',
          })
        );
      });
      unmountHA();

      // Status Transition check: return -> RETURNED
      const returnedStatus = getNextDuplicateStatus('return');
      expect(returnedStatus).toBe('RETURNED');

      // Step B: Accountant views returned record and has decision actions available again
      mockAuthUser({ id: 'ACC-100', employeeId: 'ACC-100', role: ROLES.ACCOUNTANT, fullName: 'Alice Accountant' });
      
      const returnedItem: DuplicateFlagItem = {
        ...mockFlaggedItems[2],
        status: 'RETURNED',
        decidedRemarks: 'Waybill attachments show differing delivery dates. Please check again.',
      };
      setupHookMock([returnedItem]);

      const { unmount: unmountAcc } = render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );

      // Accountant can decide on RETURNED status
      expect(canDecideDuplicate(ROLES.ACCOUNTANT, 'RETURNED')).toBe(true);
      expect(screen.getByRole('button', { name: 'Mark Real Duplicate' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Mark False Positive' })).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Return' })).toBeNull();
      unmountAcc();
    });
  });
});
