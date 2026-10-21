import React, { useState, useEffect, useRef } from 'react';

export interface RejectModalProps {
  isOpen: boolean;
  referenceNo?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export const RejectModal: React.FC<RejectModalProps> = ({
  isOpen,
  referenceNo,
  isSubmitting = false,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setTouched(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const trimmed = reason.trim();
  const isValid = trimmed.length >= 10;
  const showError = touched && !isValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValid || isSubmitting) return;
    onConfirm(trimmed);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth: '480px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInScale 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#FEF2F2',
                color: '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              <i className="ti ti-x" />
            </div>
            <div>
              <h3 id="reject-modal-title" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                Reject & Return for Revision
              </h3>
              {referenceNo && (
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Reference: <span style={{ fontWeight: 600 }}>{referenceNo}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close reject modal"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: '#94A3B8',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="ti ti-x" style={{ fontSize: '18px' }} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="rejection-reason"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
            >
              Rejection Reason <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <textarea
              id="rejection-reason"
              ref={textareaRef}
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={isSubmitting}
              placeholder="State clear, constructive reasons why this record requires revision (minimum 10 characters)..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: showError ? '1.5px solid #EF4444' : '1px solid #CBD5E1',
                fontSize: '13px',
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                background: isSubmitting ? '#F8FAFC' : '#FFFFFF',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <div>
                {showError && (
                  <span style={{ fontSize: '12px', color: '#EF4444', fontWeight: 500 }}>
                    Please provide at least 10 characters explaining the reason.
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: '11px',
                  color: trimmed.length < 10 ? '#94A3B8' : '#10B981',
                  fontWeight: 600,
                }}
              >
                {trimmed.length}/10 min chars
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '10px 14px',
              background: '#FFFBEB',
              borderRadius: '8px',
              border: '1px solid #FDE68A',
              fontSize: '12px',
              color: '#B45309',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
            }}
          >
            <i className="ti ti-info-circle" style={{ fontSize: '16px', marginTop: '1px', flexShrink: 0 }} />
            <span>
              This reason will be visible to the requester so they can amend and resubmit the record.
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: !isValid || isSubmitting ? '#FCA5A5' : '#EF4444',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: !isValid || isSubmitting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background 0.2s',
              }}
            >
              {isSubmitting && (
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid #FFFFFF',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.8s linear infinite',
                  }}
                  aria-hidden="true"
                />
              )}
              {isSubmitting ? 'Rejecting...' : 'Reject & Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
