import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ApprovalsQueue } from '../pages/ApprovalsQueue';
import { ToastProvider } from '../components/ToastContext';
import * as AuthContextModule from '../context/AuthContext';
import { ROLES, type User } from '../types/auth';

const testFmUser: User = {
  id: 'USER-FM-001',
  employeeId: 'EMP-FM-001',
  fullName: 'Fiona FinanceManager',
  role: ROLES.FINANCIAL_MANAGER,
  email: 'fiona@foms.local',
};

const mockItems = [
  {
    id: 'REQ-001',
    entityType: 'CashOutflow',
    entityId: 'CO-101',
    referenceNo: 'CO-2026-001',
    amount: 150000,
    requestedBy: 'Alice Accountant',
    currentLevel: 'FinanceManager',
    status: 'PendingFinanceManager',
    createdAt: new Date().toISOString(),
    purpose: 'Quarterly warehouse lease deposit',
    isEscalated: true,
  },
  {
    id: 'REQ-002',
    entityType: 'CashOutflow',
    entityId: 'CO-102',
    referenceNo: 'CO-2026-002',
    amount: 80000,
    requestedBy: 'Bob Accountant',
    currentLevel: 'FinanceManager',
    status: 'Approved',
    createdAt: new Date().toISOString(),
    purpose: 'Generator maintenance',
    isEscalated: true,
  },
  {
    id: 'REQ-003',
    entityType: 'CashOutflow',
    entityId: 'CO-103',
    referenceNo: 'CO-2026-003',
    amount: 120000,
    requestedBy: 'Charlie Accountant',
    currentLevel: 'FinanceManager',
    status: 'ReturnedForRevision',
    createdAt: new Date().toISOString(),
    purpose: 'Vendor retainer',
    isEscalated: true,
  },
];

const server = setupServer(
  http.get(/.*\/financial-manager\/escalated-approvals/, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    if (status && status !== 'ALL') {
      const filtered = mockItems.filter((i) => i.status === status);
      return HttpResponse.json({ items: filtered, total: filtered.length });
    }
    return HttpResponse.json({ items: mockItems, total: mockItems.length });
  }),
  http.get(/.*\/approvals\/pending/, () => {
    return HttpResponse.json({ items: mockItems, total: mockItems.length });
  })
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

describe('ApprovalsQueue — Status Filter & View Modes (Cards & Table)', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => {
    server.resetHandlers();
    localStorage.clear();
  });
  afterAll(() => server.close());

  it('allows clicking and persisting "All Statuses" without reverting to "Pending FM"', async () => {
    mockAuth(testFmUser);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/escalated-approvals']}>
          <Routes>
            <Route path="/escalated-approvals" element={<ApprovalsQueue mode="escalated" />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    // Initial render defaults to "Pending FM"
    const statusSelect = (await screen.findByTestId('filter-status-select')) as HTMLSelectElement;
    await waitFor(() => {
      expect(statusSelect.value).toBe('PendingFinanceManager');
    });

    // Select "All Statuses" (value 'ALL')
    fireEvent.change(statusSelect, { target: { value: 'ALL' } });

    // The select value must remain 'ALL' (not revert to 'PendingFinanceManager')
    await waitFor(() => {
      expect(statusSelect.value).toBe('ALL');
    });

    // All items should be displayed
    await waitFor(() => {
      expect(screen.getByText('CO-2026-001')).toBeDefined();
      expect(screen.getByText('CO-2026-002')).toBeDefined();
      expect(screen.getByText('CO-2026-003')).toBeDefined();
    });
  });

  it('renders Cards view by default and toggles to Table view when clicked', async () => {
    mockAuth(testFmUser);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/escalated-approvals?status=ALL']}>
          <Routes>
            <Route path="/escalated-approvals" element={<ApprovalsQueue mode="escalated" />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('CO-2026-001')).toBeDefined();
    });

    // Default view is Cards: review button with "Review Details" exists
    expect(screen.getAllByText(/Review Details/i).length).toBeGreaterThan(0);
    // Table element does not exist initially in cards mode
    expect(screen.queryByTestId('approvals-table')).toBeNull();

    // Click "Table" toggle button
    const tableToggleBtn = screen.getByTestId('view-table-btn');
    fireEvent.click(tableToggleBtn);

    // Now table view is active
    await waitFor(() => {
      expect(screen.getByTestId('approvals-table')).toBeDefined();
      expect(screen.getByText(/Reference No\./i)).toBeDefined();
      expect(screen.getByText(/Amount \(PHP\)/i)).toBeDefined();
    });

    // Click "Cards" toggle button to return to cards view
    const cardsToggleBtn = screen.getByTestId('view-cards-btn');
    fireEvent.click(cardsToggleBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('approvals-table')).toBeNull();
      expect(screen.getAllByText(/Review Details/i).length).toBeGreaterThan(0);
    });
  });

  it('provides quick "View All Statuses" button on empty state when filtered by Pending FM', async () => {
    mockAuth(testFmUser);

    // Mock response containing only non-pending items (Approved & Returned)
    const nonPendingItems = mockItems.filter((i) => i.status !== 'PendingFinanceManager');
    server.use(
      http.get(/.*\/financial-manager\/escalated-approvals/, () => {
        return HttpResponse.json({ items: nonPendingItems, total: nonPendingItems.length });
      })
    );

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/escalated-approvals?status=PendingFinanceManager']}>
          <Routes>
            <Route path="/escalated-approvals" element={<ApprovalsQueue mode="escalated" />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    // Empty state should be visible
    await waitFor(() => {
      expect(screen.getByText('No Pending Approvals Found')).toBeDefined();
    });

    const viewAllBtn = screen.getByRole('button', { name: /View All Statuses/i });
    expect(viewAllBtn).toBeDefined();

    // Click "View All Statuses"
    fireEvent.click(viewAllBtn);

    // Status is now ALL and all records are shown
    await waitFor(() => {
      expect(screen.getByText('CO-2026-002')).toBeDefined();
    });
  });
});
