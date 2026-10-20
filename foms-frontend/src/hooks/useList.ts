/**
 * useList — search + filter(Apply/Reset) + sort + pagination, all sent to the API as query params.
 * Every list page uses this instead of re-implementing the logic.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ListQuery, Paged } from '../types/entities';
import { useQuery } from './useQuery';

export type FilterValues = Record<string, string>;

export interface UseListOptions {
  pageSize?: number;
  initialFilters?: FilterValues;
  defaultSort?: { sortBy: string; sortDir: 'asc' | 'desc' };
  enabled?: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;

export function useList<T>(domain: string, fetcher: (query: ListQuery) => Promise<Paged<T>>, options: UseListOptions = {}) {
  const { pageSize = 10, initialFilters = {}, defaultSort, enabled = true } = options;

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<FilterValues>(initialFilters);
  const [applied, setApplied] = useState<FilterValues>(initialFilters);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(defaultSort);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useMemo<ListQuery>(() => {
    const q: ListQuery = { page, pageSize };
    if (search) q.search = search;
    Object.entries(applied).forEach(([k, v]) => { if (v) q[k] = v; });
    if (sort) { q.sortBy = sort.sortBy; q.sortDir = sort.sortDir; }
    return q;
  }, [page, pageSize, search, applied, sort]);

  const result = useQuery(`${domain}:${JSON.stringify(query)}`, () => fetcher(query), { enabled });
  const rows = result.data?.items ?? [];
  const total = result.data?.total ?? 0;

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    setPage,
    searchInput,
    setSearchInput,
    filters: draft,
    setFilter: (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value })),
    applyFilters: () => { setApplied(draft); setPage(1); },
    resetFilters: () => { setDraft(initialFilters); setApplied(initialFilters); setSearchInput(''); setSearch(''); setPage(1); },
    sort,
    toggleSort: (sortBy: string) => {
      setSort((s) => (s?.sortBy === sortBy ? { sortBy, sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' } : { sortBy, sortDir: 'asc' }));
      setPage(1);
    },
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error,
    isEmpty: !result.isLoading && !result.error && rows.length === 0,
    refetch: result.refetch,
  };
}
