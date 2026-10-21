/**
 * Route guards.
 *  - ProtectedRoute: unauthenticated -> /login.
 *  - RoleGuard: authenticated but role not allowed for the module -> 403 page.
 * Access rules come exclusively from utils/roleAccess.
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ForbiddenPage } from './shared/ForbiddenPage';
import { getModule, type ModuleKey } from '../utils/roleAccess';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: '#0f172a', color: '#f8fafc', gap: '16px' }}>
        <div style={{ width: '42px', height: '42px', border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px' }}>Loading Speedex Logistics Portal...</div>
      </div>
    );
  }
  if (!user) {
    const isLoggedOut = typeof window !== 'undefined' && sessionStorage.getItem('loggedOut') === 'true';
    return <Navigate to="/login" replace state={isLoggedOut ? null : { from: location.pathname + (location.search || '') }} />;
  }
  return <>{children}</>;
}

export function RoleGuard({ module, children }: { module: ModuleKey; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !getModule(module).roles[user.role]) return <ForbiddenPage />;
  return <>{children}</>;
}
