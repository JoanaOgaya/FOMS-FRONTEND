import React, { useState } from 'react';
import type { DuplicateMatch } from '../../types/ai';
import { AiDisclaimer } from './AiDisclaimer';

export interface DuplicatePreCheckModalProps {
  isOpen?: boolean;
  status?: 'checking' | 'slow' | 'matches_found' | 'error';
  matches?: DuplicateMatch[];
  errorMessage?: string;
  state?: {
    isOpen: boolean;
    status: 'checking' | 'slow' | 'matches_found' | 'error';
    matches: DuplicateMatch[];
    errorMessage?: string;
  };
  onCancel: () => void;
  onRetry?: () => void;
  onProceedWithRemarks?: (remarks: string) => void;
  onProceedManualReview?: (remarks: string) => void;
  onProceedWithManualReview?: (remarks: string) => void;
}

export const DuplicatePreCheckModal: React.FC<DuplicatePreCheckModalProps> = (props) => {
  const isOpen = props.state ? props.state.isOpen : (props.isOpen ?? false);
  const status = props.state ? props.state.status : (props.status || 'checking');
  const matches = props.state ? props.state.matches : (props.matches || []);
  const errorMessage = props.state ? props.state.errorMessage : props.errorMessage;
  const onCancel = props.onCancel;
  const onRetry = props.onRetry || (() => {});
  const onProceedWithRemarks = props.onProceedWithRemarks || (() => {});
  const onProceedManualReview = props.onProceedWithManualReview || props.onProceedManualReview || (() => {});

  const [remarks, setRemarks] = useState('');
  const [validationError, setValidationError] = useState('');

  if (!isOpen) return null;

  const handleProceed = () => {
    if (!remarks.trim()) {
      setValidationError('Remarks and justification are required to proceed past this alert.');
      return;
    }
    setValidationError('');
    if (status === 'error') {
      onProceedManualReview(remarks.trim());
    } else {
      onProceedWithRemarks(remarks.trim());
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        // Prevent accidental backdrop closing so alerts cannot be skipped
        e.stopPropagation();
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          maxWidth: 580,
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: status === 'matches_found' ? '#FEF2F2' : status === 'error' ? '#FFFBEB' : '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: status === 'matches_found' ? '#FEE2E2' : status === 'error' ? '#FEF3C7' : '#E0F2FE',
                color: status === 'matches_found' ? '#DC2626' : status === 'error' ? '#D97706' : '#0369A1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i
                className={
                  status === 'matches_found'
                    ? 'ti ti-alert-triangle'
                    : status === 'error'
                    ? 'ti ti-alert-circle'
                    : 'ti ti-radar'
                }
                style={{ fontSize: 20 }}
              />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                {status === 'checking'
                  ? 'Checking for Potential Duplicates…'
                  : status === 'slow'
                  ? 'Still checking…'
                  : status === 'error'
                  ? 'AI check unavailable'
                  : 'Duplicate Document Alert'}
              </h3>
              <AiDisclaimer style={{ marginTop: 2 }} />
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', fontSize: 20, color: '#64748B', cursor: 'pointer' }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status: Checking & Slow */}
          {(status === 'checking' || status === 'slow') && (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  border: '4px solid #E2E8F0',
                  borderTopColor: '#0D9488',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px',
                }}
              />
              <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '1rem', marginBottom: 4 }}>
                {status === 'slow' ? 'Still checking… (Server taking longer than 5 seconds)' : 'Analyzing document signatures…'}
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                Verifying against existing invoices, receipts, and waybills in the FOMS database.
              </p>
            </div>
          )}

          {/* Status: Error (AI unavailable) */}
          {status === 'error' && (
            <div>
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 8,
                  padding: '14px 16px',
                  color: '#92400E',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                  marginBottom: 16,
                }}
              >
                <strong>AI duplicate detection service could not be reached.</strong>
                <div style={{ marginTop: 4, color: '#B45309' }}>
                  {errorMessage || 'Connection timed out or returned an error.'}
                </div>
              </div>

              <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 12px' }}>
                Per audit requirements (FR-006), saving cannot silently skip duplicate verification. You may retry the automated check or proceed with <strong>manual review justification</strong>. The skip will be logged in the audit trail.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Manual Review Justification (Required to proceed) *
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => {
                    setRemarks(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder="Explain manual document verification performed (e.g. verified physical hardcopy file #102)..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${validationError ? '#EF4444' : '#CBD5E1'}`,
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
                {validationError && (
                  <span style={{ color: '#DC2626', fontSize: '0.75rem', fontWeight: 600, marginTop: 4, display: 'block' }}>
                    {validationError}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Status: Matches Found */}
          {status === 'matches_found' && (
            <div>
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  padding: '12px 16px',
                  color: '#991B1B',
                  fontSize: '0.875rem',
                  marginBottom: 16,
                  fontWeight: 600,
                }}
              >
                Potential duplicate record(s) detected. Saving past an unreviewed alert is not permitted.
              </div>

              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {matches.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: '1px solid #E2E8F0',
                      background: '#F8FAFC',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.875rem' }}>
                        Match #{i + 1}: {m.documentNumber}
                      </span>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          color: m.similarity >= 95 ? '#DC2626' : '#D97706',
                          background: m.similarity >= 95 ? '#FEF2F2' : '#FFFBEB',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}
                      >
                        {m.similarity}% Similarity
                      </span>
                    </div>
                    {m.clientName && (
                      <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                        Client: <strong>{m.clientName}</strong>
                      </div>
                    )}
                    <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                      Reason: {m.matchReason}
                    </div>
                    {m.url && (
                      <div style={{ marginTop: 2 }}>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#0D9488', fontSize: '0.78rem', fontWeight: 700 }}
                        >
                          Inspect Existing Record ↗
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Review Justification &amp; Remarks (Required to Proceed) *
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => {
                    setRemarks(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder="Explain why this record is legitimate and not a duplicate (e.g. separate billing period, re-issuance)..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${validationError ? '#EF4444' : '#CBD5E1'}`,
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
                {validationError && (
                  <span style={{ color: '#DC2626', fontSize: '0.75rem', fontWeight: 600, marginTop: 4, display: 'block' }}>
                    {validationError}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
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
            Cancel Save
          </button>

          {status === 'error' && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: 'none',
                background: '#0D9488',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <i className="ti ti-refresh" style={{ marginRight: 6 }} />
              Retry Check
            </button>
          )}

          {(status === 'matches_found' || status === 'error') && (
            <button
              type="button"
              onClick={handleProceed}
              style={{
                padding: '9px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#0F172A',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {status === 'error' ? 'Proceed with Manual Review' : 'Proceed with Remarks'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DuplicatePreCheckModal;
