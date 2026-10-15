import React, { useState } from 'react';
import type { ComparisonCandidate } from './DuplicateComparisonModal';

export type DecisionType = 'UNIQUE' | 'FLAGGED' | 'NEEDS_MANUAL_REVIEW';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  matchedCandidates?: ComparisonCandidate[];
  initialCandidate?: ComparisonCandidate;
  onSubmitDecision: (payload: {
    decision: DecisionType;
    matchedRecordId?: string;
    flagReason?: string;
    reviewNotes?: string;
  }) => Promise<void>;
}

export const AccountantDecisionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  documentId,
  matchedCandidates = [],
  initialCandidate,
  onSubmitDecision,
}) => {
  const [decision, setDecision] = useState<DecisionType>(
    initialCandidate ? 'FLAGGED' : 'UNIQUE'
  );
  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    initialCandidate?.matchedDocumentId || matchedCandidates[0]?.matchedDocumentId || ''
  );
  const [flagReason, setFlagReason] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isFormValid = () => {
    if (decision === 'UNIQUE') return true;
    if (decision === 'FLAGGED') {
      return (
        Boolean(selectedMatchId || initialCandidate?.matchedDocumentId) &&
        flagReason.trim().length >= 10
      );
    }
    if (decision === 'NEEDS_MANUAL_REVIEW') {
      return reviewNotes.trim().length >= 15;
    }
    return false;
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmitDecision({
        decision,
        matchedRecordId: decision === 'FLAGGED' ? selectedMatchId : undefined,
        flagReason: decision === 'FLAGGED' ? flagReason : undefined,
        reviewNotes: decision === 'NEEDS_MANUAL_REVIEW' ? reviewNotes : undefined,
      });
      setShowConfirm(false);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '560px',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {!showConfirm ? (
          <>
            <h3 id="decision-modal-title" style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
              Submit Document Decision
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#64748B' }}>
              Choose exactly one decision to advance document #{documentId}.
            </p>

            {/* Decision Radio Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {/* Option 1: Unique */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `2px solid ${decision === 'UNIQUE' ? '#0D9488' : '#E2E8F0'}`,
                  background: decision === 'UNIQUE' ? '#F0FDFA' : '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="decision"
                  checked={decision === 'UNIQUE'}
                  onChange={() => setDecision('UNIQUE')}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>Mark as Unique Document</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.785rem', color: '#64748B' }}>
                    Document has no real duplicate. It will be saved to Unique Documents and unlocked for processing.
                  </p>
                </div>
              </label>

              {/* Option 2: Flagged */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `2px solid ${decision === 'FLAGGED' ? '#EF4444' : '#E2E8F0'}`,
                  background: decision === 'FLAGGED' ? '#FEF2F2' : '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="decision"
                  checked={decision === 'FLAGGED'}
                  onChange={() => setDecision('FLAGGED')}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>Flag as Confirmed Duplicate</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.785rem', color: '#64748B' }}>
                    Confirmed as a duplicate. Saved to Flagged and blocked from further billing or disbursement processing.
                  </p>
                </div>
              </label>

              {/* Option 3: Needs Manual Review */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `2px solid ${decision === 'NEEDS_MANUAL_REVIEW' ? '#D97706' : '#E2E8F0'}`,
                  background: decision === 'NEEDS_MANUAL_REVIEW' ? '#FFFBEB' : '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="decision"
                  checked={decision === 'NEEDS_MANUAL_REVIEW'}
                  onChange={() => setDecision('NEEDS_MANUAL_REVIEW')}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>Needs Manual Review</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.785rem', color: '#64748B' }}>
                    Accountant is unsure. Sent to the Finance Manager queue with an explanation note.
                  </p>
                </div>
              </label>
            </div>

            {/* Conditional Required Fields for FLAGGED */}
            {decision === 'FLAGGED' && (
              <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {matchedCandidates.length > 1 && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                      Select Matched Record *
                    </label>
                    <select
                      value={selectedMatchId}
                      onChange={e => setSelectedMatchId(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                    >
                      {matchedCandidates.map(c => (
                        <option key={c.matchedDocumentId} value={c.matchedDocumentId}>
                          {c.documentNumber} ({c.clientName}) - ₱{c.amount.toLocaleString()} ({Math.round(c.similarityScore * 100)}% Match)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Reason for Flagging (Required, minimum 10 characters) *
                  </label>
                  <textarea
                    rows={3}
                    value={flagReason}
                    onChange={e => setFlagReason(e.target.value)}
                    placeholder="Specify grounds for confirming duplicate (e.g. identical transaction claimed previously on...)"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  />
                  {flagReason.trim().length > 0 && flagReason.trim().length < 10 && (
                    <span style={{ fontSize: '0.75rem', color: '#EF4444' }}>
                      Must be at least 10 characters ({10 - flagReason.trim().length} more needed)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Conditional Required Fields for NEEDS_MANUAL_REVIEW */}
            {decision === 'NEEDS_MANUAL_REVIEW' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Accountant Explanation Note (Required, minimum 15 characters) *
                </label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Explain why you are unsure and what the Finance Manager should specifically check..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                />
                {reviewNotes.trim().length > 0 && reviewNotes.trim().length < 15 && (
                  <span style={{ fontSize: '0.75rem', color: '#EF4444' }}>
                    Must be at least 15 characters ({15 - reviewNotes.trim().length} more needed)
                  </span>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!isFormValid()}
                onClick={() => setShowConfirm(true)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isFormValid() ? '#0D9488' : '#94A3B8',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  cursor: isFormValid() ? 'pointer' : 'not-allowed',
                }}
              >
                Review & Confirm
              </button>
            </div>
          </>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: decision === 'FLAGGED' ? '#FEE2E2' : decision === 'UNIQUE' ? '#CCFBF1' : '#FEF3C7',
                  color: decision === 'FLAGGED' ? '#DC2626' : decision === 'UNIQUE' ? '#0F766E' : '#D97706',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <i className={`ti ${decision === 'FLAGGED' ? 'ti-alert-octagon' : decision === 'UNIQUE' ? 'ti-check' : 'ti-help-circle'}`} style={{ fontSize: '26px' }} />
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                Confirm Decision Submission
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                Are you sure you want to set document #{documentId} as{' '}
                <strong style={{ color: '#0F172A' }}>{decision}</strong>?
              </p>
            </div>

            <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.8rem', color: '#334155' }}>
              {decision === 'FLAGGED' && (
                <div>
                  <strong>Duplicate Flag Reason:</strong> {flagReason}
                  <div style={{ marginTop: '4px', color: '#DC2626' }}>
                    Note: Document will be blocked from further billing and disbursements.
                  </div>
                </div>
              )}
              {decision === 'NEEDS_MANUAL_REVIEW' && (
                <div>
                  <strong>Sent to Finance Manager:</strong> {reviewNotes}
                </div>
              )}
              {decision === 'UNIQUE' && (
                <div>This will clear the document as unique and enable billing/payment creation.</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmSubmit}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#0D9488', color: '#FFFFFF', fontWeight: 700, cursor: 'pointer' }}
              >
                {isSubmitting ? 'Submitting...' : 'Yes, Confirm Decision'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
