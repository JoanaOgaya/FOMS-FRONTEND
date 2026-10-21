/**
 * useDuplicates.ts — hooks for the Duplicate Detection pages.
 * Uses the ONE central query cache (useQuery).
 * Scope (?scope=all|own|liquidation) comes from roleAccess; the backend enforces it.
 * The frontend never re-filters or re-scores rows.
 * Realtime: refetches on 'aiDuplicates' and duplicate events (WebSocket, polling fallback).
 */
import { useAuth } from '../context/AuthContext';
import {
  duplicatesService,
  type DuplicateFlagItem,
  type DuplicateQuery,
  type ReviewHistoryItem,
  type UniqueDocumentItem,
} from '../services/duplicates.service';
import type { Paged } from '../types/entities';
import { getDuplicateScope } from '../utils/roleAccess';
import { lockedQueueStatus } from '../utils/duplicateWorkflow';
import { useQuery } from './useQuery';
import { useState } from 'react';

export const DUPLICATE_TOPIC = 'aiDuplicates';

interface Filters {
  search: string;
  /** Status filter (flags) or decision filter (history) or document type (unique docs). */
  filter: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY: Filters = { search: '', filter: '', dateFrom: '', dateTo: '' };

function useDuplicateList<T>(
  fetcher: (q: DuplicateQuery) => Promise<Paged<T>>,
  filterParam: 'status' | 'documentType' | 'decision',
  options: { pageSize?: number; lockedFilter?: string; initialStatus?: string } = {},
) {
  const { user } = useAuth();
  const scope = getDuplicateScope(user?.role);
  const lockedFilter = options.lockedFilter;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(options.pageSize ?? 10);
  const [draft, setDraft] = useState<Filters>(() => ({
    search: '',
    filter: options.initialStatus ?? '',
    dateFrom: '',
    dateTo: '',
  }));
  const [applied, setApplied] = useState<Filters>(() => ({
    search: '',
    filter: options.initialStatus ?? '',
    dateFrom: '',
    dateTo: '',
  }));

  const queryKey = `duplicates:${filterParam}:${scope}:${page}:${pageSize}:${applied.search}:${lockedFilter || applied.filter}:${applied.dateFrom}:${applied.dateTo}`;

  const query = useQuery<Paged<T>>(
    queryKey,
    () =>
      fetcher({
        scope,
        page,
        pageSize,
        search: applied.search || undefined,
        [filterParam]: (lockedFilter || applied.filter) ? (lockedFilter || applied.filter) : undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
      }),
    { enabled: !!user },
  );

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? query.data?.items?.length ?? 0;

  const setField = (key: keyof Filters) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return {
    items,
    total,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    page,
    setPage,
    pageSize,
    setPageSize,
    search: draft.search,
    setSearch: setField('search'),
    filter: draft.filter,
    setFilter: setField('filter'),
    // Aliases for compatibility with page components
    statusFilter: draft.filter,
    setStatusFilter: setField('filter'),
    docTypeFilter: draft.filter,
    setDocTypeFilter: (value: string) => {
      setDraft((d) => ({ ...d, filter: value }));
      setApplied((a) => ({ ...a, filter: value }));
      setPage(1);
    },
    decisionFilter: draft.filter,
    setDecisionFilter: (value: string) => {
      setDraft((d) => ({ ...d, filter: value }));
      setApplied((a) => ({ ...a, filter: value }));
      setPage(1);
    },
    dateFrom: draft.dateFrom,
    setDateFrom: setField('dateFrom'),
    dateTo: draft.dateTo,
    setDateTo: setField('dateTo'),
    applyFilters: () => {
      setPage(1);
      setApplied(draft);
    },
    resetFilters: () => {
      setDraft(EMPTY);
      setPage(1);
      setApplied(EMPTY);
    },
    scope,
    lockedFilter,
  };
}

/** Flagged Duplicates. Head Accountant's queue is locked to PENDING_REVIEW ("For Review"). */
export function useFlaggedDuplicates(options: { pageSize?: number; initialStatus?: string } = {}) {
  const { user } = useAuth();
  return useDuplicateList<DuplicateFlagItem>(duplicatesService.flagged, 'status', {
    ...options,
    lockedFilter: lockedQueueStatus(user?.role) ?? options.initialStatus,
  });
}

export function useUniqueDocuments(options: { pageSize?: number } = {}) {
  return useDuplicateList<UniqueDocumentItem>(duplicatesService.uniqueDocuments, 'documentType', options);
}

export function useReviewHistory(options: { pageSize?: number } = {}) {
  return useDuplicateList<ReviewHistoryItem>(duplicatesService.reviewHistory, 'decision', options);
}
