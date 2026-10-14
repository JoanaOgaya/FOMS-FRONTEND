import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFlaggedDuplicates } from '../hooks/useDuplicates';
import { duplicatesService, type DuplicateFlagItem } from '../services/duplicates.service';
import { DataTable, type Column } from '../components/shared/DataTable';
import FilterBar from '../components/shared/FilterBar';
import StatusBadge from '../components/shared/StatusBadge';
import { PageHeader } from '../components/shared/PageHeader';
import Button from '../components/Buttons';
import ConfirmModal from '../components/shared/ConfirmModal';
import { useToast } from '../components/ToastContext';
import {
  canDecideDuplicate,
  canReviewDuplicate,
  canApproveOwnCheck,
  DUPLICATE_STATUS_LABELS,
} from '../utils/duplicateWorkflow';
import { DuplicateReviewPanel } from '../components/ai/DuplicateReviewPanel';
import { ROLES } from '../types/auth';

type ActionModalType = 'mark_duplicate' | 'mark_not_duplicate' | 'approve' | 'return' | null;

export const FlaggedDuplicates: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const isHeadAccountant = user?.role === ROLES.HEAD_ACCOUNTANT;
  const initialStatus = isHeadAccountant ? 'PENDING_REVIEW' : '';

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
    statusFilter,
    setStatusFilter,
    dateFrom,
    setDateFrom,
    applyFilters,
    resetFilters,
    scope,
  } = useFlaggedDuplicates({ initialStatus });

  const [activeItem, setActiveItem] = useState<DuplicateFlagItem | null>(null);
  const [modalAction, setModalAction] = useState<ActionModalType>(null);
  const [remarks, setRemarks] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inspectDoc, setInspectDoc] = useState<DuplicateFlagItem | null>(null);
  const [reviewPanelDoc, setReviewPanelDoc] = useState<DuplicateFlagItem | null>(null);

  const currentUserId = user?.id || user?.employeeId;

  const handleOpenAction = (item: DuplicateFlagItem, action: ActionModalType) => {
    setActiveItem(item);
    setModalAction(action);
    setRemarks('');
    setValidationError('');
  };

  const handleCloseModal = () => {
    setActiveItem(null);
    setModalAction(null);
    setRemarks('');
    setValidationError('');
  };

  const handleActionSubmit = async () => {
    if (!activeItem || !modalAction) return;

    // Both Level 1 decisions and Level 2 Return require remarks
    if ((modalAction === 'mark_duplicate' || modalAction === 'mark_not_duplicate' || modalAction === 'return') && !remarks.trim()) {
      setValidationError('Remarks and justification are required for this action.');
      return;
    }

    // Separation of Duties check for Level 2 Approve
    if (modalAction === 'approve') {
      const sodCheck = canApproveOwnCheck(currentUserId, activeItem.decidedBy);
      if (!sodCheck.allowed) {
        setValidationError(sodCheck.reason || 'You cannot approve your own decision.');
        return;
      }
    }

    setIsSubmitting(true);
    setValidationError('');
    try {
      const reviewerName = user?.fullName || user?.employeeId || 'Reviewer';
      if (modalAction === 'mark_duplicate') {
        await duplicatesService.decideDuplicate(activeItem.id, {
          decision: 'DUPLICATE',
          remarks: remarks.trim(),
          reviewer: reviewerName,
        });
        toast.success(`Marked flag ${activeItem.flagId} as Duplicate. Forwarded to Head Accountant for Review.`);
      } else if (modalAction === 'mark_not_duplicate') {
        await duplicatesService.decideDuplicate(activeItem.id, {
          decision: 'NOT_DUPLICATE',
          remarks: remarks.trim(),
          reviewer: reviewerName,
        });
        toast.info(`Marked flag ${activeItem.flagId} as Not Duplicate. Forwarded to Head Accountant for Review.`);
      } else if (modalAction === 'approve') {
        await duplicatesService.reviewDecision(activeItem.id, {
          action: 'APPROVE',
          remarks: remarks.trim() || undefined,
          reviewer: reviewerName,
        });
        toast.success(`Approved decision for ${activeItem.flagId}. Official status updated.`);
      } else if (modalAction === 'return') {
        await duplicatesService.reviewDecision(activeItem.id, {
          action: 'RETURN',
          remarks: remarks.trim(),
          reviewer: reviewerName,
        });
        toast.warning(`Returned flag ${activeItem.flagId} to Accountant with remarks.`);
      }
      handleCloseModal();
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed to execute.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<DuplicateFlagItem>[] = [
    {
      key: 'flagId',
      label: 'FLAG ID',
      render: (row) => <span style={{ fontWeight: 700, color: '#0F172A' }}>{row.flagId}</span>,
    },
    {
      key: 'type',
      label: 'MATCH TYPE',
      render: (row) => {
        const sim = row.similarity ?? 0;
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: sim >= 95 ? '#FEF2F2' : '#FFFBEB',
              color: sim >= 95 ? '#EF4444' : '#D97706',
            }}
          >
            {row.matchType || (sim >= 95 ? 'EXACT MATCH' : 'PARTIAL MATCH')}
          </span>
        );
      },
    },
    {
      key: 'uploadedNumber',
      label: 'SOURCE DOC #',
      render: (row) => <span>{row.uploadedNumber ?? 'N/A'}</span>,
    },
    {
      key: 'existingRecord',
      label: 'MATCHED RECORD',
      render: (row) => <span style={{ color: '#4338CA', fontWeight: 600 }}>{row.existingRecord ?? 'N/A'}</span>,
    },
    {
      key: 'clientName',
      label: 'CLIENT NAME',
      render: (row) => <span>{row.clientName ?? 'N/A'}</span>,
    },
    {
      key: 'similarity',
      label: 'SIMILARITY',
      render: (row) => (
        <span style={{ fontWeight: 700, color: (row.similarity ?? 0) >= 95 ? '#EF4444' : '#D97706' }}>
          {row.similarity !== undefined ? `${row.similarity}%` : 'N/A'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <StatusBadge status={row.status} />
          {row.decidedRemarks && (
            <span
              style={{
                fontSize: '0.75rem',
                color: '#64748B',
                fontStyle: 'italic',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={row.decidedRemarks}
            >
              "{row.decidedRemarks}"
            </span>
          )}
        </div>
      ),
    },
  ];

  const filterFields = [
    {
      key: 'status',
      label: 'STATUS',
      type: 'select' as const,
      options: [
        { label: 'All Statuses', value: '' },
        { label: 'Flagged (Unverified)', value: 'FLAGGED' },
        { label: 'Pending Review (Level 2)', value: 'PENDING_REVIEW' },
        { label: 'Returned for Re-decision', value: 'RETURNED' },
        { label: 'Approved Duplicate', value: 'APPROVED_DUPLICATE' },
        { label: 'Cleared (Not Duplicate)', value: 'CLEARED_NOT_DUPLICATE' },
      ],
    },
    {
      key: 'dateFrom',
      label: 'FLAGGED DATE',
      type: 'date' as const,
    },
  ];

  const filterValues = {
    status: statusFilter,
    dateFrom,
  };

  const handleFieldChange = (key: string, value: string) => {
    if (key === 'status') setStatusFilter(value);
    if (key === 'dateFrom') setDateFrom(value);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>



      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search flags, doc number, client…"
        fields={filterFields}
        values={filterValues}
        onFieldChange={handleFieldChange}
        onApply={applyFilters}
        onReset={resetFilters}
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
        onRetry={refetch}
        emptyMessage="No flagged duplicate documents found."
        renderActions={(row) => {
          const canDecide = canDecideDuplicate(user?.role, row.status, row.documentType);
          const canReview = canReviewDuplicate(user?.role, row.status, row.documentType);
          const sodCheck = canApproveOwnCheck(currentUserId, row.decidedBy);

          return (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
              <Button
                title="Inspect"
                variant="secondary"
                size="sm"
                onClick={() => setInspectDoc(row)}
              />

              {/* Level 1: Accountant / Asst FM Decision Actions */}
              {canDecide && (
                <>
                  <Button
                    title="Mark Real Duplicate"
                    variant="danger"
                    size="sm"
                    onClick={() => handleOpenAction(row, 'mark_duplicate')}
                  />
                  <Button
                    title="Mark False Positive"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenAction(row, 'mark_not_duplicate')}
                  />
                </>
              )}

              {/* Level 2: Head Accountant / FM Review Actions */}
              {canReview && (
                <>
                  <Button
                    title="Review"
                    variant="primary"
                    size="sm"
                    onClick={() => setReviewPanelDoc(row)}
                  />
                  {sodCheck.allowed ? (
                    <Button
                      title="Approve"
                      variant="success"
                      size="sm"
                      onClick={() => handleOpenAction(row, 'approve')}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: '#EF4444',
                        fontWeight: 600,
                        padding: '4px 8px',
                        background: '#FEF2F2',
                        borderRadius: 4,
                        border: '1px solid #FECACA',
                      }}
                      title="You cannot approve your own decision"
                    >
                      Cannot Self-Approve
                    </span>
                  )}
                  <Button
                    title="Return"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenAction(row, 'return')}
                  />
                </>
              )}
            </div>
          );
        }}
      />

      {/* Level 1 & Level 2 Action Modal */}
      {modalAction && activeItem && (
        <ConfirmModal
          isOpen={true}
          title={
            modalAction === 'mark_duplicate'
              ? `Mark Real Duplicate — ${activeItem.flagId}`
              : modalAction === 'mark_not_duplicate'
              ? `Mark False Positive — ${activeItem.flagId}`
              : modalAction === 'approve'
              ? `Approve Decision — ${activeItem.flagId}`
              : `Return to Accountant — ${activeItem.flagId}`
          }
          message={
            modalAction === 'mark_duplicate'
              ? `Marking ${activeItem.uploadedNumber} as a duplicate of ${activeItem.existingRecord}. This moves the record to PENDING_REVIEW for Head Accountant supervisor approval.`
              : modalAction === 'mark_not_duplicate'
              ? `Marking ${activeItem.uploadedNumber} as legitimate and NOT a duplicate. This moves the record to PENDING_REVIEW for Head Accountant supervisor approval.`
              : modalAction === 'approve'
              ? `Approve the Accountant's decision on ${activeItem.flagId}? Official system records will be updated upon your approval.`
              : `Returning flag ${activeItem.flagId} back to the Accountant for re-examination. Please provide required remarks explaining why.`
          }
          variant={modalAction === 'mark_duplicate' ? 'danger' : 'primary'}
          confirmLabel={
            isSubmitting
              ? 'Processing…'
              : modalAction === 'mark_duplicate'
              ? 'Mark Real Duplicate'
              : modalAction === 'mark_not_duplicate'
              ? 'Mark False Positive'
              : modalAction === 'approve'
              ? 'Approve'
              : 'Return'
          }
          onCancel={handleCloseModal}
          onConfirm={handleActionSubmit}
        >
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
              {modalAction === 'approve'
                ? 'Approval Notes (Optional)'
                : 'Justification Remarks (Required) *'}
            </label>
            <textarea
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                if (validationError) setValidationError('');
              }}
              placeholder={
                modalAction === 'mark_duplicate'
                  ? 'Required: Explain why this record is confirmed as a duplicate...'
                  : modalAction === 'mark_not_duplicate'
                  ? 'Required: Explain why this document is unique and not a duplicate...'
                  : modalAction === 'return'
                  ? 'Required: Explain why the decision is returned to the Accountant...'
                  : 'Optional approval notes...'
              }
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: `1px solid ${validationError ? '#EF4444' : '#CBD5E1'}`,
                fontSize: '0.85rem',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            {validationError && (
              <span style={{ color: '#DC2626', fontSize: '0.78rem', fontWeight: 600, marginTop: 4, display: 'block' }}>
                {validationError}
              </span>
            )}
          </div>
        </ConfirmModal>
      )}

      {/* Level 2 Side-by-Side Review Panel */}
      {reviewPanelDoc && (
        <DuplicateReviewPanel
          isOpen={true}
          item={reviewPanelDoc}
          onClose={() => setReviewPanelDoc(null)}
          onApprove={async (apprRemarks) => {
            try {
              await duplicatesService.reviewDecision(reviewPanelDoc.id, {
                action: 'APPROVE',
                remarks: apprRemarks,
                reviewer: user?.fullName || user?.employeeId || 'Reviewer',
              });
              toast.success(`Approved duplicate decision for ${reviewPanelDoc.flagId}.`);
              setReviewPanelDoc(null);
              refetch();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Approval failed.');
            }
          }}
          onReturn={async (retRemarks) => {
            try {
              await duplicatesService.reviewDecision(reviewPanelDoc.id, {
                action: 'RETURN',
                remarks: retRemarks,
                reviewer: user?.fullName || user?.employeeId || 'Reviewer',
              });
              toast.warning(`Returned flag ${reviewPanelDoc.flagId} to Accountant.`);
              setReviewPanelDoc(null);
              refetch();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Return failed.');
            }
          }}
        />
      )}

      {/* Inspect Modal */}
      {inspectDoc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setInspectDoc(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 520,
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                Flag Inspection — {inspectDoc.flagId}
              </h3>
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748B' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Source Document:</span>
                <strong>{inspectDoc.uploadedNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Matched Record:</span>
                <strong style={{ color: '#4338CA' }}>{inspectDoc.existingRecord}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Client Name:</span>
                <span>{inspectDoc.clientName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>AI Similarity:</span>
                <strong style={{ color: (inspectDoc.similarity ?? 0) >= 95 ? '#EF4444' : '#D97706' }}>
                  {inspectDoc.similarity !== undefined ? `${inspectDoc.similarity}%` : 'N/A'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Match Reason:</span>
                <span>{inspectDoc.duplicateReason}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Workflow Status:</span>
                <StatusBadge status={inspectDoc.status} />
              </div>
              {inspectDoc.decision && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Level 1 Decision:</span>
                  <strong>{inspectDoc.decision}</strong>
                </div>
              )}
              {inspectDoc.decidedRemarks && (
                <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: 6, marginTop: 4 }}>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                    Accountant Remarks:
                  </span>
                  <span>{inspectDoc.decidedRemarks}</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <Button title="Close" variant="secondary" size="sm" onClick={() => setInspectDoc(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlaggedDuplicates;
