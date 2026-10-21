import React, { useEffect, useRef } from 'react';
import { formatCurrency } from '../../utils/format';

export interface ApproveConfirmModalProps {
  isOpen: boolean;
  referenceNo?: string;
  amount: number;
  entityType?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export const ApproveConfirmModal: React.FC<ApproveConfirmModalProps> = ({
  isOpen,
  referenceNo,
  amount,
  entityType = 'Transaction',
  isSubmitting = false,
  onClose,
  onConfirm,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => confirmBtnRef.current?.focus(), 50);
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
      aria-labelledby="approve-modal-title"
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
          maxWidth: '440px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInScale 0.2s ease-out',
        }}
      >
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: '#ECFDF5',
              color: '#10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              margin: '0 auto 16px',
            }}
          >
            <i className="ti ti-check" />
          </div>

          <h3 id="approve-modal-title" style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
            Confirm Approval
          </h3>

          <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
            Are you sure you want to approve this {entityType}?
            {referenceNo && (
              <span style={{ display: 'block', fontWeight: 600, color: '#1E293B', marginTop: '4px' }}>
                Ref: {referenceNo}
              </span>
            )}
          </p>

          <div
            style={{
              padding: '14px',
              background: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              marginBottom: '20px',
            }}
          >
            <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Total Amount
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669' }}>
              {formatCurrency(amount)}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                flex: 1,
                padding: '10px 18px',
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
              ref={confirmBtnRef}
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              style={{
                flex: 1,
                padding: '10px 18px',
                borderRadius: '8px',
                border: 'none',
                background: isSubmitting ? '#6EE7B7' : '#10B981',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
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
              {isSubmitting ? 'Approving...' : 'Confirm Approve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
