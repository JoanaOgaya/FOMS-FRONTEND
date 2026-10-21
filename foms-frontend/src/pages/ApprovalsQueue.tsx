import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ApprovalRequest } from '../types/approvals';
import { approvalsService, formatApprovalErrorMessage } from '../services/approvalsService';
import { formatCurrency, formatDateTime } from '../utils/format';
import { StatusBadge } from '../components/shared/StatusBadge';
import { ApprovalDetailDrawer } from '../components/approvals/ApprovalDetailDrawer';
import { useAuth } from '../context/AuthContext';

export interface ApprovalsQueueProps {
  mode?: 'all' | 'escalated';
}

export const ApprovalsQueue: React.FC<ApprovalsQueueProps> = ({ mode = 'all' }) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const typeParam = searchParams.get('type') || 'ALL';
  const statusParam = searchParams.get('status') || (mode === 'escalated' ? 'PendingFinanceManager' : 'ALL');

  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const isEscalatedView = mode === 'escalated' || user?.role === 'FINANCIAL_MANAGER';

  const fetchItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (typeParam !== 'ALL') params.entityType = typeParam;
      if (statusParam !== 'ALL') params.status = statusParam;
      if (mode === 'escalated') params.level = 'FinanceManager';

      const res = await approvalsService.getPending(params);
      setItems(res.items || []);
    } catch (err) {
      setError(formatApprovalErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [typeParam, statusParam, mode]);

  const setFilter = (key: 'type' | 'status', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'ALL') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next);
  };

  const TYPE_OPTIONS = [
    { label: 'All Types', value: 'ALL' },
    { label: 'Payments', value: 'Payment' },
    { label: 'Settlements', value: 'Settlement' },
    { label: 'Financial Adjustments', value: 'FinancialAdjustment' },
    { label: 'Cash Advances', value: 'CashAdvance' },
  ];

  const STATUS_OPTIONS = [
    { label: 'All Statuses', value: 'ALL' },
    { label: 'Submitted', value: 'Submitted' },
    { label: 'Pending FM', value: 'PendingFinanceManager' },
    { label: 'Approved', value: 'Approved' },
    { label: 'Returned', value: 'ReturnedForRevision' },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: isEscalatedView ? '#D97706' : '#2563EB',
                background: isEscalatedView ? '#FEF3C7' : '#EFF6FF',
                padding: '4px 10px',
                borderRadius: '6px',
              }}
            >
              {isEscalatedView ? 'Escalated Level 2' : 'Approval Queue Level 1'}
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
            {isEscalatedView ? 'Escalated Approvals' : 'Approvals Queue'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748B' }}>
            Review, verify, and action financial transactions awaiting approval.
          </p>
        </div>

        <button
          onClick={fetchItems}
          disabled={isLoading}
          style={{
            padding: '9px 16px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className={`ti ti-refresh ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters Bar */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div>
            <label htmlFor="filter-type" style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Transaction Type
            </label>
            <select
              id="filter-type"
              value={typeParam}
              onChange={(e) => setFilter('type', e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                color: '#1E293B',
                background: '#FFFFFF',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-status" style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Status
            </label>
            <select
              id="filter-status"
              value={statusParam}
              onChange={(e) => setFilter('status', e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                color: '#1E293B',
                background: '#FFFFFF',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
          Showing {items.length} record{items.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Table Data View */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        }}
      >
        {isLoading ? (
          /* Loading Skeleton */
          <div style={{ padding: '24px' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  height: '44px',
                  background: '#F1F5F9',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  animation: 'pulse 1.5s infinite',
                }}
              />
            ))}
          </div>
        ) : error ? (
          /* Error State */
          <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '720px', margin: '0 auto' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '24px',
              }}
            >
              <i className="ti ti-alert-triangle" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: '#991B1B' }}>
              Failed to Load Approvals
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748B' }}>
              The server encountered an error while retrieving the pending approvals.
            </p>
            {error && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  margin: '0 auto 20px',
                  textAlign: 'left',
                  fontSize: '12px',
                  color: '#991B1B',
                  fontFamily: 'ui-monospace, monospace',
                  wordBreak: 'break-word',
                  lineHeight: '1.5',
                  maxHeight: '140px',
                  overflowY: 'auto',
                }}
              >
                <strong style={{ display: 'block', marginBottom: '4px', color: '#7F1D1D' }}>Backend Error:</strong>
                {error}
              </div>
            )}
            <button
              onClick={fetchItems}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#DC2626',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)',
              }}
            >
              <i className="ti ti-refresh" /> Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          /* Empty State */
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#F1F5F9',
                color: '#94A3B8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '24px',
              }}
            >
              <i className="ti ti-clipboard-check" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#334155' }}>
              No Pending Approvals Found
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748B' }}>
              All transactions matching your filter criteria have been processed.
            </p>
          </div>
        ) : (
          /* Real Data Table */
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Type
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Reference No.
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Requester
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Amount (PHP)
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Date Submitted
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedRequestId(row.id)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedRequestId(row.id);
                      }
                    }}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '14px 18px', fontWeight: 600, color: '#1E293B' }}>
                      <span
                        style={{
                          background: '#F1F5F9',
                          color: '#334155',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {row.entityType}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#2563EB' }}>
                      {row.referenceNo}
                      {row.isEscalated === true && (
                        <span
                          style={{
                            marginLeft: '8px',
                            background: '#FEF3C7',
                            color: '#B45309',
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                          }}
                          title="Item is escalated to Finance Manager"
                        >
                          Escalated
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#475569' }}>
                      {row.requestedBy || 'N/A'}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                      {formatCurrency(row.amount)}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#64748B' }}>
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#2563EB',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        Review <i className="ti ti-chevron-right" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <ApprovalDetailDrawer
        isOpen={Boolean(selectedRequestId)}
        requestId={selectedRequestId}
        onClose={() => setSelectedRequestId(null)}
        onActionSuccess={fetchItems}
      />
    </div>
  );
};

export default ApprovalsQueue;
