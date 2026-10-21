import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { ROLES, type User } from '../types/auth';
import { getNavGroups, moduleLabel } from '../utils/roleAccess';
import { Sidebar } from '../components/Sidebar';
import { RejectModal } from '../components/approvals/RejectModal';
import { ApprovalDetailDrawer } from '../components/approvals/ApprovalDetailDrawer';
import { ToastProvider } from '../components/ToastContext';
import * as AuthContextModule from '../context/AuthContext';
import { MyCashAdvances } from '../pages/MyCashAdvances';

// ── Test-only Mock Data Fixtures (Isolated to this test file only) ─────────────
const testAccountantUser: User = {
  id: 'USER-ACC-001',
  employeeId: 'EMP-ACC-001',
  fullName: 'Alice Accountant',
  role: ROLES.ACCOUNTANT,
  email: 'alice@foms.local',
};

const testAsstFmUser: User = {
  id: 'USER-AFM-001',
  employeeId: 'EMP-AFM-001',
  fullName: 'Aaron AsstFM',
  role: ROLES.ASSISTANT_FM,
  email: 'aaron@foms.local',
};

const testFmUser: User = {
  id: 'USER-FM-001',
  employeeId: 'EMP-FM-001',
  fullName: 'Fiona FinanceManager',
  role: ROLES.FINANCIAL_MANAGER,
  email: 'fiona@foms.local',
};

const testApprovalRequest = {
  id: 'REQ-001',
  entityType: 'Payment',
  entityId: 'PAY-1001',
  referenceNo: 'PAY-2026-001',
  amount: 85000,
  requestedBy: 'Alice Accountant',
  requestedById: 'USER-ACC-001',
  currentLevel: 'AssistantFinanceManager',
  status: 'Submitted',
  createdAt: new Date().toISOString(),
  purpose: 'Logistics fulfillment fuel budget',
  isEscalated: true,
  escalationThreshold: 50000,
};

const testHistorySteps = [
  {
    level: 'Accountant',
    approverName: 'Alice Accountant',
    action: 'Submitted',
    remarks: 'Initial payment creation',
    actedAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

const testCashAdvances = [
  {
    id: 'CA-001',
    referenceNo: 'CA-2026-001',
    amount: 15000,
    purpose: 'Emergency fleet repair tools',
    dateNeeded: '2026-11-01',
    requestedBy: 'Alice Accountant',
    requestedById: 'USER-ACC-001',
    status: 'Draft',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'CA-002',
    referenceNo: 'CA-2026-002',
    amount: 45000,
    purpose: 'Out of town route allowance',
    dateNeeded: '2026-11-05',
    requestedBy: 'Alice Accountant',
    requestedById: 'USER-ACC-001',
    status: 'ReturnedForRevision',
    rejectionReason: 'Receipts quotation lacking official BIR receipt breakdown.',
    createdAt: new Date().toISOString(),
  },
];

const testSelfApprovalRequest = {
  ...testApprovalRequest,
  id: 'REQ-SELF-001',
  requestedBy: 'Aaron AsstFM',
  requestedById: 'USER-AFM-001',
};

// ── MSW Test Server Setup ───────────────────────────────────────────────────
const server = setupServer(
  http.get(/.*\/approvals\/counts/, () =>
    HttpResponse.json({
      pendingCount: 5,
      pendingMyApproval: 5,
      approvedToday: 3,
      escalatedToFm: 2,
      approvedThisMonth: 12,
    })
  ),
  http.get(/.*\/approvals\/pending/, () =>
    HttpResponse.json({
      items: [testApprovalRequest],
      total: 1,
    })
  ),
  http.get(/.*\/approvals\/REQ-SELF-001$/, () => HttpResponse.json(testSelfApprovalRequest)),
  http.get(/.*\/approvals\/[^/]+\/history/, () => HttpResponse.json(testHistorySteps)),
  http.get(/.*\/approvals\/[^/]+$/, () => HttpResponse.json(testApprovalRequest)),
  http.post(/.*\/approvals\/[^/]+\/approve/, () => HttpResponse.json({ success: true })),
  http.post(/.*\/approvals\/[^/]+\/reject/, () => HttpResponse.json({ success: true })),
  http.get(/.*\/cash-advances\/mine/, () => HttpResponse.json(testCashAdvances)),
  http.post(/.*\/cash-advances$/, () => HttpResponse.json({ ...testCashAdvances[0], id: 'CA-003' })),
  http.put(/.*\/cash-advances\/[^/]+$/, () => HttpResponse.json(testCashAdvances[0])),
  http.post(/.*\/approvals\/CashAdvance\/[^/]+\/submit/, () => HttpResponse.json({ success: true }))
);

function mockAuth(user: User | null) {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user,
    isLoading: false,
    isAuthenticated: !!user,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe('Multi-Level Approvals Workflow — Component & Role Tests', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  // ── 1. Role-Based Menu Visibility ─────────────────────────────────────────
  describe('1. Role-based Menu Visibility in Sidebar', () => {
    it('Accountant sees "My Cash Advances" and NO "Cash Advance Approvals" or approver menus', async () => {
      mockAuth(testAccountantUser);
      const groups = getNavGroups(ROLES.ACCOUNTANT);
      const allLabels = groups.flatMap((g) => g.items.map((i) => moduleLabel(i, ROLES.ACCOUNTANT)));

      expect(allLabels).toContain('My Cash Advances');
      expect(allLabels).not.toContain('Cash Advance Approvals');
      expect(allLabels).not.toContain('Approvals');
      expect(allLabels).not.toContain('Escalated Approvals');

      render(
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('My Cash Advances')).toBeDefined();
      expect(screen.queryByText('Cash Advance Approvals')).toBeNull();
      expect(screen.queryByText('Escalated Approvals')).toBeNull();
    });

    it('Assistant Finance Manager sees "Approvals" and displays pending badge count', async () => {
      mockAuth(testAsstFmUser);
      const groups = getNavGroups(ROLES.ASSISTANT_FM);
      const allLabels = groups.flatMap((g) => g.items.map((i) => moduleLabel(i, ROLES.ASSISTANT_FM)));

      expect(allLabels).toContain('Approvals');
      expect(allLabels).not.toContain('Escalated Approvals');
      expect(allLabels).not.toContain('My Cash Advances');

      render(
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getAllByText('Approvals').length).toBeGreaterThan(0);
      expect(screen.queryByText('Escalated Approvals')).toBeNull();

      // Check pending badge count fetched from API
      await waitFor(() => {
        expect(screen.getByLabelText('5 pending')).toBeDefined();
      });
    });

    it('Finance Manager sees "Escalated Approvals" and displays pending badge count', async () => {
      mockAuth(testFmUser);
      const groups = getNavGroups(ROLES.FINANCIAL_MANAGER);
      const allLabels = groups.flatMap((g) => g.items.map((i) => moduleLabel(i, ROLES.FINANCIAL_MANAGER)));

      expect(allLabels).toContain('Escalated Approvals');
      expect(allLabels).not.toContain('My Cash Advances');

      render(
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('Escalated Approvals')).toBeDefined();

      // Check pending badge count fetched from API
      await waitFor(() => {
        expect(screen.getByLabelText('2 pending')).toBeDefined();
      });
    });
  });

  // ── 2. Hidden Approve Buttons for Accountant ──────────────────────────────
  describe('2. Hidden Approve / Reject Buttons for Accountant', () => {
    it('Accountant record screen (MyCashAdvances) renders Create, Edit, Submit, but NO Approve or Reject buttons', async () => {
      mockAuth(testAccountantUser);

      render(
        <MemoryRouter>
          <ToastProvider>
            <MyCashAdvances />
          </ToastProvider>
        </MemoryRouter>
      );

      // Wait for table to load
      await waitFor(() => {
        expect(screen.getByText('CA-2026-001')).toBeDefined();
      });

      // Shows Request button and Edit/Submit buttons for draft
      expect(screen.getByText('Request Cash Advance')).toBeDefined();
      expect(screen.getAllByText('Edit').length).toBeGreaterThan(0);
      expect(screen.getByText('Submit')).toBeDefined();

      // Returned record shows rejection reason banner
      expect(screen.getByText('Resubmit')).toBeDefined();
      expect(screen.getByText(/Receipts quotation lacking official BIR receipt breakdown/)).toBeDefined();

      // STRICTLY NO Approve or Reject buttons exist on Accountant screen
      expect(screen.queryByText('Approve')).toBeNull();
      expect(screen.queryByText('Reject')).toBeNull();
      expect(screen.queryByText('Confirm Approve')).toBeNull();
    });
  });

  // ── 3. Self-Approval Guard ────────────────────────────────────────────────
  describe('3. Self-Approval Guard in Detail Drawer', () => {
    it('disables Approve and Reject buttons when logged-in user is the requester with explanatory tooltip', async () => {
      // User is Aaron AsstFM who requested REQ-SELF-001
      mockAuth(testAsstFmUser);

      render(
        <MemoryRouter>
          <ToastProvider>
            <ApprovalDetailDrawer
              isOpen={true}
              requestId="REQ-SELF-001"
              onClose={vi.fn()}
            />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('PAY-2026-001').length).toBeGreaterThan(0);
      });

      // Self-approval warning banner is rendered
      expect(
        screen.getByText(/You cannot approve or reject this request because you submitted it/)
      ).toBeDefined();

      // Buttons are rendered but disabled with explanatory title/tooltip
      const actionBtn = screen.getByRole('button', { name: /(Approve|Escalate)/i });
      const rejectBtn = screen.getByRole('button', { name: /Reject/i });
      expect(actionBtn.hasAttribute('disabled')).toBe(true);
      expect(rejectBtn.hasAttribute('disabled')).toBe(true);
      expect(actionBtn.getAttribute('title')).toContain('You cannot act on your own request');
      expect(rejectBtn.getAttribute('title')).toContain('You cannot act on your own request');

      // Escalation notice is also displayed because isEscalated === true
      expect(screen.getByText('High-Value Escalation Notice')).toBeDefined();
      expect(screen.getByText(/exceeds threshold of/)).toBeDefined();
    });

    it('enforces escalation for Assistant FM on high-value transactions and enables actions for Financial Manager', async () => {
      // User is Aaron AsstFM (not the requester Alice, but high-value transaction exceeds threshold)
      mockAuth(testAsstFmUser);

      const { unmount } = render(
        <MemoryRouter>
          <ToastProvider>
            <ApprovalDetailDrawer
              isOpen={true}
              requestId="REQ-001"
              onClose={vi.fn()}
            />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('PAY-2026-001').length).toBeGreaterThan(0);
      });

      // Assistant FM must see Escalate button, not final Approve button
      const escalateBtn = screen.getByRole('button', { name: /Escalate to Financial Manager/i });
      const rejectBtn = screen.getByRole('button', { name: /Reject/i });
      expect(escalateBtn).toBeDefined();
      expect(rejectBtn).toBeDefined();
      expect(screen.queryByRole('button', { name: /^Approve$/i })).toBeNull();

      unmount();

      // Now Financial Manager views the transaction - final Approve must be available
      mockAuth(testFmUser);
      render(
        <MemoryRouter>
          <ToastProvider>
            <ApprovalDetailDrawer
              isOpen={true}
              requestId="REQ-001"
              onClose={vi.fn()}
            />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('PAY-2026-001').length).toBeGreaterThan(0);
      });

      const fmApproveBtn = screen.getByRole('button', { name: /^Approve$/i });
      expect(fmApproveBtn).toBeDefined();
      expect(fmApproveBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  // ── 4. Reject Modal Validation ────────────────────────────────────────────
  describe('4. Reject Modal Validation & Keyboard Accessibility', () => {
    it('enforces minimum 10 characters before allowing submit', () => {
      const handleConfirm = vi.fn();
      const handleClose = vi.fn();

      render(
        <RejectModal
          isOpen={true}
          referenceNo="PAY-2026-001"
          onClose={handleClose}
          onConfirm={handleConfirm}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /Reject & Return/i });
      const textarea = screen.getByPlaceholderText(/minimum 10 characters/i);

      // Initially empty -> button is disabled
      expect(submitBtn.hasAttribute('disabled')).toBe(true);

      // Type 4 characters -> still disabled
      fireEvent.change(textarea, { target: { value: 'Bad!' } });
      expect(submitBtn.hasAttribute('disabled')).toBe(true);
      expect(screen.getByText('4/10 min chars')).toBeDefined();

      // Type 15 characters -> valid -> enabled
      fireEvent.change(textarea, { target: { value: 'Invalid receipt attached for item' } });
      expect(submitBtn.hasAttribute('disabled')).toBe(false);
      expect(screen.getByText('33/10 min chars')).toBeDefined();

      // Submit executes callback with trimmed reason
      fireEvent.click(submitBtn);
      expect(handleConfirm).toHaveBeenCalledWith('Invalid receipt attached for item');
    });

    it('pressing Escape key triggers onClose when not submitting', () => {
      const handleClose = vi.fn();

      render(
        <RejectModal
          isOpen={true}
          referenceNo="PAY-2026-001"
          onClose={handleClose}
          onConfirm={vi.fn()}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
