import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ApprovalRequest } from '../types/approvals';
import { approvalsService, formatApprovalErrorMessage } from '../services/approvalsService';
import { formatCurrency, formatDateTime, getInitials } from '../utils/format';
import { StatusBadge } from '../components/shared/StatusBadge';
import { ApprovalDetailDrawer } from '../components/approvals/ApprovalDetailDrawer';
import { useAuth } from '../context/AuthContext';

export interface ApprovalsQueueProps {
  mode?: 'all' | 'escalated';
}

function getEntityTypeIcon(entityType?: string): string {
  switch (entityType?.toLowerCase()) {
    case 'cashoutflow':
      return 'ti ti-cash';
    case 'payment':
      return 'ti ti-receipt';
    case 'settlement':
      return 'ti ti-calculator';
    case 'cashadvance':
      return 'ti ti-wallet';
    case 'financialadjustment':
      return 'ti ti-adjustments-alt';
    default:
      return 'ti ti-file-text';
  }
}

function formatEntityType(entityType?: string): string {
  switch (entityType?.toLowerCase()) {
    case 'cashoutflow':
      return 'Cash Outflow';
    case 'payment':
      return 'Payment';
    case 'settlement':
      return 'Settlement';
    case 'cashadvance':
      return 'Cash Advance';
    case 'financialadjustment':
      return 'Financial Adjustment';
    default:
      return entityType || 'Transaction';
  }
}

export const ApprovalsQueue: React.FC<ApprovalsQueueProps> = ({ mode = 'all' }) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Status and type filter parameters from URL
  const typeParam = searchParams.get('type') || 'ALL';
  const statusParam = searchParams.has('status')
    ? (searchParams.get('status') || 'ALL')
    : (mode === 'escalated' ? 'PendingFinanceManager' : 'ALL');

  // Raw items from API (unfiltered) and UI states
  const [allItems, setAllItems] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // View mode: default to 'cards', with 'table' as an interactive option (remembered in localStorage)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    try {
      const saved = localStorage.getItem('foms_approvals_view_mode');
      return saved === 'table' ? 'table' : 'cards';
    } catch {
      return 'cards';
    }
  });

  const handleViewModeChange = (newMode: 'cards' | 'table') => {
    setViewMode(newMode);
    try {
      localStorage.setItem('foms_approvals_view_mode', newMode);
    } catch {
      // ignore
    }
  };

  const isEscalatedView = mode === 'escalated' || user?.role === 'FINANCIAL_MANAGER';

  const fetchItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (mode === 'escalated') params.level = 'FinanceManager';

      let res;
      if (isEscalatedView) {
        try {
          res = await approvalsService.getEscalatedApprovals(params);
        } catch {
          res = await approvalsService.getPending(params);
        }
      } else {
        res = await approvalsService.getPending(params);
      }

      setAllItems(res.items || []);
    } catch (err) {
      setError(formatApprovalErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [mode]);

  const setFilter = (key: 'type' | 'status', value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next);
  };

  const TYPE_OPTIONS = [
    { label: 'All Types', value: 'ALL' },
    { label: 'Cash Outflows', value: 'CashOutflow' },
    { label: 'Payments', value: 'Payment' },
    { label: 'Settlements', value: 'Settlement' },
    { label: 'Financial Adjustments', value: 'FinancialAdjustment' },
    { label: 'Cash Advances', value: 'CashAdvance' },
  ];

  const STATUS_OPTIONS = [
    { label: 'All Statuses', value: 'ALL' },
    { label: 'Pending FM', value: 'PendingFinanceManager' },
    { label: 'Approved', value: 'Approved' },
    { label: 'Returned', value: 'ReturnedForRevision' },
    { label: 'Submitted', value: 'Submitted' },
  ];

  // Accurate overall status breakdown computed from all records
  const statusCounts = useMemo(() => {
    return {
      all: allItems.length,
      pending: allItems.filter((i) => i.status === 'PendingFinanceManager' || (i.status as string) === 'Pending').length,
      approved: allItems.filter((i) => i.status === 'Approved').length,
      returned: allItems.filter((i) => i.status === 'ReturnedForRevision' || i.status === 'Returned').length,
    };
  }, [allItems]);

  // Client filtering across status, entityType, and search term
  const filteredItems = useMemo(() => {
    let list = allItems;

    // Filter by Status:
    if (statusParam !== 'ALL') {
      list = list.filter((item) => {
        if (statusParam === 'PendingFinanceManager') {
          return item.status === 'PendingFinanceManager' || (item.status as string) === 'Pending';
        }
        if (statusParam === 'ReturnedForRevision') {
          return item.status === 'ReturnedForRevision' || item.status === 'Returned';
        }
        return item.status === statusParam;
      });
    }

    // Filter by Entity Type:
    if (typeParam !== 'ALL') {
      list = list.filter((item) => item.entityType?.toLowerCase() === typeParam.toLowerCase());
    }

    // Filter by Search Query:
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter((item) => {
        const refMatch = item.referenceNo?.toLowerCase().includes(term);
        const reqMatch = item.requestedBy?.toLowerCase().includes(term);
        const purposeMatch = (item.purpose || item.description || '').toLowerCase().includes(term);
        const typeMatch = item.entityType?.toLowerCase().includes(term);
        return Boolean(refMatch || reqMatch || purposeMatch || typeMatch);
      });
    }

    return list;
  }, [allItems, statusParam, typeParam, searchTerm]);

  const hasActiveFilters = statusParam !== 'ALL' || typeParam !== 'ALL' || Boolean(searchTerm.trim());

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Page Header */}
      <div
        style={{
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {isEscalatedView ? 'Escalated Approvals' : 'Approvals Queue'}
            </h1>
            {isEscalatedView && (
              <span
                style={{
                  background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                  color: '#92400E',
                  border: '1px solid #FCD34D',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 1px 2px rgba(217, 119, 6, 0.1)',
                }}
              >
                <i className="ti ti-urgent" style={{ fontSize: '13px' }} />
                Final Authority
              </span>
            )}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#64748B' }}>
            {isEscalatedView
              ? 'Review and action high-value financial transactions escalated for final approval.'
              : 'Review, verify, and action financial transactions awaiting approval.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#94A3B8')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#CBD5E1')}
          >
            <i className={`ti ti-refresh ${isLoading ? 'animate-spin' : ''}`} style={{ fontSize: '15px' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Clean, Unified Filter & Control Bar */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Row 1: Search, Filter dropdowns, and View toggle */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Left Controls: Search + Type + Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: '1 1 auto' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '260px' }}>
              <i
                className="ti ti-search"
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94A3B8',
                  fontSize: '15px',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                data-testid="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search reference, requester..."
                style={{
                  width: '100%',
                  padding: '8px 30px 8px 34px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  color: '#1E293B',
                  background: '#F8FAFC',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#2563EB';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = '#F8FAFC';
                  e.currentTarget.style.borderColor = '#CBD5E1';
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                  title="Clear search"
                >
                  <i className="ti ti-x" style={{ fontSize: '13px' }} />
                </button>
              )}
            </div>

            {/* Type Dropdown */}
            <select
              id="filter-type"
              data-testid="filter-type-select"
              value={typeParam}
              onChange={(e) => setFilter('type', e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                fontWeight: 600,
                color: '#334155',
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

            {/* Status Dropdown */}
            <select
              id="filter-status"
              data-testid="filter-status-select"
              value={statusParam}
              onChange={(e) => setFilter('status', e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                fontWeight: 600,
                color: '#334155',
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

          {/* Right Controls: Showing records count & View toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Showing <strong style={{ color: '#0F172A' }}>{filteredItems.length}</strong> record{filteredItems.length === 1 ? '' : 's'}
            </span>

            {/* View Mode Switcher */}
            <div
              style={{
                display: 'inline-flex',
                background: '#F1F5F9',
                padding: '3px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                gap: '2px',
              }}
              role="group"
              aria-label="View layout toggle"
            >
              <button
                type="button"
                data-testid="view-cards-btn"
                onClick={() => handleViewModeChange('cards')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'cards' ? '#2563EB' : 'transparent',
                  color: viewMode === 'cards' ? '#FFFFFF' : '#64748B',
                  boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(37, 99, 235, 0.3)' : 'none',
                  transition: 'all 0.15s ease',
                }}
                title="View as Cards"
              >
                <i className="ti ti-layout-grid" style={{ fontSize: '14px' }} />
                Cards
              </button>
              <button
                type="button"
                data-testid="view-table-btn"
                onClick={() => handleViewModeChange('table')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'table' ? '#2563EB' : 'transparent',
                  color: viewMode === 'table' ? '#FFFFFF' : '#64748B',
                  boxShadow: viewMode === 'table' ? '0 1px 3px rgba(37, 99, 235, 0.3)' : 'none',
                  transition: 'all 0.15s ease',
                }}
                title="View as Table"
              >
                <i className="ti ti-table" style={{ fontSize: '14px' }} />
                Table
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Quick Status Chips with counts */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            paddingTop: '10px',
            borderTop: '1px solid #F1F5F9',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Quick Status:
          </span>

          <button
            type="button"
            onClick={() => setFilter('status', 'ALL')}
            style={{
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: statusParam === 'ALL' ? '1px solid #2563EB' : '1px solid #E2E8F0',
              background: statusParam === 'ALL' ? '#EFF6FF' : '#FFFFFF',
              color: statusParam === 'ALL' ? '#1D4ED8' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            All ({statusCounts.all})
          </button>

          <button
            type="button"
            onClick={() => setFilter('status', 'PendingFinanceManager')}
            style={{
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: statusParam === 'PendingFinanceManager' ? '1px solid #D97706' : '1px solid #E2E8F0',
              background: statusParam === 'PendingFinanceManager' ? '#FFFBEB' : '#FFFFFF',
              color: statusParam === 'PendingFinanceManager' ? '#B45309' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            Pending FM ({statusCounts.pending})
          </button>

          <button
            type="button"
            onClick={() => setFilter('status', 'Approved')}
            style={{
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: statusParam === 'Approved' ? '1px solid #059669' : '1px solid #E2E8F0',
              background: statusParam === 'Approved' ? '#ECFDF5' : '#FFFFFF',
              color: statusParam === 'Approved' ? '#047857' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            Approved ({statusCounts.approved})
          </button>

          <button
            type="button"
            onClick={() => setFilter('status', 'ReturnedForRevision')}
            style={{
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: statusParam === 'ReturnedForRevision' ? '1px solid #DC2626' : '1px solid #E2E8F0',
              background: statusParam === 'ReturnedForRevision' ? '#FEF2F2' : '#FFFFFF',
              color: statusParam === 'ReturnedForRevision' ? '#B91C1C' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            Returned ({statusCounts.returned})
          </button>

          {/* Subtle Clear Filters Action */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilter('status', 'ALL');
                setFilter('type', 'ALL');
              }}
              style={{
                marginLeft: 'auto',
                padding: '4px 9px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#F8FAFC',
                color: '#64748B',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'background 0.15s ease',
              }}
              title="Reset search and filters"
            >
              <i className="ti ti-x" style={{ fontSize: '12px' }} />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        /* Loading Skeleton */
        viewMode === 'cards' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '20px',
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  padding: '20px',
                  height: '240px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  animation: 'pulse 1.5s infinite',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ width: '80px', height: '24px', background: '#F1F5F9', borderRadius: '6px' }} />
                  <div style={{ width: '90px', height: '24px', background: '#F1F5F9', borderRadius: '20px' }} />
                </div>
                <div style={{ height: '40px', background: '#F8FAFC', borderRadius: '10px' }} />
                <div style={{ width: '70%', height: '16px', background: '#F1F5F9', borderRadius: '4px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ width: '100px', height: '20px', background: '#F1F5F9', borderRadius: '4px' }} />
                  <div style={{ width: '80px', height: '32px', background: '#F1F5F9', borderRadius: '8px' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  height: '46px',
                  background: '#F1F5F9',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  animation: 'pulse 1.5s infinite',
                }}
              />
            ))}
          </div>
        )
      ) : error ? (
        /* Error State */
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #FEE2E2',
            padding: '48px 24px',
            textAlign: 'center',
            maxWidth: '680px',
            margin: '0 auto',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.06)',
          }}
        >
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
              fontSize: '26px',
            }}
          >
            <i className="ti ti-alert-triangle" />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#991B1B' }}>
            Failed to Load Approvals
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
            The server encountered an error while retrieving the approvals queue.
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
              padding: '10px 22px',
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
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
            }}
          >
            <i className="ti ti-refresh" /> Retry
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        /* Empty State */
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '60px 24px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '26px',
            }}
          >
            <i className="ti ti-check" />
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
            {statusParam === 'PendingFinanceManager'
              ? 'No Pending Approvals Found'
              : statusParam !== 'ALL'
              ? `No Records with Status "${statusParam}"`
              : searchTerm
              ? 'No Matching Approvals Found'
              : 'No Approvals Found'}
          </h3>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748B', maxWidth: '440px', marginInline: 'auto' }}>
            {statusParam === 'PendingFinanceManager'
              ? `All transactions requiring Financial Manager action have been processed. There are ${statusCounts.all} historical record${statusCounts.all === 1 ? '' : 's'} in the system.`
              : 'Try clearing your filters or switching to "All Statuses" to view historical records.'}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {statusCounts.all > 0 && statusParam !== 'ALL' && (
              <button
                type="button"
                onClick={() => setFilter('status', 'ALL')}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
                }}
              >
                <i className="ti ti-eye" />
                View All Statuses ({statusCounts.all})
              </button>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setFilter('status', 'ALL');
                  setFilter('type', 'ALL');
                }}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="ti ti-filter-off" />
                Clear All Filters
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'cards' ? (
        /* ═══════════════════════════════════════════════════════════
           Cards Grid View (Default)
           ═══════════════════════════════════════════════════════════ */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredItems.map((row) => (
            <div
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
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
                boxShadow: '0 2px 4px rgba(15, 23, 42, 0.04)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                cursor: 'pointer',
                position: 'relative',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(15, 23, 42, 0.12)';
                e.currentTarget.style.borderColor = '#93C5FD';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(15, 23, 42, 0.04)';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#2563EB';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.15)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(15, 23, 42, 0.04)';
              }}
            >
              {/* Card Top: Badges & Status */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: '#EFF6FF',
                        color: '#1E40AF',
                        padding: '3px 9px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <i className={getEntityTypeIcon(row.entityType)} style={{ fontSize: '12px' }} />
                      {formatEntityType(row.entityType)}
                    </span>

                    {row.isEscalated === true && (
                      <span
                        style={{
                          background: '#FEF3C7',
                          color: '#92400E',
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '20px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          border: '1px solid #FDE68A',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                        title="Escalated to Financial Manager for final approval"
                      >
                        <i className="ti ti-urgent" style={{ fontSize: '11px' }} />
                        Escalated
                      </span>
                    )}
                  </div>

                  <StatusBadge status={row.status} />
                </div>

                {/* Reference Number & Amount Box */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>
                    Reference No.
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#0F172A',
                      letterSpacing: '-0.01em',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    {row.referenceNo}
                  </div>
                </div>

                {/* Amount Banner */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Amount (PHP)
                  </span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                    {formatCurrency(row.amount)}
                  </span>
                </div>

                {/* Purpose / Remarks snippet */}
                <div style={{ fontSize: '13px', color: '#475569', minHeight: '38px', lineHeight: '1.4' }}>
                  {row.purpose || row.description ? (
                    <span
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {row.purpose || row.description}
                    </span>
                  ) : (
                    <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>No purpose remarks provided</span>
                  )}
                </div>
              </div>

              {/* Card Bottom: Requester, Date & Action Button */}
              <div>
                <div
                  style={{
                    paddingTop: '12px',
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: '#64748B',
                  }}
                >
                  {/* Requester avatar chip */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        background: '#DBEAFE',
                        color: '#1E40AF',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {getInitials(row.requestedBy || 'N A')}
                    </div>
                    <span style={{ fontWeight: 600, color: '#334155' }}>
                      {row.requestedBy || 'N/A'}
                    </span>
                  </div>

                  {/* Date */}
                  <span style={{ fontSize: '11px', color: '#94A3B8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <i className="ti ti-calendar" style={{ fontSize: '12px' }} />
                    {formatDateTime(row.createdAt)}
                  </span>
                </div>

                {/* Review Request Button */}
                <div
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#2563EB',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Review Details <i className="ti ti-arrow-right" style={{ fontSize: '13px' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════
           Table Data View (Option)
           ═══════════════════════════════════════════════════════════ */
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="approvals-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Type
                  </th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Reference No.
                  </th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Requester
                  </th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Amount (PHP)
                  </th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Date Submitted
                  </th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Status
                  </th>
                  <th style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => (
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
                          background: '#EFF6FF',
                          color: '#1E40AF',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <i className={getEntityTypeIcon(row.entityType)} style={{ fontSize: '11px' }} />
                        {formatEntityType(row.entityType)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#2563EB', fontFamily: 'ui-monospace, monospace' }}>
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
                            border: '1px solid #FDE68A',
                          }}
                          title="Item is escalated to Finance Manager"
                        >
                          Escalated
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#475569' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: '#DBEAFE',
                            color: '#1E40AF',
                            fontSize: '10px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {getInitials(row.requestedBy || 'N A')}
                        </div>
                        {row.requestedBy || 'N/A'}
                      </div>
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
        </div>
      )}

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
