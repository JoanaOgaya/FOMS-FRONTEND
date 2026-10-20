import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { PageHeader } from '../components/shared/PageHeader';
import { DataTable, type Column } from '../components/shared/DataTable';
import FilterBar from '../components/shared/FilterBar';
import StatusBadge from '../components/shared/StatusBadge';
import Button from '../components/Buttons';
import { DocumentUploader } from '../components/ai/DocumentUploader';
import { ExtractedFieldsForm } from '../components/ai/ExtractedFieldsForm';
import { AiDisclaimer } from '../components/ai/AiDisclaimer';
import { AiErrorBoundary } from '../components/ai/ErrorBoundary';
import { documentsService } from '../services/ai/documents.service';
import { getDuplicateScope, canUploadDocuments, canActOnRecord } from '../utils/roleAccess';
import type { DocumentExtractionResult, DocumentType, ConfirmExtractionPayload } from '../types/ai';

export const DocumentExtraction: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const scope = getDuplicateScope(user?.role);
  const isAssistantFM = user?.role === 'ASSISTANT_FM';
  const [docType, setDocType] = useState<DocumentType>(isAssistantFM ? 'liquidation' : 'invoice');

  useEffect(() => {
    if (isAssistantFM && docType !== 'liquidation') {
      setDocType('liquidation');
    }
  }, [isAssistantFM]);

  const canUpload = canUploadDocuments(user?.role, docType);
  const [activeExtraction, setActiveExtraction] = useState<DocumentExtractionResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Table list state
  const [items, setItems] = useState<DocumentExtractionResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await documentsService.list({
        page,
        pageSize,
        search: search || undefined,
        documentType: typeFilter || undefined,
        status: statusFilter || undefined,
        scope,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error('Failed to load document records.'));
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, typeFilter, statusFilter, scope]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Polling for processing status
  useEffect(() => {
    if (!activeExtraction || activeExtraction.status !== 'PROCESSING') {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    const interval = setInterval(async () => {
      try {
        const updated = await documentsService.getStatus(activeExtraction.id);
        setActiveExtraction(updated);
        if (updated.status === 'DONE' || updated.status === 'FAILED') {
          setIsPolling(false);
          fetchList();
        }
      } catch {
        // Poll retry
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeExtraction, fetchList]);

  const handleUploadSuccess = async (id: string) => {
    toast.info('Document uploaded. AI processing and OCR signature extraction started…');
    try {
      const statusRes = await documentsService.getStatus(id);
      setActiveExtraction(statusRes);
      fetchList();
    } catch {
      setActiveExtraction({
        id,
        documentType: docType,
        fileName: 'Uploaded Document',
        status: 'PROCESSING',
        completeness: [],
        fields: [],
        uploadedAt: new Date().toISOString(),
        uploadedBy: user?.fullName || 'Current User',
      });
    }
  };

  const handleConfirmExtraction = async (payload: ConfirmExtractionPayload) => {
    setIsSubmitting(true);
    try {
      const res = await documentsService.confirmExtraction(payload.id, payload);
      toast.success('Document extraction confirmed and recorded for supervisor review.');
      setActiveExtraction(res.record);
      fetchList();
    } catch (err: any) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm extraction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<DocumentExtractionResult>[] = [
    {
      key: 'fileName',
      label: 'DOCUMENT NAME',
      render: (row) => (
        <div>
          <span style={{ fontWeight: 700, color: '#0F172A' }}>{row.fileName}</span>
          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
            {(row.documentType || row.docType || 'DOCUMENT').toUpperCase()}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'AI STATUS',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'uploadedBy',
      label: 'UPLOADED BY',
      render: (row) => (
        <div>
          <span style={{ fontWeight: 600, color: '#0F172A' }}>{row.uploadedBy}</span>
          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
            {row.uploadedAt ? new Date(row.uploadedAt).toLocaleDateString('en-PH') : 'Recent'}
          </div>
        </div>
      ),
    },
    {
      key: 'isConfirmed',
      label: 'VERIFICATION',
      render: (row) => (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: row.isConfirmed ? '#16A34A' : '#D97706',
            background: row.isConfirmed ? '#F0FDF4' : '#FFFBEB',
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          {row.isConfirmed ? 'Verified by User' : 'Pending Verification'}
        </span>
      ),
    },
  ];

  const filterFields = [
    {
      key: 'type',
      label: 'DOCUMENT TYPE',
      type: 'select' as const,
      options: [
        { label: 'Invoice', value: 'invoice' },
        { label: 'Proof of Payment', value: 'proof_of_payment' },
        { label: 'Waybill', value: 'waybill' },
        { label: 'POD', value: 'pod' },
        { label: 'Liquidation', value: 'liquidation' },
      ],
    },
    {
      key: 'status',
      label: 'STATUS',
      type: 'select' as const,
      options: [
        { label: 'Processing', value: 'PROCESSING' },
        { label: 'Done', value: 'DONE' },
        { label: 'Failed', value: 'FAILED' },
      ],
    },
  ];

  return (
    <AiErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <PageHeader
            title="Document Checking &amp; AI Extraction"
            subtitle="Upload invoices, proofs of payment, and vouchers for AI completeness checks and OCR field extraction."
          />
          <AiDisclaimer />
        </div>

        {isAssistantFM && (
          <div style={{ padding: '8px 14px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '8px', fontSize: '0.8rem', color: '#0369A1', fontWeight: 600 }}>
            <i className="ti ti-filter" style={{ marginRight: 6 }} />
            Assistant FM Scope: Liquidation &amp; Expense Documents Only
          </div>
        )}

        {/* Upload Console */}
        {canUpload ? (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                  Upload New Document for AI Verification
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
                  Select document category before uploading
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(isAssistantFM ? ['liquidation'] : ['invoice', 'proof_of_payment', 'waybill', 'pod']).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDocType(t as DocumentType)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: docType === t ? '#0F172A' : '#F1F5F9',
                      color: docType === t ? '#fff' : '#475569',
                    }}
                  >
                    {t.replace(/_/g, ' ').toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <DocumentUploader
              documentType={docType}
              onUploadSuccess={handleUploadSuccess}
              allowedTypesDescription={
                isAssistantFM
                  ? 'Upload liquidation receipts (fuel, toll, voucher) up to 10MB'
                  : 'Support JPG, PNG, WEBP, or PDF invoice & receipt files up to 10MB'
              }
            />
          </div>
        ) : (
          <div style={{ padding: '16px 20px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', color: '#475569', fontSize: '0.875rem' }}>
            <i className="ti ti-info-circle" style={{ marginRight: 8, color: '#64748B' }} />
            <strong>Reviewer Console:</strong> Document upload is performed by Accountants and Assistant FM. Review and verify completed extractions in the table below.
          </div>
        )}

        {/* Active Extraction Workspace */}
        {activeExtraction && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                Extraction Inspection Workspace
              </h3>
              <button
                type="button"
                onClick={() => setActiveExtraction(null)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
              >
                Close Workspace &times;
              </button>
            </div>

            {activeExtraction.status === 'PROCESSING' && (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '36px 24px', textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', border: '4px solid #E2E8F0', borderTopColor: '#0D9488', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '1rem', marginBottom: 4 }}>
                  AI Document Extraction in Progress…
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                  Extracting text fields, computing confidence scores, and checking document completeness.
                </p>
              </div>
            )}

            {activeExtraction.status === 'FAILED' && (
              <div style={{ background: '#FEF2F2', borderRadius: 12, border: '1px solid #FECACA', padding: '24px', color: '#991B1B' }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>
                  <i className="ti ti-alert-triangle" style={{ marginRight: 6 }} />
                  Extraction Failed
                </div>
                <p style={{ margin: '0 0 16px', fontSize: '0.85rem' }}>
                  {activeExtraction.failureReason || 'The AI extraction engine was unable to read this document. Please check the resolution and re-upload.'}
                </p>
                <button
                  type="button"
                  onClick={() => handleUploadSuccess(activeExtraction.id)}
                  style={{ padding: '8px 16px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  Retry Extraction
                </button>
              </div>
            )}

            {activeExtraction.status === 'DONE' && (
              <ExtractedFieldsForm
                extraction={activeExtraction}
                onConfirm={handleConfirmExtraction}
                isSubmitting={isSubmitting}
              />
            )}
          </div>
        )}

        {/* Historical Extractions Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
            Processed Document Extractions
          </h3>

          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search document name, uploaded by…"
            fields={filterFields}
            values={{ type: typeFilter, status: statusFilter }}
            onFieldChange={(k, v) => {
              if (k === 'type') setTypeFilter(v);
              if (k === 'status') setStatusFilter(v);
            }}
            onApply={fetchList}
            onReset={() => {
              setSearch('');
              setTypeFilter('');
              setStatusFilter('');
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
            onRetry={fetchList}
            emptyMessage="No document extraction records found."
            renderActions={(row) => {
              const dutyCheck = canActOnRecord(user, row, 'confirm');
              return (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Button
                    title="Inspect &amp; Verify"
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveExtraction(row)}
                  />
                  {!dutyCheck.allowed && (
                    <span
                      style={{ fontSize: '0.72rem', color: '#94A3B8', fontStyle: 'italic', maxWidth: 140 }}
                      title={dutyCheck.reason}
                    >
                      {dutyCheck.reason}
                    </span>
                  )}
                </div>
              );
            }}
          />
        </div>
      </div>
    </AiErrorBoundary>
  );
};

export default DocumentExtraction;
