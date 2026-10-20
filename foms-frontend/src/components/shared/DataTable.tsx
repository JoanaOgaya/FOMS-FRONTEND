import React from 'react';
import Button from '../Buttons';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sort?: { sortBy: string; sortDir: 'asc' | 'desc' };
  onSort?: (sortBy: string) => void;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  emptyMessage?: string;
  /** Per-row action column (e.g. <ActionButtons />). */
  renderActions?: (row: T) => React.ReactNode;
}

const th: React.CSSProperties = { padding: '10px 14px', fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' };
const td: React.CSSProperties = { padding: '12px 14px', fontSize: '0.85rem', color: '#0F172A', borderBottom: '1px solid #F1F5F9' };

/** Server-driven table: sorting and paging are delegated to the caller (useList → API query params). */
export function DataTable<T>({
  rows, columns, rowKey, total, page, pageSize, onPageChange, sort, onSort, isLoading, error, onRetry, emptyMessage = 'No records yet', renderActions,
}: DataTableProps<T>) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ ...th, textAlign: c.align ?? 'left', cursor: c.sortable ? 'pointer' : 'default' }}
                  onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
                  aria-sort={sort?.sortBy === c.key ? (sort.sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.label}{sort?.sortBy === c.key ? (sort.sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              {renderActions && <th style={{ ...th, textAlign: 'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={columns.length + (renderActions ? 1 : 0)} style={{ ...td, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
            )}
            {!isLoading && rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} style={{ ...td, textAlign: c.align ?? 'left' }}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                  </td>
                ))}
                {renderActions && <td style={{ ...td, textAlign: 'right' }}>{renderActions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isLoading && rows.length === 0 && <EmptyState message={emptyMessage} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', fontSize: '0.8rem', color: '#64748B' }}>
        <span>{from}–{to} of {total}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button title="Previous" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />
          <span>Page {page} of {totalPages}</span>
          <Button title="Next" variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} />
        </div>
      </div>
    </div>
  );
}

export default DataTable;
