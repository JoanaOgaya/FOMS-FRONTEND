import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { DataTable, type Column } from '../components/shared/DataTable';
import FilterBar from '../components/shared/FilterBar';
import Button from '../components/Buttons';
import { AiErrorBoundary } from '../components/ai/ErrorBoundary';
import { aiOutputsService } from '../services/ai/aiOutputs.service';
import { getDuplicateScope, canDo } from '../utils/roleAccess';
import type { AiOutputRecord } from '../types/ai';

export const AIOutputHistory: React.FC = () => {
  const { user } = useAuth();
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
  const [selectedRecord, setSelectedRecord] = useState<AiOutputRecord | null>(null);

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
  }, [page, pageSize, search, moduleFilter, dateFrom, scope]);

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
      r.score !== undefined ? `${r.score}%` : 'N/A',
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

  const columns: Column<AiOutputRecord>[] = [
    {
      key: 'id',
      label: 'RECORD ID',
      render: (row) => <span style={{ fontWeight: 700, color: '#0F172A' }}>{row.id}</span>,
    },
    {
      key: 'module',
      label: 'AI MODULE',
      render: (row) => (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            padding: '2px 8px',
            borderRadius: 4,
            background: '#F1F5F9',
            color: '#334155',
          }}
        >
          {row.module}
        </span>
      ),
    },
    {
      key: 'documentNumber',
      label: 'LINKED ENTITY',
      render: (row) => (
        <div>
          {row.linkUrl ? (
            <a
              href={row.linkUrl}
              style={{ fontWeight: 700, color: '#0D9488', textDecoration: 'none' }}
              title="Click to navigate to official record"
            >
              {row.documentNumber || row.entityId} ↗
            </a>
          ) : (
            <span style={{ fontWeight: 700, color: '#0F172A' }}>{row.documentNumber || row.entityId}</span>
          )}
          {row.clientName && (
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{row.clientName}</div>
          )}
        </div>
      ),
    },
    {
      key: 'outputSummary',
      label: 'AI INTELLIGENCE OUTPUT',
      render: (row) => (
        <span style={{ fontSize: '0.85rem', color: '#334155' }} title={row.outputSummary}>
          {row.outputSummary}
        </span>
      ),
    },
    {
      key: 'score',
      label: 'SCORE / RATING',
      render: (row) => (
        <span style={{ fontWeight: 700, color: '#0F172A' }}>
          {row.score !== undefined ? `${row.score}%` : row.level || 'N/A'}
        </span>
      ),
    },
    {
      key: 'reviewer',
      label: 'VALIDATION STATUS',
      render: (row) => (
        <div>
          <span style={{ fontWeight: 600, color: row.reviewDecision ? '#16A34A' : '#D97706', fontSize: '0.8rem' }}>
            {row.reviewDecision || 'Pending Validation'}
          </span>
          {row.reviewer && (
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>by {row.reviewer}</div>
          )}
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: 'TIMESTAMP',
      render: (row) => (
        <span style={{ color: '#64748B', fontSize: '0.8rem' }}>
          {new Date(row.createdAt).toLocaleDateString('en-PH')}
        </span>
      ),
    },
  ];

  const filterFields = [
    {
      key: 'module',
      label: 'AI MODULE',
      type: 'select' as const,
      options: [
        { label: 'Duplicate Detection', value: 'duplicate' },
        { label: 'Receivable Risk', value: 'risk' },
        { label: 'Collection Forecasting', value: 'collection' },
        { label: 'Document Extraction', value: 'document' },
      ],
    },
    {
      key: 'dateFrom',
      label: 'DATE RECORDED',
      type: 'date' as const,
    },
  ];

  return (
    <AiErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {canExport && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              title="Export CSV"
              icon="ti ti-download"
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={items.length === 0}
            />
          </div>
        )}

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search ID, document number, client…"
          fields={filterFields}
          values={{ module: moduleFilter, dateFrom }}
          onFieldChange={(k, v) => {
            if (k === 'module') setModuleFilter(v);
            if (k === 'dateFrom') setDateFrom(v);
          }}
          onApply={fetchRecords}
          onReset={() => {
            setSearch('');
            setModuleFilter('');
            setDateFrom('');
          }}
        />

        <DataTable
          rows={items}
          columns={columns}
          rowKey={(r) => r.id}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          isLoading={isLoading}
          error={error}
          onRetry={fetchRecords}
          emptyMessage="No AI output history records found."
          renderActions={(row) => (
            <Button
              title="Inspect"
              variant="secondary"
              size="sm"
              onClick={() => setSelectedRecord(row)}
            />
          )}
        />

        {/* Modal for detail inspection */}
        {selectedRecord && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.55)',
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
                borderRadius: 14,
                maxWidth: 500,
                width: '100%',
                padding: 24,
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                  AI Output Log — {selectedRecord.id}
                </h3>
                <button
                  onClick={() => setSelectedRecord(null)}
                  style={{ background: 'none', border: 'none', fontSize: 20, color: '#64748B', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 6 }}>
                  <span style={{ color: '#64748B' }}>Module</span>
                  <span style={{ fontWeight: 700 }}>{selectedRecord.module.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 6 }}>
                  <span style={{ color: '#64748B' }}>Target Record</span>
                  <span style={{ fontWeight: 700, color: '#0D9488' }}>{selectedRecord.documentNumber || selectedRecord.entityId}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px solid #F1F5F9', paddingBottom: 6 }}>
                  <span style={{ color: '#64748B' }}>AI Output Summary</span>
                  <span style={{ background: '#F8FAFC', padding: 8, borderRadius: 6, color: '#0F172A' }}>
                    {selectedRecord.outputSummary}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 6 }}>
                  <span style={{ color: '#64748B' }}>Human Reviewer</span>
                  <span>{selectedRecord.reviewer || 'None'} ({selectedRecord.reviewerRole || 'N/A'})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 6 }}>
                  <span style={{ color: '#64748B' }}>Decision</span>
                  <span style={{ fontWeight: 700 }}>{selectedRecord.reviewDecision || 'Pending'}</span>
                </div>
                {selectedRecord.remarks && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px solid #F1F5F9', paddingBottom: 6 }}>
                    <span style={{ color: '#64748B' }}>Remarks</span>
                    <span style={{ background: '#FFFBEB', padding: 8, borderRadius: 6, fontStyle: 'italic' }}>
                      {selectedRecord.remarks}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Recorded At</span>
                  <span>{new Date(selectedRecord.createdAt).toLocaleString('en-PH')}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
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
