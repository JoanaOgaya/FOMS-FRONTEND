/**
 * Central Authentication helpers for FOMS.
 */

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
 * Handles SSO parameters passed into FOMS via URL search or hash:
 * ?token=...&refreshToken=...&role=...#token=...
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

  // Store in FOMS session format
  sessionStorage.setItem('foms_session', JSON.stringify({
    accessToken: token,
    refreshToken,
  }));

  // Clean the URL query/hash from the address bar immediately (address bar sanitization)
  window.history.replaceState({}, document.title, window.location.pathname);
  return true;
}
