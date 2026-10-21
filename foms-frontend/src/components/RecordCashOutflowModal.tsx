import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { cashFlowService } from '../services/cashFlowService';
import { useToast } from './ToastContext';
import { invalidateForMutation } from '../services/invalidation';

export interface RecordCashOutflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const RecordCashOutflowModal: React.FC<RecordCashOutflowModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    referenceNumber: '',
    category: 'Disbursement',
    payee: '',
    description: '',
    amount: '',
    currency: 'PHP',
    transactionDate: new Date().toISOString().split('T')[0],
    supportingDocuments: '',
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(form.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (!form.referenceNumber.trim()) {
      setError('Reference number is required.');
      return;
    }
    if (!form.payee.trim()) {
      setError('Payee/recipient is required.');
      return;
    }
    if (!form.description.trim()) {
      setError('Purpose/description is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await cashFlowService.recordOutflow({
        referenceNumber: form.referenceNumber.trim(),
        category: form.category,
        payee: form.payee.trim(),
        description: form.description.trim(),
        amount: amountNum,
        currency: form.currency,
        transactionDate: form.transactionDate,
        supportingDocuments: form.supportingDocuments.trim() || undefined,
      });

      toast.success(
        `Cash Outflow ${form.referenceNumber} recorded (₱${amountNum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}) and queued for Assistant review.`,
        'Outflow Recorded'
      );

      await invalidateForMutation('recordCashFlow');
      onSuccess?.();
      onClose();
      // Reset form
      setForm({
        referenceNumber: '',
        category: 'Disbursement',
        payee: '',
        description: '',
        amount: '',
        currency: 'PHP',
        transactionDate: new Date().toISOString().split('T')[0],
        supportingDocuments: '',
      });
    } catch (err: any) {
      const msg = err?.message || 'Failed to record cash outflow. Please try again.';
      setError(msg);
      toast.error(msg, 'Record Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99999,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 14,
          padding: '28px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: '1px solid #F1F5F9',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: '#DC2626',
                  background: '#FEF2F2',
                  padding: '3px 8px',
                  borderRadius: 6,
                  letterSpacing: '0.05em',
                }}
              >
                Cash Outflow
              </span>
              <span style={{ fontSize: 12, color: '#64748B' }}>Level 1 Review Queue</span>
            </div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
              Record Cash Outflow
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'none',
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: '#94A3B8',
              fontSize: 24,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              color: '#B91C1C',
              fontSize: '0.85rem',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i className="ti ti-alert-circle" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Reference Number *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. CO-2026-001"
                value={form.referenceNumber}
                onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  fontWeight: 600,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Category *
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              >
                <option value="Disbursement">Disbursement</option>
                <option value="Office Supplies">Office Supplies</option>
                <option value="Utilities">Utilities</option>
                <option value="Salaries">Salaries</option>
                <option value="Transportation">Transportation</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Refund">Refund</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Payee / Recipient *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. National Bookstore, Meralco"
                value={form.payee}
                onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Amount (₱ PHP) *
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                  fontWeight: 800,
                  color: '#0F172A',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
              Purpose / Description *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Detailed reason for cash outflow..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                background: '#F8FAFC',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Transaction Date *
              </label>
              <input
                required
                type="date"
                value={form.transactionDate}
                onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Supporting Documents (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Receipt #4491, Invoice-99"
                value={form.supportingDocuments}
                onChange={(e) => setForm((f) => ({ ...f, supportingDocuments: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              background: '#EFF6FF',
              borderRadius: 8,
              border: '1px solid #BFDBFE',
              fontSize: '0.82rem',
              color: '#1E40AF',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i className="ti ti-info-circle" style={{ fontSize: 16 }} />
            <span>
              Initial Status: <strong>Pending Assistant Review</strong>. Items flagged by policy will be endorsed for secondary review.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                background: '#F1F5F9',
                color: '#475569',
                border: 'none',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                background: '#EF4444',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)',
              }}
            >
              {isSubmitting ? (
                <>
                  <i className="ti ti-refresh animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <i className="ti ti-arrow-up-right" /> Record Outflow
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
