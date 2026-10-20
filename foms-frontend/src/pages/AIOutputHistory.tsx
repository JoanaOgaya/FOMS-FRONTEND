import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DataTable, type ColumnDef } from '../components/DataTable';
import { TableContainer } from '../components/TableContainer';
import { CalendarPicker } from '../components/FormModals';
import StatusBadge from '../components/shared/StatusBadge';
import Button from '../components/Buttons';
import { AiErrorBoundary } from '../components/ai/ErrorBoundary';
import { aiOutputsService } from '../services/ai/aiOutputs.service';
import { getDuplicateScope, canDo } from '../utils/roleAccess';
import { formatDate, formatDateTime } from '../utils/format';
import type { AiOutputRecord } from '../types/ai';

export const AIOutputHistory: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scope = getDuplicateScope(user?.role);
  const canExport = canDo(user?.role, 'aiHistory', 'export');

  const [items, setItems] = useState<AiOutputRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<AiOutputRecord | null>(null);

  const resolveEntityUrl = useCallback((record: AiOutputRecord): string => {
    const docNum = (record.documentNumber || record.entityId || '').toUpperCase();
    if (docNum.startsWith('LIQ') || record.outputSummary?.toLowerCase().includes('liquidation')) {
      return '/liquidations';
    }
    if (docNum.startsWith('INV')) {
      return '/invoicing-desk';
    }
    if (docNum.startsWith('WB')) {
      return '/waybills';
    }
    if (docNum.startsWith('PAY') || docNum.startsWith('SPP')) {
      return '/payments';
    }
    if (record.module === 'duplicate') {
      return '/flagged-duplicates';
    }
    return '/liquidations';
  }, []);

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await aiOutputsService.list({
        page,
        pageSize,
        search: search || undefined,
        module: moduleFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        scope,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error('Failed to load AI output records.'));
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, moduleFilter, dateFrom, dateTo, scope]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleExport = () => {
    if (!canExport || items.length === 0) return;
    const headers = ['Output ID', 'Module', 'Document/Entity', 'Client', 'Summary', 'Score', 'Reviewer', 'Decision', 'Date'];
    const rows = items.map((r) => [
      r.id,
      r.module.toUpperCase(),
      r.documentNumber || r.entityId,
      `"${(r.clientName || '').replace(/"/g, '""')}"`,
      `"${(r.outputSummary || '').replace(/"/g, '""')}"`,
      r.score !== undefined ? `${r.score}%` : (r.level || 'N/A'),
      r.reviewer || 'Unreviewed',
      r.reviewDecision || 'Pending',
      r.createdAt,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ai-output-history-${scope}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const moduleBadgeStyles: Record<string, { bg: string; color: string; border: string; label: string; icon: string }> = {
    duplicate: { bg: '#EEF2FF', color: '#4F46E5', border: '#E0E7FF', label: 'DUPLICATE', icon: 'ti-copy' },
    document: { bg: '#ECFDF5', color: '#059669', border: '#D1FAE5', label: 'DOCUMENT', icon: 'ti-file-text' },
    risk: { bg: '#FEF2F2', color: '#DC2626', border: '#FEE2E2', label: 'RISK', icon: 'ti-alert-triangle' },
    collection: { bg: '#F5F3FF', color: '#7C3AED', border: '#EDE9FE', label: 'FORECASTING', icon: 'ti-chart-arrows-vertical' },
  };

  const columns: ColumnDef<AiOutputRecord>[] = [
    {
      key: 'id',
      label: 'RECORD ID',
      width: '130px',
      render: (row) => (
        <span
          style={{
            fontWeight: 700,
            color: '#0F172A',
            fontFamily: 'monospace',
            letterSpacing: '0.02em',
            fontSize: '0.85rem',
            whiteSpace: 'nowrap',
          }}
        >
          {row.id}
        </span>
      ),
    },
    {
      key: 'module',
      label: 'AI MODULE',
      width: '140px',
      render: (row) => {
        const style = moduleBadgeStyles[row.module] || {
          bg: '#F1F5F9',
          color: '#334155',
          border: '#E2E8F0',
          label: row.module.toUpperCase(),
          icon: 'ti-cpu',
        };
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: '3px 8px',
              borderRadius: 6,
              background: style.bg,
              color: style.color,
              border: `1px solid ${style.border}`,
              whiteSpace: 'nowrap',
            }}
          >
            <i className={`ti ${style.icon}`} style={{ fontSize: '11px' }} />
            {style.label}
          </span>
        );
      },
    },
    {
      key: 'documentNumber',
      label: 'LINKED ENTITY',
      width: '190px',
      render: (row) => {
        const targetUrl = resolveEntityUrl(row);
        const entityLabel = row.documentNumber || row.entityId;
        return (
          <div style={{ whiteSpace: 'nowrap' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(targetUrl);
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontWeight: 700,
                color: '#0D9488',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
              title={`Open record in ${targetUrl}`}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              <span>{entityLabel}</span>
              <span style={{ fontSize: '11px' }}>↗</span>
            </button>
            {row.clientName && (
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 2 }}>{row.clientName}</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'outputSummary',
      label: 'AI INTELLIGENCE OUTPUT',
      render: (row) => (
        <div
          style={{
            fontSize: '0.85rem',
            color: '#334155',
            lineHeight: 1.45,
            maxWidth: '380px',
          }}
          title={row.outputSummary}
        >
          {row.outputSummary}
        </div>
      ),
    },
    {
      key: 'score',
      label: 'SCORE / RATING',
      align: 'center',
      width: '130px',
      render: (row) => {
        const val = row.score !== undefined ? `${row.score}%` : row.level || 'N/A';
        const isDuplicateModule = row.module === 'duplicate';

        let bg = '#F1F5F9';
        let color = '#334155';
        let border = '#E2E8F0';

        if (row.score !== undefined) {
          if (isDuplicateModule) {
            if (row.score >= 80) {
              bg = '#FEF2F2';
              color = '#DC2626';
              border = '#FEE2E2';
            } else if (row.score > 0) {
              bg = '#FFFBEB';
              color = '#D97706';
              border = '#FEF3C7';
            } else {
              bg = '#F0FDF4';
              color = '#16A34A';
              border = '#DCFCE7';
            }
          } else {
            if (row.score >= 80) {
              bg = '#F0FDF4';
              color = '#16A34A';
              border = '#DCFCE7';
            } else if (row.score >= 50) {
              bg = '#FFFBEB';
              color = '#D97706';
              border = '#FEF3C7';
            } else {
              bg = '#FEF2F2';
              color = '#DC2626';
              border = '#FEE2E2';
            }
          }
        }

        return (
          <span
            style={{
              display: 'inline-block',
              fontWeight: 700,
              fontSize: '0.82rem',
              color,
              background: bg,
              border: `1px solid ${border}`,
              padding: '3px 10px',
              borderRadius: 6,
              minWidth: '50px',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {val}
          </span>
        );
      },
    },
    {
      key: 'reviewer',
      label: 'VALIDATION STATUS',
      width: '190px',
      render: (row) => (
        <div>
          <StatusBadge status={row.reviewDecision || 'Pending Validation'} />
          {row.reviewer && (
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4, fontWeight: 500, whiteSpace: 'nowrap' }}>
              by {row.reviewer}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: 'TIMESTAMP',
      width: '140px',
      render: (row) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <div style={{ color: '#0F172A', fontSize: '0.82rem', fontWeight: 600 }}>
            {formatDate(row.createdAt)}
          </div>
          <div style={{ color: '#94A3B8', fontSize: '0.72rem', marginTop: 1 }}>
            {new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'ACTIONS',
      align: 'right',
      width: '110px',
      render: (row) => (
        <button
          type="button"
          style={{
            padding: '5px 12px',
            fontSize: '0.8rem',
            fontWeight: 600,
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            color: '#0F172A',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedRecord(row);
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#F8FAFC';
            e.currentTarget.style.borderColor = '#94A3B8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.borderColor = '#CBD5E1';
          }}
        >
          <i className="ti ti-file-search" style={{ fontSize: '13px', color: '#0D9488' }} />
          Inspect
        </button>
      ),
    },
  ];

  return (
    <AiErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <TableContainer>
          <DataTable<AiOutputRecord>
            data={items}
            columns={columns}
            rowKey="id"
            searchPlaceholder="Search ID, document number, client..."
            searchFields={['id', 'documentNumber', 'clientName', 'outputSummary', 'entityId']}
            filters={[
              {
                key: 'module',
                label: 'All AI Modules',
                options: [
                  { label: 'Duplicate Detection', value: 'duplicate' },
                  { label: 'Document Extraction', value: 'document' },
                  { label: 'Receivable Risk', value: 'risk' },
                  { label: 'Collection Forecasting', value: 'collection' },
                ],
              },
            ]}
            customFilters={
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>From:</span>
                  <div style={{ width: '135px' }}>
                    <CalendarPicker
                      label=""
                      value={dateFrom}
                      onChange={(val) => {
                        setDateFrom(val);
                        setPage(1);
                      }}
                      placeholder="Start date..."
                      variant="filter"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>To:</span>
                  <div style={{ width: '135px' }}>
                    <CalendarPicker
                      label=""
                      value={dateTo}
                      onChange={(val) => {
                        setDateTo(val);
                        setPage(1);
                      }}
                      placeholder="End date..."
                      variant="filter"
                      minDate={dateFrom}
                    />
                  </div>
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                      setPage(1);
                    }}
                    style={{
                      border: 'none',
                      background: 'none',
                      fontSize: '12px',
                      color: '#64748B',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 6px',
                    }}
                  >
                    <i className="ti ti-x" /> Clear Dates
                  </button>
                )}
              </div>
            }
            serverSide={true}
            totalCount={total}
            defaultPageSize={pageSize}
            pageSizeOptions={[10, 25, 50]}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            onSearchChange={(q) => {
              setSearch(q);
              setPage(1);
            }}
            onFilterChange={(f) => {
              setModuleFilter(f.module || '');
              setPage(1);
            }}
            exportable={canExport}
            onExport={handleExport}
            loading={isLoading}
            emptyMessage="No AI output history records found."
            onRowClick={(row) => setSelectedRecord(row)}
          />
        </TableContainer>

        {/* Modal for detail inspection */}
        {selectedRecord && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.55)',
              backdropFilter: 'blur(3px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setSelectedRecord(null)}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                maxWidth: 520,
                width: '100%',
                padding: 24,
                boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
                border: '1px solid #E2E8F0',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    <i className="ti ti-cpu" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                      AI Output Inspection
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'monospace' }}>
                      {selectedRecord.id}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  style={{ background: '#F1F5F9', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#64748B', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>AI Module</span>
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', color: '#0F172A' }}>{selectedRecord.module}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Target Entity</span>
                  <button
                    type="button"
                    onClick={() => {
                      const targetUrl = resolveEntityUrl(selectedRecord);
                      navigate(targetUrl);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontWeight: 700,
                      color: '#0D9488',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.85rem',
                      textDecoration: 'underline',
                    }}
                    title={`Open record in ${resolveEntityUrl(selectedRecord)}`}
                  >
                    <span>{selectedRecord.documentNumber || selectedRecord.entityId}</span>
                    <span style={{ fontSize: '11px' }}>↗</span>
                  </button>
                </div>
                {selectedRecord.clientName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Client / Submitter</span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedRecord.clientName}</span>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>AI Intelligence Output</span>
                  <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, color: '#0F172A', border: '1px solid #E2E8F0', lineHeight: 1.5 }}>
                    {selectedRecord.outputSummary}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Score / Confidence</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>
                    {selectedRecord.score !== undefined ? `${selectedRecord.score}%` : selectedRecord.level || 'N/A'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Validation Status</span>
                  <StatusBadge status={selectedRecord.reviewDecision || 'Pending Validation'} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Human Reviewer</span>
                  <span style={{ color: '#0F172A', fontWeight: 500 }}>
                    {selectedRecord.reviewer || 'Unreviewed'} {selectedRecord.reviewerRole ? `(${selectedRecord.reviewerRole})` : ''}
                  </span>
                </div>
                {selectedRecord.remarks && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Reviewer Remarks</span>
                    <div style={{ background: '#FFFBEB', padding: 10, borderRadius: 8, color: '#92400E', border: '1px solid #FDE68A', fontStyle: 'italic', lineHeight: 1.5 }}>
                      "{selectedRecord.remarks}"
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>Recorded Timestamp</span>
                  <span style={{ color: '#64748B', fontSize: '0.8rem' }}>{formatDateTime(selectedRecord.createdAt)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    const targetUrl = resolveEntityUrl(selectedRecord);
                    navigate(targetUrl);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#0D9488',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  Open Linked Record <i className="ti ti-arrow-right" />
                </button>
                <Button title="Close" variant="secondary" size="sm" onClick={() => setSelectedRecord(null)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </AiErrorBoundary>
  );
};

export default AIOutputHistory;
