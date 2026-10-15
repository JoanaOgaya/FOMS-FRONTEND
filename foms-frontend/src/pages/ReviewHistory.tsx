import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useReviewHistory } from '../hooks/useDuplicates';
import { canDo } from '../utils/roleAccess';
import StatusBadge from '../components/shared/StatusBadge';
import Button from '../components/Buttons';
import type { ReviewHistoryItem } from '../services/duplicates.service';

const ReviewHistory: React.FC = () => {
  const { user } = useAuth();
  const canExport = canDo(user?.role, 'reviewHistory', 'export');

  const {
    items,
    total,
    isLoading,
    error,
    refetch,
    page,
    setPage,
    pageSize,
    search,
    setSearch,
    decisionFilter,
    setDecisionFilter,
    dateFrom,
    setDateFrom,
    applyFilters,
    resetFilters,
    scope,
  } = useReviewHistory();

  const [selectedRecord, setSelectedRecord] = useState<ReviewHistoryItem | null>(null);

  const handleExport = () => {
    if (!canExport || items.length === 0) return;

    const headers = ['History ID', 'Document Type', 'Document Number', 'Client Name', 'Decision', 'Reviewer', 'Role', 'Reason', 'Reviewed Date'];
    const rows = items.map((r) => [
      r.historyId,
      r.documentType || r.type,
      r.documentNumber,
      `"${(r.clientName || '').replace(/"/g, '""')}"`,
      r.finalDecision,
      `"${(r.reviewer || '').replace(/"/g, '""')}"`,
      r.reviewerRole,
      `"${(r.decisionReason || '').replace(/"/g, '""')}"`,
      r.reviewedDate,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `duplicate-review-history-${scope}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const decisionTabs = ['All', 'Confirmed Duplicate', 'Dismissed', 'Resolved'] as const;

  const displayedItems = React.useMemo(() => {
    if (!decisionFilter || decisionFilter === 'All') return items;
    const term = decisionFilter.toLowerCase();
    return items.filter((r) => {
      const d = (r.finalDecision || '').toLowerCase();
      if (term.includes('duplicate')) return d.includes('duplicate') || d.includes('flagged');
      if (term.includes('dismiss')) return d.includes('dismiss') || d.includes('unique');
      if (term.includes('resolve')) return d.includes('resolve') || d.includes('verified');
      return d.includes(term);
    });
  }, [items, decisionFilter]);

  const totalPages = Math.ceil(displayedItems.length / pageSize) || 1;
  const paginatedItems = displayedItems.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header Row with Export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        {canExport && (
          <Button
            title={`Export ${scope === 'all' ? 'All' : scope === 'liquidation' ? 'Liquidation' : 'My Scope'} CSV`}
            icon="ti ti-download"
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={items.length === 0}
          />
        )}
      </div>

      {scope === 'liquidation' && (
        <div style={{ padding: '10px 16px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '10px', fontSize: '0.85rem', color: '#0369A1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-filter" />
          Assistant FM Scope: Audit records restricted to liquidation &amp; expense documents
        </div>
      )}

      {/* Decision Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginRight: 4 }}>DECISION:</span>
        {decisionTabs.map((tab) => {
          const isActive = (decisionFilter === tab) || (!decisionFilter && tab === 'All');
          const colorMap: Record<string, { bg: string; color: string; border: string }> = {
            'All': { bg: '#F1F5F9', color: '#0F172A', border: '#CBD5E1' },
            'Confirmed Duplicate': { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
            'Dismissed': { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
            'Resolved': { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
          };
          const style = colorMap[tab] || colorMap['All'];
          return (
            <button
              key={tab}
              onClick={() => setDecisionFilter(tab === 'All' ? '' : tab)}
              style={{
                padding: '6px 16px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: isActive ? 800 : 600,
                cursor: 'pointer',
                border: `2px solid ${isActive ? style.color : style.border}`,
                background: isActive ? style.bg : '#fff',
                color: isActive ? style.color : '#64748B',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? `0 0 0 2px ${style.bg}` : 'none',
              }}
            >
              {tab}
              {tab !== 'All' && (
                <span style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.7 }}>
                  ({items.filter((r) => {
                    const d = (r.finalDecision || '').toLowerCase();
                    const t = tab.toLowerCase();
                    if (t.includes('duplicate')) return d.includes('duplicate') || d.includes('flagged');
                    if (t.includes('dismiss')) return d.includes('dismiss') || d.includes('unique');
                    if (t.includes('resolve')) return d.includes('resolve') || d.includes('verified');
                    return false;
                  }).length})
                </span>
              )}
              {tab === 'All' && (
                <span style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.7 }}>({items.length})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: '260px', flex: 1 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 16 }} />
            <input
              type="text"
              placeholder="Search by ID, document #, reviewer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 14px 9px 38px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                outline: 'none',
                background: '#F8FAFC',
                color: '#1E293B',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, background 0.2s'
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0D9488'; e.currentTarget.style.background = '#fff'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#F8FAFC'; }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Date:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                outline: 'none',
                background: '#F8FAFC',
                color: '#334155'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { applyFilters(); }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#0D9488',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <i className="ti ti-check" />
            Apply
          </button>
          <button
            onClick={() => { resetFilters(); }}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              background: '#fff',
              color: '#64748B',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ padding: '16px 20px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, color: '#991B1B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Error loading review history:</strong> {error.message || 'Unknown error'}
          </div>
          <button onClick={() => refetch()} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 32, color: '#0D9488', marginBottom: 12 }} />
          <div style={{ fontWeight: 600 }}>Loading review history...</div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && displayedItems.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F1F5F9', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>
            <i className="ti ti-history" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>No review history found</div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
            No past duplicate review decisions match your filter criteria.
          </p>
        </div>
      )}

      {/* Cards Grid */}
      {!isLoading && !error && displayedItems.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {paginatedItems.map((row) => {
            return (
              <div
                key={row.id}
                style={{
                  background: '#fff',
                  border: '1px solid #E2E8F0',
                  borderRadius: 14,
                  padding: 22,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  position: 'relative'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px -4px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                }}
              >
                {/* Top Row: History ID + Final Decision Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A' }}>
                    HISTORY #{row.historyId}
                  </span>
                  <StatusBadge status={row.finalDecision} />
                </div>

                {/* Target Document & Client */}
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                    {row.documentNumber || '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
                      {row.clientName || 'General Account'}
                    </span>
                  </div>
                </div>

                {/* Reviewer & Decision Remarks Box */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Reviewer</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                      {row.reviewer}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>
                    Role: <strong style={{ color: '#475569' }}>{row.reviewerRole}</strong>
                  </div>
                  {row.decisionReason && (
                    <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic', borderTop: '1px solid #E2E8F0', paddingTop: 6, marginTop: 2 }}>
                      "{row.decisionReason.replace(/â,±/g, '₱')}"
                    </div>
                  )}
                </div>

                {/* Reviewed Date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748B' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-calendar-check" style={{ color: '#0D9488' }} />
                    <span>Reviewed: {row.reviewedDate}</span>
                  </div>
                </div>

                {/* Action Footer */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    title="Inspect"
                    variant="secondary"
                    size="sm"
                    icon="ti-eye"
                    onClick={() => setSelectedRecord(row)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && displayedItems.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px', fontSize: 13, color: '#64748B' }}>
          <div>
            Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, displayedItems.length)} of {displayedItems.length} records
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: page <= 1 ? '#F8FAFC' : '#fff',
                color: page <= 1 ? '#CBD5E1' : '#334155',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 12
              }}
            >
              Previous
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontWeight: 700, color: '#0F172A' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: page >= totalPages ? '#F8FAFC' : '#fff',
                color: page >= totalPages ? '#CBD5E1' : '#334155',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 12
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedRecord && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(3px)'
          }}
          onClick={() => setSelectedRecord(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, padding: 26, maxWidth: 520, width: '92%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #E2E8F0'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                  Review Audit Record
                </h3>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  History ID #{selectedRecord.historyId}
                </div>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: 18,
                  color: '#64748B'
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Target Document</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedRecord.documentNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Client / Account</span>
                <span style={{ fontWeight: 600 }}>{selectedRecord.clientName}</span>
              </div>

              {/* Complete Multi-Step Audit Trail */}
              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Decision Audit Trail
                </div>

                {/* Step 1: AI Detection */}
                <div style={{ borderLeft: '3px solid #0D9488', paddingLeft: 12 }}>
                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.82rem' }}>1. AI Detection Flag</div>
                  <div style={{ color: '#64748B', fontSize: '0.78rem', marginTop: 2 }}>Result: {selectedRecord.aiResult}</div>
                  <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginTop: 1 }}>Flagged: {selectedRecord.aiFlagDate || selectedRecord.reviewedDate}</div>
                </div>

                {/* Step 2: Level 1 Decision (Accountant) */}
                <div style={{ borderLeft: '3px solid #3B82F6', paddingLeft: 12 }}>
                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.82rem' }}>2. Level 1 Decision (Accountant)</div>
                  <div style={{ color: '#1E40AF', fontSize: '0.78rem', fontWeight: 600, marginTop: 2 }}>
                    Decision: {selectedRecord.accountantDecision || 'Marked as Duplicate'}
                  </div>
                  {selectedRecord.accountantRemarks && (
                    <div style={{ color: '#475569', fontSize: '0.78rem', fontStyle: 'italic', marginTop: 2 }}>
                      Remarks: "{selectedRecord.accountantRemarks}"
                    </div>
                  )}
                  {selectedRecord.accountantDecidedAt && (
                    <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginTop: 1 }}>Decided: {selectedRecord.accountantDecidedAt}</div>
                  )}
                </div>

                {/* Step 3: Level 2 Review (Head Accountant) */}
                <div style={{ borderLeft: '3px solid #10B981', paddingLeft: 12 }}>
                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.82rem' }}>3. Level 2 Approval (Head Accountant)</div>
                  <div style={{ color: '#065F46', fontSize: '0.78rem', fontWeight: 600, marginTop: 2 }}>
                    Final Decision: {selectedRecord.finalDecision}
                  </div>
                  <div style={{ color: '#64748B', fontSize: '0.78rem', marginTop: 2 }}>
                    Reviewer: {selectedRecord.reviewer} ({selectedRecord.reviewerRole})
                  </div>
                  {selectedRecord.decisionReason && (
                    <div style={{ color: '#475569', fontSize: '0.78rem', fontStyle: 'italic', marginTop: 2 }}>
                      Supervisor Remarks: "{selectedRecord.decisionReason}"
                    </div>
                  )}
                  <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginTop: 1 }}>Approved: {selectedRecord.reviewedDate}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
              <Button title="Close" variant="secondary" size="sm" onClick={() => setSelectedRecord(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewHistory;
