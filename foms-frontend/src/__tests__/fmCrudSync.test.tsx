import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { clearQueryCache } from '../hooks/useQuery';
import { invalidateForMutation } from '../services/invalidation';
import { ToastProvider } from '../components/ToastContext';
import { ToastBar } from '../components/ToastBar';
import * as AuthContextModule from '../context/AuthContext';
import { ROLES, type User } from '../types/auth';
import { ClientManagement } from '../pages/ClientManagement';
import { Reports } from '../pages/Reports';
import { Payments } from '../pages/Payments';
import LiquidationValidation from '../pages/LiquidationValidation';
import Settlements from '../pages/Settlements';
import { canAccessPath } from '../utils/roleAccess';
import { settlementsService } from '../services/settlementsService';

const FM_USER: User = {
  id: 'USER-FM-01',
  employeeId: 'FM-01',
  fullName: 'Financial Manager Test',
  email: 'fm.test@speedex.test',
  role: ROLES.FINANCIAL_MANAGER,
  status: 'Active',
};

const AFM_USER: User = {
  id: 'USER-AFM-01',
  employeeId: 'AFM-01',
  fullName: 'Assistant FM Test',
  email: 'afm.test@speedex.test',
  role: ROLES.ASSISTANT_FM,
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

// In-memory test state for clients
let testClients: any[] = [];
let createCallCount = 0;
let updateCallCount = 0;
let lastClientUpdateBody: Record<string, unknown> | null = null;
let deleteCallCount = 0;
let testCashFlow: any[] = [];
let testLiquidations: any[] = [];
let testSettlements: any[] = [];

const server = setupServer(
  // Client Detail by ID (match :id before collection)
  http.get(/.*(\/api)?\/clients\/([^/?#]+)/, ({ request }) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 1];
    const found = testClients.find(c => c.id === id || c.clientId === id);
    if (!found) {
      return new HttpResponse(JSON.stringify({ message: `Client ${id} not found` }), { status: 404 });
    }
    return HttpResponse.json(found);
  }),

  // Update Client by ID
  http.put(/.*(\/api)?\/clients\/([^/?#]+)/, async ({ request }) => {
    updateCallCount++;
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 1];
    const body: any = await request.json();
    lastClientUpdateBody = body;
    const idx = testClients.findIndex(c => c.id === id || c.clientId === id);
    if (idx === -1) {
      return new HttpResponse(JSON.stringify({ message: `Client ${id} not found` }), { status: 404 });
    }
    if (body.name === 'Conflict Client') {
      return new HttpResponse(JSON.stringify({ message: 'Record version conflict' }), { status: 409 });
    }
    testClients[idx] = { ...testClients[idx], ...body, phone: body.contactNumber ?? testClients[idx].phone };
    return HttpResponse.json(testClients[idx]);
  }),

  // Delete Client by ID
  http.delete(/.*(\/api)?\/clients\/([^/?#]+)/, ({ request }) => {
    deleteCallCount++;
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 1];
    if (id === 'CLI-IN-USE') {
      return new HttpResponse(JSON.stringify({ message: 'Cannot delete, this record is in use. Deactivate instead' }), { status: 409 });
    }
    testClients = testClients.filter(c => c.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),

  // Client Collection (List)
  http.get(/.*(\/api)?\/clients(\?.*)?$/, () => {
    return HttpResponse.json({
      items: testClients,
      total: testClients.length,
    });
  }),

  // Create Client
  http.post(/.*(\/api)?\/clients(\?.*)?$/, async ({ request }) => {
    createCallCount++;
    const body: any = await request.json();
    if (body.name === 'Duplicate Corp') {
      return new HttpResponse(JSON.stringify({ message: 'A client with this name already exists.' }), { status: 409 });
    }
    const newClient = {
      id: `CLI-${Date.now()}`,
      name: body.name,
      contactPerson: body.contactPerson,
      phone: body.phone,
      email: body.email,
      address: body.address,
      billingSchedule: body.billingSchedule || 'Monthly',
      status: body.status || 'Active',
      createdAt: new Date().toISOString(),
    };
    testClients.push(newClient);
    return HttpResponse.json(newClient);
  }),

  http.get(/.*(\/api)?\/invoices/, () => HttpResponse.json({ items: [], total: 0 })),
  http.get(/.*(\/api)?\/payments/, () => HttpResponse.json({ items: [], total: 0 })),
  http.get(/.*(\/api)?\/waybills/, () => HttpResponse.json({ items: [], total: 0 })),
  http.get(/.*(\/api)?\/rates/, () => HttpResponse.json({ items: [], total: 0 })),
  http.get(/.*(\/api)?\/ar\/records/, () => HttpResponse.json({ items: [], total: 0 })),
  http.get(/.*(\/api)?\/cash-flow/, () => HttpResponse.json({ items: testCashFlow, total: testCashFlow.length })),
  http.post(/.*(\/api)?\/cash-flow/, async ({ request }) => {
    const body: any = await request.json();
    const newRecord = { id: `CF-${Date.now()}`, ...body };
    testCashFlow.push(newRecord);
    return HttpResponse.json(newRecord);
  }),
  http.get(/.*(\/api)?\/liquidations/, () => HttpResponse.json({ items: testLiquidations, total: testLiquidations.length })),
  http.post(/.*(\/api)?\/liquidations/, async ({ request }) => {
    const body: any = await request.json();
    const newRecord = { id: `LIQ-${Date.now()}`, ...body };
    testLiquidations.push(newRecord);
    return HttpResponse.json(newRecord);
  }),
  http.get(/.*(\/api)?\/settlements/, () => HttpResponse.json({ items: testSettlements, total: testSettlements.length })),
  http.post(/.*(\/api)?\/settlements/, async ({ request }) => {
    const body: any = await request.json();
    const newRecord = { id: `SET-${Date.now()}`, ...body };
    testSettlements.push(newRecord);
    return HttpResponse.json(newRecord);
  }),
  http.get(/.*(\/api)?\/audit-logs/, () => HttpResponse.json({ items: [], total: 0 })),
  http.post(/.*(\/api)?\/audit-logs/, () => HttpResponse.json({ success: true })),
  http.get(/.*(\/api)?\/duplicates\/flagged/, () => HttpResponse.json({ items: [], total: 0 })),
  http.get(/.*(\/api)?\/duplicates\/unique-documents/, () => HttpResponse.json({ items: [], total: 0 })),
  http.get(/.*(\/api)?\/duplicates\/review-history/, () => HttpResponse.json({ items: [], total: 0 }))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  clearQueryCache();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('Financial Manager CRUD & Cross-Page Reflection Test Suite', () => {
  beforeEach(() => {
    createCallCount = 0;
    updateCallCount = 0;
    lastClientUpdateBody = null;
    deleteCallCount = 0;
    testCashFlow = [];
    testLiquidations = [];
    testSettlements = [];
    testClients = [
      {
        id: 'CLI-01',
        clientId: 'CLIENT-101',
        clientCode: 'CLI-01',
        name: 'Shopee Express',
        businessName: 'Shopee Express Inc.',
        contactPerson: 'Jane Doe',
        phone: '09171234567',
        email: 'jane@shopee.com',
        address: 'BGC Taguig',
        creditLimit: 100000,
        tin: '123-456-789',
        billingSchedule: 'Monthly',
        status: 'Active',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'CLI-IN-USE',
        clientId: 'CLIENT-102',
        clientCode: 'CLI-IN-USE',
        name: 'Lazada Logistics',
        businessName: 'Lazada Logistics Inc.',
        contactPerson: 'John Smith',
        phone: '09189876543',
        email: 'john@lazada.com',
        address: 'Ortigas Pasig',
        creditLimit: 100000,
        tin: '987-654-321',
        billingSchedule: 'Weekly',
        status: 'Active',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    mockUser();
  });

  // TEST 1: Client Creation with validation & immediate reflection
  it('1. Create Client: validates fields, rejects duplicates, sends single request, and reflects immediately', async () => {
    render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/clients']}>
          <Routes>
            <Route path="/clients" element={<ClientManagement />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    // Initial clients displayed
    await waitFor(() => {
      expect(screen.getByText('Shopee Express')).toBeDefined();
      expect(screen.getByText('Lazada Logistics')).toBeDefined();
    });

    // Click "New Client"
    const addBtn = screen.getByRole('button', { name: /new client/i });
    fireEvent.click(addBtn);

    // Modal opens
    expect(screen.getByText('Create New Client')).toBeDefined();

    const form = document.querySelector('form')!;
    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
    const contactInput = document.querySelector('input[name="contactPerson"]') as HTMLInputElement;
    const phoneInput = document.querySelector('input[name="contactNumber"]') as HTMLInputElement;
    const addressInput = document.querySelector('input[name="address"]') as HTMLInputElement;

    // 1. Validation error: duplicate check against existing
    act(() => {
      fireEvent.change(nameInput, { target: { value: 'Shopee Express' } });
      fireEvent.change(contactInput, { target: { value: 'New Contact' } });
      fireEvent.change(phoneInput, { target: { value: '09190001111' } });
      fireEvent.change(addressInput, { target: { value: 'Makati City' } });
    });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getAllByText('A client with this name already exists.').length).toBeGreaterThanOrEqual(1);
    });
    expect(createCallCount).toBe(0);

    // 2. Submit valid new client
    act(() => {
      fireEvent.change(nameInput, { target: { value: 'Zalora Philippines' } });
    });
    
    // Simulate double submit
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.queryByText('Create New Client')).toBeNull();
    });

    // Verify only ONE request was sent
    expect(createCallCount).toBe(1);

    // Verify newly created client appears immediately in the client list
    await waitFor(() => {
      expect(screen.getByText('Zalora Philippines')).toBeDefined();
    });
  });

  // TEST 2: Created Client reflects in Reports client dropdown
  it('2. Newly created client appears in Reports Client Filter dropdown without full page reload', async () => {
    testClients.push({
      id: 'CLI-NEW-01',
      name: 'TikTok Shop PH',
      contactPerson: 'David Chen',
      phone: '09175556666',
      email: 'david@tiktok.com',
      address: 'Taguig City',
      billingSchedule: 'Monthly',
      status: 'Active',
      createdAt: new Date().toISOString(),
    });

    invalidateForMutation('createClient');

    render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/reports']}>
          <Routes>
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    // Check that TikTok Shop PH appears in the client dropdown
    await waitFor(() => {
      expect(screen.getByText('TikTok Shop PH (CLI-NEW-01)')).toBeDefined();
    });
  });

  // TEST 3: Created Client reflects in Payments company datalist
  it('3. Newly created client appears in Payments Company Name autocomplete datalist', async () => {
    testClients.push({
      id: 'CLI-NEW-02',
      name: 'Shein Global Hub',
      contactPerson: 'Sarah Lin',
      phone: '09178889999',
      email: 'sarah@shein.com',
      address: 'Pasay City',
      billingSchedule: 'Monthly',
      status: 'Active',
      createdAt: new Date().toISOString(),
    });

    invalidateForMutation('createClient');

    mockUser({
      ...FM_USER,
      role: ROLES.ACCOUNTANT,
    });

    render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/payments']}>
          <Routes>
            <Route path="/payments" element={<Payments />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    // Open Record Payment modal
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /record payment/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() => {
      const datalist = document.getElementById('payments-client-datalist');
      expect(datalist).toBeDefined();
      expect(datalist?.innerHTML).toContain('Shein Global Hub');
    });
  });

  // TEST 4: Client Detail View, Edit Profile, and 409 Conflict Handling
  it('4. Client Update: opens edit form prefilled, saves, handles 409 conflict gracefully', async () => {
    mockUser();
    render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/clients/CLI-01']}>
          <Routes>
            <Route path="/clients/:id" element={<ClientManagement />} />
            <Route path="/clients" element={<ClientManagement />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    // Detail view loads prefilled
    await waitFor(() => {
      expect(screen.getByText(/CLI-01 · Shopee Express/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeDefined();
    });

    // Click Edit Profile
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

    // Edit modal opens prefilled
    expect(screen.getByText('EDIT CLIENT')).toBeDefined();
    const editForm = document.querySelector('form')!;
    const contactInput = document.querySelector('input[name="contactNumber"]') as HTMLInputElement;
    expect(contactInput.value).toBe('09171234567');
    expect((screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[name="id"]')).toBeNull();
    expect(screen.getByText(/Client ID:/i).textContent).toContain('CLI-01');

    // Update field and save
    act(() => {
      fireEvent.change(contactInput, { target: { value: '09170000000' } });
    });
    expect((screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.submit(editForm);

    await waitFor(() => {
      expect(screen.queryByText('EDIT CLIENT')).toBeNull();
    });
    expect(updateCallCount).toBe(1);
    expect(lastClientUpdateBody).toMatchObject({
      clientCode: 'CLI-01',
      contactNumber: '09170000000',
      name: 'Shopee Express',
      address: 'BGC Taguig',
    });
    expect(testClients.find(client => client.clientId === 'CLIENT-101')?.phone).toBe('09170000000');

    // 409 Conflict handling test:
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    const editForm2 = document.querySelector('form')!;
    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
    act(() => {
      fireEvent.change(nameInput, { target: { value: 'Conflict Client' } });
    });
    fireEvent.submit(editForm2);

    await waitFor(() => {
      expect(screen.getByText(/This record was changed by someone else/i)).toBeDefined();
    });
  });

  // TEST 5: Deactivate button removed from header; status managed cleanly
  it('5. Deactivate button is removed from client detail header; status managed cleanly', async () => {
    mockUser();
    render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/clients/CLI-IN-USE']}>
          <Routes>
            <Route path="/clients/:id" element={<ClientManagement />} />
            <Route path="/clients" element={<ClientManagement />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/CLI-IN-USE · Lazada Logistics/i)).toBeDefined();
    });

    // Deactivate button is NOT in the header
    expect(screen.queryByRole('button', { name: /deactivate client/i })).toBeNull();
    // Edit Profile and Back to Clients are present
    expect(screen.getByRole('button', { name: /edit profile/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /back to clients/i })).toBeDefined();
  });

  // TEST 6: Read Detail 404 Empty State
  it('6. Detail view handles non-existent client with clean error state and Retry button', async () => {
    mockUser();
    render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/clients/NON-EXISTENT-ID']}>
          <Routes>
            <Route path="/clients/:id" element={<ClientManagement />} />
            <Route path="/clients" element={<ClientManagement />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Client NON-EXISTENT-ID not found/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
    });
  });

  // TEST 7: Record Expense visibility by role
  it('7. Record Expense is hidden from Financial Manager on /payments and visible to Assistant FM on /liquidations', async () => {
    // 7a. Financial Manager visits /payments -> "Record Expense" is NOT rendered
    mockUser(FM_USER);
    const { unmount } = render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/payments']}>
          <Routes>
            <Route path="/payments" element={<Payments />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /record expense/i })).toBeNull();
    });
    unmount();

    // 7b. Assistant FM visits /liquidations -> "Record Expense" IS rendered
    mockUser(AFM_USER);
    render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/liquidations']}>
          <Routes>
            <Route path="/liquidations" element={<LiquidationValidation />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /record expense/i })).toBeDefined();
    });
  });

  // TEST 8: Assistant FM records expense -> reflected across all applicable pages via invalidation
  it('8. Assistant FM records expense: creates cash outflow and reflects across all pages via invalidation', async () => {
    mockUser(AFM_USER);
    render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/liquidations']}>
          <Routes>
            <Route path="/liquidations" element={<LiquidationValidation />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    // Open Record Expense modal
    const recordBtn = await screen.findByRole('button', { name: /record expense/i });
    fireEvent.click(recordBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. Office Supplies, Fuel, Maintenance\.\.\./i)).toBeDefined();
    });

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Office Supplies, Fuel, Maintenance\.\.\./i), {
      target: { value: 'Gasoline & Toll Fees' },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '3500.50' },
    });

    // Submit expense
    const submitBtn = screen.getAllByRole('button', { name: /record expense/i }).find(b => b.getAttribute('type') === 'submit')!;
    fireEvent.click(submitBtn);

    // Record created in testCashFlow
    await waitFor(() => {
      expect(testCashFlow.length).toBe(1);
      expect(testCashFlow[0].amount).toBe(3500.5);
      expect(testCashFlow[0].type).toBe('Outflow');
    });

    // Success toast shown
    await waitFor(() => {
      expect(screen.getByText(/Expense "Gasoline & Toll Fees" recorded/i)).toBeDefined();
    });
  });

  it('9. Record Settlement is excluded from Financial Manager sidebar/role, and settlements recorded by Accountant reflect immediately in FM Settlements page', async () => {
    // 1. Verify Role Access: FM does NOT have access to /record-settlement
    expect(canAccessPath(ROLES.FINANCIAL_MANAGER, '/record-settlement')).toBe(false);
    expect(canAccessPath(ROLES.ACCOUNTANT, '/record-settlement')).toBe(true);

    // 2. Initial state: FM mounts Settlements page (/settlements - Settlement Validation)
    mockUser(FM_USER);
    testSettlements = [];

    render(
      <ToastProvider>
        <ToastBar />
        <MemoryRouter initialEntries={['/settlements']}>
          <Routes>
            <Route path="/settlements" element={<Settlements />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/No settlements found/i)).toBeDefined();
    });

    // 3. Accountant records a settlement
    const ACC_USER: User = {
      id: 'USER-ACC-01',
      employeeId: 'ACC-01',
      fullName: 'Accountant Alex',
      email: 'acc.test@speedex.test',
      role: ROLES.ACCOUNTANT,
      status: 'Active',
    };
    mockUser(ACC_USER);

    // Simulate Accountant recording settlement
    await act(async () => {
      await settlementsService.create({
        type: 'Leftover return',
        courierName: 'Courier Juan',
        tripRef: 'TRIP-NCR-777',
        amount: 2500,
        status: 'For validation',
        cashAdvance: 5000,
        totalExpenses: 2500,
        recordedBy: 'Accountant Alex',
      });
      invalidateForMutation('recordSettlement');
    });

    // 4. FM view reflects the newly recorded settlement without reload
    mockUser(FM_USER);
    await waitFor(() => {
      expect(screen.getByText('Courier Juan')).toBeDefined();
      expect(screen.getByText(/For validation/i)).toBeDefined();
    });
  });
});
