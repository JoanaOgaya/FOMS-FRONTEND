/**
 * apiClient — the ONE HTTP instance. Base URL from VITE_API_URL, bearer token,
 * normalised errors, and 401 handling (session cleared + registered listener notified).
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

const SESSION_KEY = 'foms_session';

const isProduction = import.meta.env.PROD;
const envUrl = typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : '';

const defaultBaseUrl = isProduction
  ? 'https://fomsintegration-amfve2fdccbdgbgy.eastasia-01.azurewebsites.net'
  : 'http://localhost:5007';

// In production, ignore any localhost or invalid URL so deployed builds always use the live backend
const isValidCustomUrl = envUrl &&
  !envUrl.includes('foms-backend.onrender.com') &&
  (!isProduction || !envUrl.includes('localhost'));

const activeUrl = isValidCustomUrl ? envUrl : defaultBaseUrl;

const baseURL: string = activeUrl.replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
  get isForbidden() { return this.status === 403; }
  get isNetwork() { return this.status === 0; }
  get isUnprocessable() { return this.status === 422; }
}

// ── Session token storage (auth only; no business data) ──────────────
interface StoredSession { accessToken: string; refreshToken?: string }

export const session = {
  get(): StoredSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  },
  set(value: StoredSession) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    } catch {
      // storage safeguard
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('foms_user_profile');
    } catch {
      // storage safeguard
    }
  },
};

let unauthorizedListener: (() => void) | null = null;
export function onUnauthorized(listener: (() => void) | null) { unauthorizedListener = listener; }

const instance = axios.create({ baseURL });

instance.interceptors.request.use((config) => {
  const token = session.get()?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // If payload is FormData, remove Content-Type so browser can set multipart/form-data with boundary
  if (config.data instanceof FormData) {
    if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
  } else if (config.headers && !config.headers['Content-Type'] && !config.headers['content-type']) {
    config.headers['Content-Type'] = 'application/json';
  }

  return config;
});

instance.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ message?: string; error?: string }>) => {
    const status = err.response?.status ?? 0;
    const url = err.config?.url ?? '';
    const errMessage = String(err.response?.data?.message || err.response?.data?.error || '').toLowerCase();
    const isApiKeyError = errMessage.includes('api key');
    const isIntegrationRoute = url.includes('/api/integration');

    // Only clear user session if it is an actual user auth session failure (not an integration/API key 401 or initial profile check)
    if (status === 401 && !url.includes('/auth/login') && !url.includes('/auth/me') && !isApiKeyError && !isIntegrationRoute) {
      session.clear();
      unauthorizedListener?.();
    }
    const message =
      err.response?.data?.message ??
      err.response?.data?.error ??
      (status === 0 ? 'Unable to reach the server. Check your connection.' : err.message);
    return Promise.reject(new ApiError(message, status, err.response?.data));
  },
);

/** Unwraps the `{ success, data }` envelope when the API uses it. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) return (body as { data: T }).data;
  return body as T;
}

export const http = {
  get: async <T>(url: string, params?: object, config?: AxiosRequestConfig) => unwrap<T>((await instance.get(url, { ...config, params })).data),
  post: async <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>((await instance.post(url, body, config)).data),
  put: async <T>(url: string, body?: unknown) => unwrap<T>((await instance.put(url, body)).data),
  patch: async <T>(url: string, body?: unknown) => unwrap<T>((await instance.patch(url, body)).data),
  delete: async <T>(url: string) => unwrap<T>((await instance.delete(url)).data),
};

export const API_BASE_URL = baseURL;
