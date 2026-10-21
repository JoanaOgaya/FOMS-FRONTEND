/**
 * Central Authentication & SSO Integration Helpers for FOMS.
 */
import type { User } from '../types/auth';
import { normalizeRole } from '../utils/roleAccess';

const CENTRAL_PORTAL_FALLBACK = 'https://speedex-system.vercel.app';

/**
 * Resolves the Central One-Login URL.
 */
export function getCentralLoginUrl(): string {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5173/login';
  }
  return `${CENTRAL_PORTAL_FALLBACK}/login`;
}

/**
 * Resolves the Central Password Recovery URL.
 */
export function getCentralForgotPasswordUrl(): string {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5173/forgot-password?system=foms';
  }
  return `${CENTRAL_PORTAL_FALLBACK}/forgot-password?system=foms`;
}

/**
 * Handles SSO parameters passed into FOMS via URL search or hash:
 * ?token=...&refreshToken=...&role=...&employeeId=...&name=...#token=...
 */
export function bootstrapIncomingAuth(): boolean {
  if (typeof window === 'undefined') return false;

  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);

  const getParam = (...keys: string[]): string | null => {
    for (const k of keys) {
      const val = hashParams.get(k) ?? searchParams.get(k);
      if (val !== null && val !== undefined && val !== '') return val;
    }
    return null;
  };

  const token = getParam('token', 'authToken', 'accessToken', 'access_token');
  if (!token) return false;

  const refreshToken = getParam('refreshToken', 'refresh_token') || '';
  const rawRole = getParam('role', 'userRole', 'roles');
  const employeeId = getParam('employeeId', 'employeeNumber', 'id') || 'EMP-001';
  const name = getParam('name', 'employeeName', 'fullName') || employeeId;
  const email = getParam('email') || undefined;

  const cleanRole = normalizeRole(rawRole) ?? 'ACCOUNTANT';

  const sessionData = {
    accessToken: token,
    refreshToken,
  };

  const profileData: User = {
    id: employeeId,
    employeeId,
    fullName: name,
    role: cleanRole,
    email,
  };

  // Store in both sessionStorage and localStorage for synchronous hydration and persistence
  try {
    sessionStorage.setItem('foms_session', JSON.stringify(sessionData));
    localStorage.setItem('foms_session', JSON.stringify(sessionData));
    localStorage.setItem('foms_user_profile', JSON.stringify(profileData));
  } catch {
    // Storage access safeguard
  }

  // Clean the URL query/hash from the address bar immediately (address bar sanitization)
  window.history.replaceState({}, document.title, window.location.pathname);
  return true;
}

/**
 * Synchronously retrieves the cached profile from storage to prevent auth flashing.
 */
export function getInitialProfile(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('foms_user_profile');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (!parsed || !parsed.employeeId || !parsed.role) return null;
    const validRole = normalizeRole(parsed.role);
    if (!validRole) return null;
    return {
      ...parsed,
      role: validRole,
    };
  } catch {
    return null;
  }
}

/**
 * Clears all stored session and user profile data across storages.
 */
export function clearStoredSession(): void {
  try {
    sessionStorage.removeItem('foms_session');
    sessionStorage.removeItem('loggedOut');
    sessionStorage.removeItem('lastVisited');
    sessionStorage.removeItem('redirectAfterLogin');

    localStorage.removeItem('foms_session');
    localStorage.removeItem('foms_user_profile');
    localStorage.removeItem('lastVisited');
    localStorage.removeItem('redirectAfterLogin');
  } catch {
    // Storage access safeguard
  }
}
