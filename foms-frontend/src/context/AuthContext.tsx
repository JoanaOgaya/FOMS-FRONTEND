/**
 * AuthContext — session state only (current user, login, logout).
 * The user and role always come from GET /auth/me; no business data lives here.
 * Logout / 401 / inactivity clear the token, the query cache and the realtime connection (via route unmount).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AuthContextValue, LoginCredentials, User } from '../types/auth';
import { authService } from '../services/authService';
import { onUnauthorized, session } from '../services/apiClient';
import { clearQueryCache } from '../hooks/useQuery';
import { riskService } from '../services/ai/risk.service';
import { LANDING_PATH } from '../utils/roleAccess';
import { bootstrapIncomingAuth, clearStoredSession, getCentralLoginUrl, getInitialProfile, getSystemPortalUrl } from '../services/centralAuth';

// Bootstrap any SSO auth params returned when entering FOMS from Speedex Central Portal
bootstrapIncomingAuth();

const INACTIVITY_TIMEOUT_MS = Number(import.meta.env.VITE_INACTIVITY_TIMEOUT_MS) || 30 * 60 * 1000;
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll'];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(getInitialProfile);
  const [isLoading, setIsLoading] = useState<boolean>(() => !getInitialProfile() && !!session.get());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endSession = useCallback((reason: string = 'logged_out') => {
    let authDataToHandoff: any = null;
    try {
      const sessionRaw = localStorage.getItem('foms_session') || sessionStorage.getItem('foms_session');
      const profileRaw = localStorage.getItem('foms_user_profile');
      if (sessionRaw) {
        const parsedSession = JSON.parse(sessionRaw);
        const parsedProfile = profileRaw ? JSON.parse(profileRaw) : null;
        authDataToHandoff = {
          ...parsedSession,
          ...parsedProfile,
        };
      }
    } catch {
      // storage safeguard
    }

    clearStoredSession();
    clearQueryCache();
    riskService.clearCache();
    setUser(null);

    if (reason === 'inactivity' || reason === 'session_expired') {
      if (typeof window !== 'undefined') {
        window.location.href = `/login?reason=${encodeURIComponent(reason)}`;
      }
    } else {
      // Voluntary logout returns to the Central Portal Landing Page (/portal)
      const portalUrl = getSystemPortalUrl();
      if (typeof window !== 'undefined') {
        if (authDataToHandoff?.accessToken) {
          const hashFragment = `token=${encodeURIComponent(authDataToHandoff.accessToken)}&refreshToken=${encodeURIComponent(authDataToHandoff.refreshToken || '')}&role=${encodeURIComponent(authDataToHandoff.role || '')}&employeeId=${encodeURIComponent(authDataToHandoff.employeeId || '')}&employeeName=${encodeURIComponent(authDataToHandoff.fullName || authDataToHandoff.name || '')}`;
          window.location.replace(`${portalUrl}#${hashFragment}`);
        } else {
          window.location.replace(portalUrl);
        }
      }
    }
  }, []);

  const logout = useCallback((options?: { reason?: string } | unknown) => {
    const reason = (options && typeof options === 'object' && 'reason' in (options as Record<string, unknown>) && typeof (options as Record<string, unknown>).reason === 'string')
      ? (options as { reason: string }).reason
      : 'logged_out';

    try {
      sessionStorage.setItem('loggedOut', 'true');
    } catch {
      // storage access safeguard
    }
    authService.logout().catch(() => undefined).finally(() => endSession(reason));
  }, [endSession]);

  // Restore session from the server (updates cached profile with fresh backend data)
  useEffect(() => {
    if (!session.get()) {
      setIsLoading(false);
      return;
    }
    authService.me()
      .then((me) => {
        setUser(me);
        try {
          localStorage.setItem('foms_user_profile', JSON.stringify(me));
        } catch {
          // storage safeguard
        }
      })
      .catch((err) => {
        if (err?.status === 401) {
          clearStoredSession();
          setUser(null);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      endSession('session_expired');
    });
    return () => onUnauthorized(null);
  }, [endSession]);

  // User switch: never carry one user's cached data into another session.
  const userId = user?.employeeId;
  useEffect(() => () => clearQueryCache(), [userId]);

  // Inactivity auto-logout (Retaining 30-minute window per business requirements)
  useEffect(() => {
    if (!user) return undefined;
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => logout({ reason: 'inactivity' }), INACTIVITY_TIMEOUT_MS);
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user, logout]);

  const login = useCallback(async ({ employeeId, password }: LoginCredentials) => {
    setIsLoading(true);
    try {
      const tokens = await authService.login(employeeId, password);
      session.set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      const me = await authService.me();
      setUser(me);
      try {
        localStorage.setItem('foms_user_profile', JSON.stringify(me));
      } catch {
        // storage safeguard
      }

      let requestedFrom: string | undefined;
      const wasLoggedOut = typeof window !== 'undefined' && sessionStorage.getItem('loggedOut') === 'true';
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('loggedOut');
      }

      if (!wasLoggedOut) {
        const state = location.state as { from?: string } | null;
        if (state?.from && state.from !== '/login' && state.from !== '/') {
          requestedFrom = state.from;
        }
      }

      const target = requestedFrom || LANDING_PATH[me.role];
      navigate(target, { replace: true });
      return { success: true };
    } catch (e) {
      clearStoredSession();
      return { success: false, error: e instanceof Error ? e.message : 'Unable to sign in.' };
    } finally {
      setIsLoading(false);
    }
  }, [navigate, location]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: !!user, isLoading, login, logout }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
