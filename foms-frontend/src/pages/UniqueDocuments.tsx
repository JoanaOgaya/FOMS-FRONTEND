import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUniqueDocuments } from '../hooks/useDuplicates';
import { DataTable, type Column } from '../components/shared/DataTable';
import FilterBar from '../components/shared/FilterBar';
import StatusBadge from '../components/shared/StatusBadge';
import { PageHeader } from '../components/shared/PageHeader';
import Button from '../components/Buttons';
import type { UniqueDocumentItem } from '../services/duplicates.service';

const UniqueDocuments: React.FC = () => {
  const { user } = useAuth();
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
    docTypeFilter,
    setDocTypeFilter,
    dateFrom,
    setDateFrom,
    applyFilters,
    resetFilters,
    scope,
  } = useUniqueDocuments();

  const [selectedDoc, setSelectedDoc] = useState<UniqueDocumentItem | null>(null);

  const columns: Column<UniqueDocumentItem>[] = [
    {
      key: 'id',
      label: 'RECORD ID',
      render: (row) => <span style={{ fontWeight: 700, color: '#0F172A' }}>{row.id}</span>,
    },
    {
      key: 'type',
      label: 'DOCUMENT TYPE',
      render: (row) => {
        const typeStr = row.type || row.documentType || 'Invoice';
        const isInvoice = typeStr.toLowerCase().includes('invoice');
        const isReceipt = typeStr.toLowerCase().includes('receipt');
        const isLiq = typeStr.toLowerCase().includes('liquidation');
        const bg = isInvoice ? '#EFF6FF' : isReceipt ? '#F0FDF4' : '#FEF3C7';
        const color = isInvoice ? '#2563EB' : isReceipt ? '#16A34A' : '#D97706';
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: bg,
              color: color,
            }}
          >
            {typeStr}
          </span>
        );
      },
    },
    {
      key: 'orInvoiceNumber',
      label: 'OR / INVOICE NUMBER',
      render: (row) => <span>{row.orInvoiceNumber || '—'}</span>,
    },
    {
      key: 'clientName',
      label: 'CLIENT / ENTITY',
      render: (row) => <span>{row.clientName}</span>,
    },
    {
      key: 'amount',
      label: 'AMOUNT',
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 700 }}>
          {row.amount !== undefined
            ? `₱${row.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : 'N/A'}
        </span>
      ),
    },
    {
      key: 'transactionDate',
      label: 'TRANSACTION DATE',
      render: (row) => <span style={{ color: '#64748B' }}>{row.transactionDate}</span>,
    },
    {
      key: 'aiConfidence',
      label: 'UNIQUENESS SCORE',
      render: (row) => (
        <span style={{ color: '#0D9488', fontWeight: 700 }}>
          {row.aiConfidence}% Unique
        </span>
      ),
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const docTypeOptions =
    scope === 'liquidation'
      ? [{ label: 'Liquidation Voucher', value: 'Liquidation' }]
      : scope === 'own'
      ? [
          { label: 'Invoice', value: 'Invoice' },
          { label: 'Official Receipt', value: 'Receipt' },
        ]
      : [
          { label: 'Invoice', value: 'Invoice' },
          { label: 'Official Receipt', value: 'Receipt' },
          { label: 'Liquidation Voucher', value: 'Liquidation' },
        ];

  const filterFields = [
    {
      key: 'docType',
      label: 'DOCUMENT TYPE',
      type: 'select' as const,
      options: docTypeOptions,
    },
    {
      key: 'dateFrom',
      label: 'TRANSACTION DATE',
      type: 'date' as const,
    },
  ];

  const filterValues = {
    docType: docTypeFilter,
    dateFrom,
  };

  const handleFieldChange = (key: string, value: string) => {
    if (key === 'docType') setDocTypeFilter(value);
    if (key === 'dateFrom') setDateFrom(value);
  };

  const displayedItems = items.filter((row: any) => {
    if (!docTypeFilter || docTypeFilter === 'All') return true;
    const t = (row.type || row.documentType || '').toLowerCase();
    const f = docTypeFilter.toLowerCase();
    if (f === 'invoice') return t.includes('invoice');
    if (f === 'receipt' || f.includes('receipt')) return t.includes('receipt');
    if (f === 'liquidation' || f.includes('liquidation')) return t.includes('liquidation');
    return t.includes(f);
  });

  const effectiveTotal = docTypeFilter && docTypeFilter !== 'All' ? displayedItems.length : (total || displayedItems.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>



      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by ID, invoice, or client…"
        fields={filterFields}
        values={filterValues}
        onFieldChange={handleFieldChange}
        onApply={applyFilters}
        onReset={resetFilters}
      />

      <DataTable
        rows={displayedItems}
        columns={columns}
        rowKey={(r) => r.id}
        total={effectiveTotal}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        emptyMessage="No unique documents found."
        renderActions={(row) => (
          <Button
            title="Inspect"
            variant="secondary"
            size="sm"
            onClick={() => setSelectedDoc(row)}
          />
        )}
      />

      {/* Document Details Modal */}
      {selectedDoc && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setSelectedDoc(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, padding: 24, maxWidth: 500, width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                Document Inspection — {selectedDoc.id}
              </h3>
              <button
                onClick={() => setSelectedDoc(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748B' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Document Number</span>
                <span style={{ fontWeight: 600 }}>{selectedDoc.orInvoiceNumber || 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Client Name</span>
                <span style={{ fontWeight: 600 }}>{selectedDoc.clientName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Amount</span>
                <span style={{ fontWeight: 700 }}>
                  {selectedDoc.amount !== undefined
                    ? `₱${selectedDoc.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                    : 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Transaction Date</span>
                <span>{selectedDoc.transactionDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Source</span>
                <span>{selectedDoc.source}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Uniqueness Confidence</span>
                <span style={{ color: '#0D9488', fontWeight: 700 }}>{selectedDoc.aiConfidence}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Reviewed By</span>
                <span>{selectedDoc.reviewedBy}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Status</span>
                <StatusBadge status={selectedDoc.status} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <Button title="Close" variant="secondary" size="sm" onClick={() => setSelectedDoc(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UniqueDocuments;
