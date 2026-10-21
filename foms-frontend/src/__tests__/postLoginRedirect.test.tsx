import React from 'react';
import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ROLES, type Role } from '../types/auth';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ToastProvider } from '../components/ToastContext';
import { ProtectedRoute, RoleGuard } from '../components/ProtectedRoute';
import { LoginPage } from '../pages/LoginPage';
import { session } from '../services/apiClient';
import { LANDING_PATH, DEFAULT_LANDING_ROUTE } from '../utils/roleAccess';

// ── MSW Mock Server ─────────────────────────────────────────────────────────
let currentApiUser = {
  id: 'STAFF-001',
  fullName: 'Alex Accountant',
  role: 'Accountant',
  email: 'alex@speedex.com',
};

const server = setupServer(
  http.post(/.*\/auth\/login/, () => {
    return HttpResponse.json({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    });
  }),
  http.get(/.*\/auth\/me/, () => {
    return HttpResponse.json(currentApiUser);
  }),
  http.post(/.*\/auth\/logout/, () => {
    return HttpResponse.json({ success: true });
  }),
  http.get(/.*\/dashboard\/nav-badges/, () => HttpResponse.json({})),
  http.get(/.*\/ai\/dashboard\/alerts/, () => HttpResponse.json([]))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  session.clear();
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    // ignore
  }
});
afterAll(() => server.close());

// Test harness mirroring App.tsx routing
const TestApp: React.FC<{ initialEntries?: string[] }> = ({ initialEntries = ['/login'] }) => {
  const RoleHome: React.FC = () => {
    const { user } = useAuth();
    return <Navigate to={user ? LANDING_PATH[user.role] : '/login'} replace />;
  };

  const LogoutButton: React.FC = () => {
    const { logout } = useAuth();
    return <button onClick={logout}>Log Out Button</button>;
  };

  return (
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RoleHome />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>
                    <h1>Dashboard Content</h1>
                    <LogoutButton />
                  </div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/for-review"
              element={
                <ProtectedRoute>
                  <RoleGuard module="forReview">
                    <div>
                      <h1>For Review Content</h1>
                      <LogoutButton />
                    </div>
                  </RoleGuard>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<RoleHome />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('Post-Login Redirect — All Roles Land on Dashboard', () => {
  beforeEach(() => {
    session.clear();
  });

  const rolesToTest: { role: Role; roleStr: string; name: string }[] = [
    { role: ROLES.FINANCIAL_MANAGER, roleStr: 'Financial Manager', name: 'Fiona Manager' },
    { role: ROLES.HEAD_ACCOUNTANT, roleStr: 'Head Accountant', name: 'Hannah Head' },
    { role: ROLES.ACCOUNTANT, roleStr: 'Accountant', name: 'Alex Accountant' },
    { role: ROLES.ASSISTANT_FM, roleStr: 'Assistant FM', name: 'Arthur Assistant' },
  ];

  rolesToTest.forEach(({ role, roleStr, name }) => {
    it(`Fresh login for ${name} (${role}) lands on /dashboard`, async () => {
      currentApiUser = {
        id: `STAFF-${role}`,
        fullName: name,
        role: roleStr,
        email: `${role.toLowerCase()}@speedex.com`,
      };

      // Verify LANDING_PATH configuration in roleAccess.ts
      expect(LANDING_PATH[role]).toBe('/dashboard');
      expect(DEFAULT_LANDING_ROUTE).toBe('/dashboard');

      render(<TestApp initialEntries={['/login']} />);

      // Fill and submit login form
      fireEvent.change(screen.getByPlaceholderText(/Enter Employee ID/i), {
        target: { value: `STAFF-${role}` },
      });
      fireEvent.change(screen.getByPlaceholderText(/Enter Password/i), {
        target: { value: 'Secret123!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Sign In to FOMS/i }));

      // Successful login lands on /dashboard
      await waitFor(() => {
        expect(screen.getByText('Dashboard Content')).toBeDefined();
      });
      expect(screen.queryByText(/For Review Content/i)).toBeNull();
    });
  });

  it('Login after requesting /for-review while logged out returns to /for-review for Head Accountant', async () => {
    currentApiUser = {
      id: 'STAFF-HA',
      fullName: 'Hannah Head',
      role: 'Head Accountant',
      email: 'hannah@speedex.com',
    };

    render(<TestApp initialEntries={['/for-review']} />);

    // ProtectedRoute redirected unauthenticated user to /login with state.from = '/for-review'
    await waitFor(() => {
      expect(screen.getByText(/Login to Finance Operations Management System/i)).toBeDefined();
    });

    // Sign in as Head Accountant
    fireEvent.change(screen.getByPlaceholderText(/Enter Employee ID/i), {
      target: { value: 'STAFF-HA' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter Password/i), {
      target: { value: 'Secret123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to FOMS/i }));

    // Head Accountant is authorized for forReview -> returns to /for-review
    await waitFor(() => {
      expect(screen.getByText('For Review Content')).toBeDefined();
    });
  });

  it('Login after requesting /for-review while logged out silently redirects to /dashboard for Accountant', async () => {
    currentApiUser = {
      id: 'STAFF-ACC',
      fullName: 'Alex Accountant',
      role: 'Accountant',
      email: 'alex@speedex.com',
    };

    render(<TestApp initialEntries={['/for-review']} />);

    // ProtectedRoute redirected unauthenticated user to /login with state.from = '/for-review'
    await waitFor(() => {
      expect(screen.getByText(/Login to Finance Operations Management System/i)).toBeDefined();
    });

    // Sign in as Accountant
    fireEvent.change(screen.getByPlaceholderText(/Enter Employee ID/i), {
      target: { value: 'STAFF-ACC' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter Password/i), {
      target: { value: 'Secret123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to FOMS/i }));

    // Accountant returns to /for-review which is forbidden -> RoleGuard silently redirects to /dashboard (no 403 screen)
    await waitFor(() => {
      expect(screen.getByText('Dashboard Content')).toBeDefined();
    });
    expect(screen.queryByText(/403 — Access denied/i)).toBeNull();
    expect(screen.queryByText('For Review Content')).toBeNull();
  });

  it('Logging out from /for-review and logging in as another role lands on /dashboard (not previous user page)', async () => {
    // Step 1: Head Accountant logs in and visits /for-review
    currentApiUser = {
      id: 'STAFF-HA',
      fullName: 'Hannah Head',
      role: 'Head Accountant',
      email: 'hannah@speedex.com',
    };

    render(<TestApp initialEntries={['/for-review']} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter Employee ID/i)).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText(/Enter Employee ID/i), { target: { value: 'STAFF-HA' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter Password/i), { target: { value: 'Secret123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to FOMS/i }));

    await waitFor(() => {
      expect(screen.getByText('For Review Content')).toBeDefined();
    });

    // Step 2: Head Accountant logs out
    fireEvent.click(screen.getByText('Log Out Button'));

    await waitFor(() => {
      expect(screen.getByText(/Login to Finance Operations Management System/i)).toBeDefined();
    });

    // Step 3: Switch user to Accountant and perform fresh login
    currentApiUser = {
      id: 'STAFF-ACC',
      fullName: 'Alex Accountant',
      role: 'Accountant',
      email: 'alex@speedex.com',
    };

    fireEvent.change(screen.getByPlaceholderText(/Enter Employee ID/i), { target: { value: 'STAFF-ACC' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter Password/i), { target: { value: 'Secret123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to FOMS/i }));

    // Must land on /dashboard, NOT on Head Accountant's previous /for-review page
    await waitFor(() => {
      expect(screen.getByText('Dashboard Content')).toBeDefined();
    });
    expect(screen.queryByText(/403 — Access denied/i)).toBeNull();
    expect(screen.queryByText('For Review Content')).toBeNull();
  });

  it('Visiting "/" or "/login" while already logged in redirects to /dashboard', async () => {
    // Authenticated session
    session.set({ accessToken: 'valid-token' });
    currentApiUser = {
      id: 'STAFF-HA',
      fullName: 'Hannah Head',
      role: 'Head Accountant',
      email: 'hannah@speedex.com',
    };

    // Test visiting "/"
    const { unmount: u1 } = render(<TestApp initialEntries={['/']} />);
    await waitFor(() => {
      expect(screen.getByText('Dashboard Content')).toBeDefined();
    });
    u1();

    // Test visiting "/login"
    render(<TestApp initialEntries={['/login']} />);
    await waitFor(() => {
      expect(screen.getByText('Dashboard Content')).toBeDefined();
    });
  });
});
