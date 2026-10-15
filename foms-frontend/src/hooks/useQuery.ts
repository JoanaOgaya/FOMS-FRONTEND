/**
 * useQuery — Minimal reactive data-fetching hook with a shared query cache.
 * Keys follow "<domain>:<params>" or query key factory outputs.
 * The cache is wiped on logout/user switch via `clearQueryCache()`.
 * Refetches on window focus and reconnect when configured.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { queryConfig } from '../services/queryConfig';

const cache = new Map<string, unknown>();
const active = new Set<{ key: string; refetch: () => void }>();

/** Refetch every mounted query whose key matches or starts with one of the prefixes (all queries when none given). */
export function invalidateQueries(...prefixes: string[]): void {
  active.forEach((q) => {
    if (!q.key) return;
    if (prefixes.length === 0 || prefixes.some((p) => {
      if (p === '*') return true;
      const lowerKey = q.key.toLowerCase();
      const lowerP = p.toLowerCase();
      if (lowerKey === lowerP || lowerKey.startsWith(lowerP)) return true;
      if (lowerKey.startsWith(`${lowerP}:`)) return true;
      if (lowerKey.includes(`:${lowerP}:`) || lowerKey.endsWith(`:${lowerP}`)) return true;
      return false;
    })) {
      q.refetch();
    }
  });
}

export function clearQueryCache(): void {
  cache.clear();
}

export function getCachedQuery<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setCachedQuery<T>(key: string, data: T): void {
  cache.set(key, data);
  invalidateQueries(key);
}

export interface QueryResult<T> {
  data: T | undefined;
  error: Error | null;
  /** True only while there is no data yet. */
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

// Window focus / visibility refetch listener (set up once globally)
let isFocusListenerSetup = false;
function setupWindowFocusListener() {
  if (isFocusListenerSetup || typeof window === 'undefined') return;
  isFocusListenerSetup = true;

  const onFocus = () => {
    if (queryConfig.refetchOnWindowFocus) {
      invalidateQueries();
    }
  };

  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && queryConfig.refetchOnWindowFocus) {
      invalidateQueries();
    }
  });
}

export function useQuery<T>(
  key: string | null | undefined,
  fetcher: () => Promise<T>,
  options: { enabled?: boolean; staleTime?: number } = {},
): QueryResult<T> {
  setupWindowFocusListener();
  const { enabled = true } = options;
  const isEnabled = enabled && Boolean(key);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seq = useRef(0);
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; fetching: boolean }>(() => ({
    data: key ? (cache.get(key) as T | undefined) : undefined,
    error: null,
    fetching: isEnabled && !cache.has(key!),
  }));

  const run = useCallback(async () => {
    if (!key) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, fetching: true }));
    try {
      const data = await fetcherRef.current();
      if (id !== seq.current) return;
      cache.set(key, data);
      setState({ data, error: null, fetching: false });
    } catch (e) {
      if (id !== seq.current) return;
      setState((s) => ({ data: s.data, error: e as Error, fetching: false }));
    }
  }, [key]);

  useEffect(() => {
    if (!isEnabled || !key) return undefined;
    setState({ data: cache.get(key) as T | undefined, error: null, fetching: true });
    void run();
    const entry = { key, refetch: () => void run() };
    active.add(entry);
    return () => {
      active.delete(entry);
      seq.current += 1;
    };
  }, [key, isEnabled, run]);

  return {
    data: state.data,
    error: state.error,
    isLoading: state.fetching && state.data === undefined,
    isFetching: state.fetching,
    refetch: run,
  };
}
