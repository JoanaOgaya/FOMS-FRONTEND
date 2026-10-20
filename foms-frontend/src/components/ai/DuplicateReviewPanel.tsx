import React, { useState } from 'react';
import type { DuplicateFlagItem } from '../../services/duplicates.service';
import { useAuth } from '../../context/AuthContext';
import { AiDisclaimer } from './AiDisclaimer';
import { formatCurrency } from '../../utils/format';
import { canApproveOwnCheck } from '../../utils/duplicateWorkflow';

export interface DuplicateReviewPanelProps {
  item: DuplicateFlagItem;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (remarks?: string) => Promise<void>;
  onReturn: (remarks: string) => Promise<void>;
  isSubmitting?: boolean;
}

export const DuplicateReviewPanel: React.FC<DuplicateReviewPanelProps> = ({
  item,
  isOpen,
  onClose,
  onApprove,
  onReturn,
  isSubmitting = false,
}) => {
  const { user } = useAuth();
  const [returnRemarks, setReturnRemarks] = useState('');
  const [showReturnInput, setShowReturnInput] = useState(false);
  const [validationError, setValidationError] = useState('');

  if (!isOpen) return null;

  const currentUserId = user?.id || user?.employeeId;
  const ownDecisionCheck = canApproveOwnCheck(currentUserId, item.decidedBy);

  const handleReturnSubmit = async () => {
    if (!returnRemarks.trim()) {
      setValidationError('Return remarks are required to explain why this item is returned.');
      return;
    }
    setValidationError('');
    await onReturn(returnRemarks.trim());
  };

  const handleApproveClick = async () => {
    if (!ownDecisionCheck.allowed) return;
    await onApprove();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          maxWidth: 820,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                Review Duplicate Flag — {item.flagId}
              </h3>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  background: (item.similarity ?? 0) >= 95 ? '#FEF2F2' : '#FFFBEB',
                  color: (item.similarity ?? 0) >= 95 ? '#DC2626' : '#D97706',
                  border: `1px solid ${(item.similarity ?? 0) >= 95 ? '#FECACA' : '#FDE68A'}`,
                }}
              >
                {item.similarity !== undefined ? `${item.similarity}% Similarity` : 'AI Match'}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <AiDisclaimer />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 24, color: '#64748B', cursor: 'pointer' }}
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Side-by-Side Comparison */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              Side-by-Side Record Comparison
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Flagged Record */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', borderBottom: '1px solid #E2E8F0', paddingBottom: 6 }}>
                  Source / Uploaded Document
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#64748B' }}>Doc Number:</span>
                  <strong style={{ color: '#0F172A' }}>{item.uploadedNumber ?? 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#64748B' }}>Client Name:</span>
                  <span style={{ color: '#0F172A', fontWeight: 600 }}>{item.clientName ?? 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#64748B' }}>Amount:</span>
                  <strong style={{ color: '#0F172A' }}>{formatCurrency(item.amount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#64748B' }}>Flagged Date:</span>
                  <span style={{ color: '#64748B' }}>{item.flaggedDate ?? 'N/A'}</span>
                </div>
              </div>

              {/* Matched Record */}
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 10,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#991B1B', borderBottom: '1px solid #FECACA', paddingBottom: 6 }}>
                  Existing Matched Record (Database)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#64748B' }}>Matched Record #:</span>
                  <strong style={{ color: '#991B1B' }}>{item.existingRecord}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#64748B' }}>Client Name:</span>
                  <span style={{ color: '#0F172A', fontWeight: 600 }}>{item.clientName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#64748B' }}>Amount:</span>
                  <strong style={{ color: '#0F172A' }}>{formatCurrency(item.amount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#64748B' }}>Match Reason:</span>
                  <span style={{ color: '#DC2626', fontWeight: 600 }}>{item.duplicateReason}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Level 1 Accountant Decision & Remarks */}
          <div
            style={{
              background: '#F0F9FF',
              border: '1px solid #BAE6FD',
              borderRadius: 10,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0369A1' }}>
                Level 1 Decision (Accountant / Asst FM)
              </span>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  background: item.decision === 'DUPLICATE' ? '#FEF2F2' : '#F0FDF4',
                  color: item.decision === 'DUPLICATE' ? '#DC2626' : '#16A34A',
                  border: `1px solid ${item.decision === 'DUPLICATE' ? '#FECACA' : '#BBF7D0'}`,
                }}
              >
                {item.decision === 'DUPLICATE' ? 'Marked as Duplicate' : item.decision === 'NOT_DUPLICATE' ? 'Marked as Not Duplicate' : 'Decision Pending'}
              </span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#475569' }}>
              Decided By: <strong>{item.decidedBy || 'Accountant Reviewer'}</strong>
              {item.decidedAt && <span> • {new Date(item.decidedAt).toLocaleString('en-PH')}</span>}
            </div>
            {item.decidedRemarks && (
              <div style={{ background: '#fff', border: '1px solid #E0F2FE', borderRadius: 6, padding: '10px', fontSize: '0.82rem', color: '#0F172A' }}>
                <span style={{ fontWeight: 700, color: '#0369A1' }}>Accountant Remarks: </span>
                "{item.decidedRemarks}"
              </div>
            )}
          </div>

          {/* Separation of Duties Warning */}
          {!ownDecisionCheck.allowed && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: '12px 16px',
                color: '#DC2626',
                fontSize: '0.85rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <i className="ti ti-ban" style={{ fontSize: 18 }} />
              {ownDecisionCheck.reason || 'You cannot approve your own decision'}
            </div>
          )}

          {/* Return Remarks Input Area */}
          {showReturnInput && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
                Reason for Returning to Accountant (Required) *
              </label>
              <textarea
                value={returnRemarks}
                onChange={(e) => {
                  setReturnRemarks(e.target.value);
                  if (validationError) setValidationError('');
                }}
                placeholder="Explain why the decision is returned for re-examination (e.g. check invoice date on secondary page)..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${validationError ? '#EF4444' : '#F59E0B'}`,
                  fontSize: '0.85rem',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
              {validationError && (
                <span style={{ color: '#DC2626', fontSize: '0.78rem', fontWeight: 600, marginTop: 4, display: 'block' }}>
                  {validationError}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              background: '#fff',
              color: '#475569',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            {!showReturnInput ? (
              <button
                type="button"
                onClick={() => setShowReturnInput(true)}
                disabled={isSubmitting}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  border: '1px solid #F59E0B',
                  background: '#FFFBEB',
                  color: '#D97706',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Return to Accountant
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReturnSubmit}
                disabled={isSubmitting}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#D97706',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Confirm Return
              </button>
            )}

            <button
              type="button"
              onClick={handleApproveClick}
              disabled={isSubmitting || !ownDecisionCheck.allowed}
              style={{
                padding: '9px 22px',
                borderRadius: 8,
                border: 'none',
                background: ownDecisionCheck.allowed ? '#0F172A' : '#94A3B8',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: ownDecisionCheck.allowed && !isSubmitting ? 'pointer' : 'not-allowed',
              }}
              title={!ownDecisionCheck.allowed ? 'You cannot approve your own decision' : 'Approve Accountant Decision'}
            >
              {isSubmitting ? 'Approving…' : 'Approve Decision'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuplicateReviewPanel;
