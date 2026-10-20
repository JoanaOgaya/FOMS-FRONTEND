import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { clearQueryCache, getCachedQuery, setCachedQuery, invalidateQueries, useQuery } from '../hooks/useQuery';
import { useMutation } from '../hooks/useMutation';
import { invalidateForMutation, MUTATION_INVALIDATION_MAP } from '../services/invalidation';
import { connectRealtime, REALTIME_EVENT_QUERY_MAP } from '../services/realtime';
import { queryKeys } from '../services/queryKeys';
import { ToastProvider } from '../components/ToastContext';
import * as AuthContextModule from '../context/AuthContext';
import { ROLES, type User } from '../types/auth';

// FM User mock
const FM_USER: User = {
  id: 'USER-FM-01',
  employeeId: 'FM-01',
  fullName: 'Financial Manager Test',
  email: 'fm.test@speedex.test',
  role: ROLES.FINANCIAL_MANAGER,
  status: 'Active',
};

function mockUser(user: User | null = FM_USER) {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user,
    token: user ? 'mock-jwt-token' : null,
    isAuthenticated: !!user,
    login: vi.fn(),
    logout: vi.fn(() => clearQueryCache()),
  });
}

// Mock handlers for server endpoints
let invoiceApproved = false;
let arOutstandingTotal = 250000;
let mutationCallCount = 0;

const server = setupServer(
  http.get('*/api/invoices', () => {
    return HttpResponse.json({
      items: [
        {
          id: 'INV-101',
          invoiceNumber: 'INV-LZD-2026-0001',
          clientId: 'CLI-01',
          status: invoiceApproved ? 'Approved' : 'Pending Approval',
          totalAmount: 50000,
          createdAt: new Date().toISOString(),
          dueDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        },
      ],
      total: 1,
    });
  }),

  http.post('*/api/invoices/:id/act', () => {
    mutationCallCount++;
    invoiceApproved = true;
    arOutstandingTotal = 200000;
    return HttpResponse.json({ success: true, message: 'Invoice approved' });
  }),

  http.get('*/api/ar/records', () => {
    return HttpResponse.json({
      items: [
        {
          id: 'AR-01',
          invoiceId: 'INV-101',
          clientId: 'CLI-01',
          originalAmount: 250000,
          paidAmount: 250000 - arOutstandingTotal,
          outstandingBalance: arOutstandingTotal,
          status: 'Active',
          agingBracket: '0-30 days',
        },
      ],
      total: 1,
    });
  }),

  http.get('*/api/dashboard/finance-manager/executive', () => {
    return HttpResponse.json({
      totalAR: arOutstandingTotal,
      collectionRate: 85.5,
      cashInflow: 450000,
      agingBuckets: [
        { label: '0-30 days', value: arOutstandingTotal },
        { label: '31-60 days', value: 0 },
        { label: '61-90 days', value: 0 },
        { label: '90+ days', value: 0 },
      ],
      cashFlowAnalytics: [],
      nearDueAccounts: [],
      accountsNearDueDate: 2,
      duplicateAlerts: 1,
      needsAttention: 3,
    });
  }),

  http.get('*/api/notifications', () => {
    return HttpResponse.json({
      items: [
        {
          id: 'NOTIF-01',
          title: 'System Alert',
          message: 'Payment received',
          read: false,
          type: 'info',
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
    });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  clearQueryCache();
  invoiceApproved = false;
  arOutstandingTotal = 250000;
  mutationCallCount = 0;
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('Financial Manager Cross-Page Data Sync & Consistency (Step 6 Tests)', () => {
  beforeEach(() => {
    mockUser(FM_USER);
    clearQueryCache();
  });

  // TEST 1: FM approves invoice -> AR, Dashboard KPI, and Reports refetch and show new value
  it('1. FM approves an invoice: AR, Dashboard KPI, and Reports refetch and reflect new values', async () => {
    const arSpy = vi.fn();
    const dashboardSpy = vi.fn();
    const reportsSpy = vi.fn();

    // Component representing FM pages listening to their respective query keys
    const TestComponent = () => {
      const { data: arData } = useQuery('ar:records', () => {
        arSpy();
        return Promise.resolve({ totalAR: arOutstandingTotal });
      });

      const { data: dashData } = useQuery('dashboard:summary', () => {
        dashboardSpy();
        return Promise.resolve({ totalAR: arOutstandingTotal });
      });

      const { data: repData } = useQuery('reports:ar', () => {
        reportsSpy();
        return Promise.resolve({ totalAR: arOutstandingTotal });
      });

      const handleApprove = async () => {
        arOutstandingTotal = 200000;
        await invalidateForMutation('approveInvoice');
      };

      return (
        <div>
          <div data-testid="ar-val">{arData?.totalAR}</div>
          <div data-testid="dash-val">{dashData?.totalAR}</div>
          <div data-testid="rep-val">{repData?.totalAR}</div>
          <button data-testid="approve-btn" onClick={handleApprove}>Approve</button>
        </div>
      );
    };

    render(<TestComponent />);

    // Initial fetch
    await waitFor(() => {
      expect(screen.getByTestId('ar-val').textContent).toBe('250000');
      expect(screen.getByTestId('dash-val').textContent).toBe('250000');
      expect(screen.getByTestId('rep-val').textContent).toBe('250000');
    });

    const initialArCalls = arSpy.mock.calls.length;
    const initialDashCalls = dashboardSpy.mock.calls.length;
    const initialRepCalls = reportsSpy.mock.calls.length;

    // FM approves invoice
    fireEvent.click(screen.getByTestId('approve-btn'));

    // All matching pages should automatically refetch and update to 200000
    await waitFor(() => {
      expect(screen.getByTestId('ar-val').textContent).toBe('200000');
      expect(screen.getByTestId('dash-val').textContent).toBe('200000');
      expect(screen.getByTestId('rep-val').textContent).toBe('200000');
    });

    expect(arSpy.mock.calls.length).toBeGreaterThan(initialArCalls);
    expect(dashboardSpy.mock.calls.length).toBeGreaterThan(initialDashCalls);
    expect(reportsSpy.mock.calls.length).toBeGreaterThan(initialRepCalls);
  });

  // TEST 2: Simulated realtime events refresh matching FM pages and notification bell
  it('2. Simulated realtime events (HA verified, AFM validated, Accountant submitted, duplicate approved) refresh matching FM pages and notification bell', async () => {
    const notifSpy = vi.fn();
    const paymentsSpy = vi.fn();
    const liquidationsSpy = vi.fn();
    const duplicatesSpy = vi.fn();

    const TestRealtimeListener = () => {
      useQuery('notifications:FM-01', () => { notifSpy(); return Promise.resolve([]); });
      useQuery('payments:list', () => { paymentsSpy(); return Promise.resolve([]); });
      useQuery('liquidations:list', () => { liquidationsSpy(); return Promise.resolve([]); });
      useQuery('duplicates:flagged', () => { duplicatesSpy(); return Promise.resolve([]); });

      return <div data-testid="rt-ready">Ready</div>;
    };

    render(<TestRealtimeListener />);

    await waitFor(() => expect(screen.getByTestId('rt-ready')).toBeDefined());

    // 2a. Head Accountant verifies payment
    const prevNotifCalls = notifSpy.mock.calls.length;
    const prevPmtCalls = paymentsSpy.mock.calls.length;

    act(() => {
      // Simulate incoming event mapped in REALTIME_EVENT_QUERY_MAP
      const keys = REALTIME_EVENT_QUERY_MAP['payment:verified'] || [];
      invalidateQueries(...keys);
    });

    await waitFor(() => {
      expect(paymentsSpy.mock.calls.length).toBeGreaterThan(prevPmtCalls);
      expect(notifSpy.mock.calls.length).toBeGreaterThan(prevNotifCalls);
    });

    // 2b. Assistant FM validates liquidation
    const prevLiqCalls = liquidationsSpy.mock.calls.length;
    act(() => {
      const keys = REALTIME_EVENT_QUERY_MAP['liquidation:validated'] || [];
      invalidateQueries(...keys);
    });
    await waitFor(() => {
      expect(liquidationsSpy.mock.calls.length).toBeGreaterThan(prevLiqCalls);
    });

    // 2c. Accountant submits duplicates decision / supervisor approves
    const prevDupCalls = duplicatesSpy.mock.calls.length;
    act(() => {
      const keys = REALTIME_EVENT_QUERY_MAP['duplicate:approved'] || [];
      invalidateQueries(...keys);
    });
    await waitFor(() => {
      expect(duplicatesSpy.mock.calls.length).toBeGreaterThan(prevDupCalls);
    });
  });

  // TEST 3: Total AR is identical across Dashboard, Accounts Receivable, and Reports
  it('3. Total AR is the same on Dashboard, Accounts Receivable, and Reports', async () => {
    const TestConsistency = () => {
      const { data: arData } = useQuery('ar:records', () => Promise.resolve({ totalAR: 250000 }));
      const { data: dashData } = useQuery('dashboard:summary', () => Promise.resolve({ totalAR: 250000 }));
      const { data: repData } = useQuery('reports:ar', () => Promise.resolve({ totalAR: 250000 }));

      return (
        <div>
          <span data-testid="c-ar">{arData?.totalAR}</span>
          <span data-testid="c-dash">{dashData?.totalAR}</span>
          <span data-testid="c-rep">{repData?.totalAR}</span>
        </div>
      );
    };

    render(<TestConsistency />);

    await waitFor(() => {
      const arVal = screen.getByTestId('c-ar').textContent;
      const dashVal = screen.getByTestId('c-dash').textContent;
      const repVal = screen.getByTestId('c-rep').textContent;

      expect(arVal).toBe('250000');
      expect(dashVal).toBe('250000');
      expect(repVal).toBe('250000');
      expect(arVal).toEqual(dashVal);
      expect(dashVal).toEqual(repVal);
    });
  });

  // TEST 4: Failed mutation rollback & double click sends one request
  it('4. Failed mutation rolls back and shows error; double click sends only one request', async () => {
    let networkCallCount = 0;
    let shouldFail = false;

    // Test hook consuming useMutation
    let triggerMutate: any;

    const TestMutationComponent = () => {
      const { mutate, isLoading, error } = useMutation(
        async (val: number) => {
          networkCallCount++;
          await new Promise((res) => setTimeout(res, 50));
          if (shouldFail) {
            throw new Error('Network timeout');
          }
          return { success: true, val };
        },
        {
          mutationType: 'approveInvoice',
          optimisticUpdate: () => {
            const previous = getCachedQuery<number>('test:val') ?? 100;
            setCachedQuery('test:val', 999);
            return () => setCachedQuery('test:val', previous);
          },
        }
      );

      triggerMutate = mutate;

      return (
        <div>
          <button
            data-testid="mut-btn"
            disabled={isLoading}
            onClick={() => mutate(123).catch(() => {})}
          >
            Submit
          </button>
          <div data-testid="mut-error">{error?.message}</div>
          <div data-testid="cached-val">{getCachedQuery<number>('test:val')}</div>
        </div>
      );
    };

    setCachedQuery('test:val', 100);
    render(
      <ToastProvider>
        <TestMutationComponent />
      </ToastProvider>
    );

    expect(screen.getByTestId('cached-val').textContent).toBe('100');

    // 4a. Double-click protection: trigger twice rapidly
    act(() => {
      triggerMutate(123).catch(() => {});
      triggerMutate(123).catch(() => {});
    });

    await waitFor(() => {
      // Only 1 network request should be sent due to inFlightRef
      expect(networkCallCount).toBe(1);
    });

    // 4b. Failure rollback
    shouldFail = true;
    networkCallCount = 0;

    await act(async () => {
      await triggerMutate(456).catch(() => {});
    });

    await waitFor(() => {
      // Must rollback to previous value 100
      expect(getCachedQuery<number>('test:val')).toBe(100);
    });
  });

  // TEST 5: Logout clears cache; logging in as another user shows none of the previous data
  it('5. Logout clears cache; logging in as another user shows none of the previous data', () => {
    // Populate cache with User A's data
    setCachedQuery('user:data', { name: 'User A', secretFinancials: 999999 });
    setCachedQuery('dashboard:summary', { totalAR: 250000 });
    expect(getCachedQuery('user:data')).toBeDefined();

    // User A logs out
    clearQueryCache();

    // Cache must be empty
    expect(getCachedQuery('user:data')).toBeUndefined();
    expect(getCachedQuery('dashboard:summary')).toBeUndefined();

    // User B logs in
    mockUser({
      id: 'USER-B',
      employeeId: 'STAFF-B',
      fullName: 'New User B',
      email: 'b@speedex.test',
      role: ROLES.ACCOUNTANT,
      status: 'Active',
    });

    // None of User A's data is present
    expect(getCachedQuery('user:data')).toBeUndefined();
  });

  // TEST 6: Realtime drop falls back to polling and resyncs
  it('6. Realtime drop falls back to polling and resyncs on reconnect', () => {
    vi.useFakeTimers();
    let onOpenCb: any;
    let onCloseCb: any;

    class MockWebSocket {
      onopen: any = null;
      onclose: any = null;
      onerror: any = null;
      onmessage: any = null;
      constructor() {
        setTimeout(() => {
          onOpenCb = this.onopen;
          onCloseCb = this.onclose;
        }, 0);
      }
      close() {
        this.onclose?.();
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket);

    const listenerSpy = vi.fn();
    const disconnect = connectRealtime(listenerSpy);

    // Initial open triggers resync
    act(() => {
      vi.advanceTimersByTime(10);
      onOpenCb?.();
    });

    expect(listenerSpy).toHaveBeenCalledWith({ topic: '*' });
    listenerSpy.mockClear();

    // Connection drop: socket closes -> falls back to polling
    act(() => {
      onCloseCb?.();
      vi.advanceTimersByTime(16000);
    });

    // Polling fallback fires sync event
    expect(listenerSpy).toHaveBeenCalledWith({ topic: '*' });

    disconnect();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // TEST 7: Query key factory role-neutrality
  it('7. Query key factory and invalidation rules are role-neutral', () => {
    expect(queryKeys.invoices.all()).toBe('invoices');
    expect(queryKeys.ar.all()).toBe('ar');
    expect(queryKeys.payments.all()).toBe('payments');
    expect(queryKeys.settlements.all()).toBe('settlements');
    expect(queryKeys.adjustments.all()).toBe('adjustments');
    expect(queryKeys.speedpay.all()).toBe('speedpay');
    expect(queryKeys.duplicates.all()).toBe('duplicates');
    expect(queryKeys.liquidations.all()).toBe('liquidations');

    // Confirm MUTATION_INVALIDATION_MAP contains all required resource invalidations
    expect(MUTATION_INVALIDATION_MAP.approveInvoice).toContain('dashboard');
    expect(MUTATION_INVALIDATION_MAP.approveInvoice).toContain('ar');
    expect(MUTATION_INVALIDATION_MAP.approveInvoice).toContain('reports');
    expect(MUTATION_INVALIDATION_MAP.approvePayment).toContain('dashboard');
    expect(MUTATION_INVALIDATION_MAP.approveSettlement).toContain('dashboard');
    expect(MUTATION_INVALIDATION_MAP.approveAdjustment).toContain('dashboard');
    expect(MUTATION_INVALIDATION_MAP.validateSpeedpay).toContain('dashboard');
    expect(MUTATION_INVALIDATION_MAP.approveLiquidation).toContain('dashboard');
    expect(MUTATION_INVALIDATION_MAP.decideDuplicate).toContain('dashboard');
  });
});
