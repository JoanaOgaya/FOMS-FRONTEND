import React, { useState, useEffect } from 'react';
import type { CashAdvance, CashAdvanceCreatePayload } from '../types/approvals';
import { approvalsService, formatApprovalErrorMessage } from '../services/approvalsService';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';
import { StatusBadge } from '../components/shared/StatusBadge';
import { useToast } from '../components/ToastContext';

export const MyCashAdvances: React.FC = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<CashAdvance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CashAdvance | null>(null);
  const [formData, setFormData] = useState<CashAdvanceCreatePayload>({
    amount: 0,
    purpose: '',
    dateNeeded: '',
    remarks: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await approvalsService.getMyCashAdvances();
      setItems(data || []);
    } catch (err) {
      setError(formatApprovalErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      amount: 0,
      purpose: '',
      dateNeeded: new Date().toISOString().split('T')[0],
      remarks: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: CashAdvance) => {
    setEditingItem(item);
    setFormData({
      amount: item.amount,
      purpose: item.purpose,
      dateNeeded: item.dateNeeded ? item.dateNeeded.split('T')[0] : '',
      remarks: item.remarks || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.amount <= 0) {
      toast.error('Please enter a valid amount greater than 0', 'Validation Error');
      return;
    }
    if (!formData.purpose.trim()) {
      toast.error('Purpose is required', 'Validation Error');
      return;
    }
    if (!formData.dateNeeded) {
      toast.error('Date needed is required', 'Validation Error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        await approvalsService.updateCashAdvance(editingItem.id, formData);
        toast.success('Cash advance draft updated successfully', 'Saved');
      } else {
        await approvalsService.createCashAdvance(formData);
        toast.success('Cash advance request created as draft', 'Created');
      }
      setIsModalOpen(false);
      fetchItems();
    } catch (err) {
      toast.error(formatApprovalErrorMessage(err), 'Failed to Save');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForApproval = async (item: CashAdvance) => {
    setActionLoadingId(item.id);
    try {
      await approvalsService.submit('CashAdvance', item.id);
      toast.success(
        `Cash advance ${item.referenceNo} submitted for approval`,
        'Submitted'
      );
      fetchItems();
    } catch (err) {
      toast.error(formatApprovalErrorMessage(err), 'Submission Failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#059669',
              background: '#ECFDF5',
              padding: '4px 10px',
              borderRadius: '6px',
              display: 'inline-block',
              marginBottom: '6px',
            }}
          >
            Cash Advance Management
          </span>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
            My Cash Advances
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748B' }}>
            Create and track cash advance requests and their approval statuses.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: 'none',
            background: '#10B981',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
          }}
        >
          <i className="ti ti-plus" /> Request Cash Advance
        </button>
      </div>

      {/* Main Table Container */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        }}
      >
        {isLoading ? (
          /* Loading Skeleton */
          <div style={{ padding: '24px' }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  height: '46px',
                  background: '#F1F5F9',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  animation: 'pulse 1.5s infinite',
                }}
              />
            ))}
          </div>
        ) : error ? (
          /* Error State */
          <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '720px', margin: '0 auto' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '24px',
              }}
            >
              <i className="ti ti-alert-triangle" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: '#991B1B' }}>
              Failed to Load Cash Advances
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748B' }}>
              The server encountered an error while retrieving your cash advances.
            </p>
            {error && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  margin: '0 auto 20px',
                  textAlign: 'left',
                  fontSize: '12px',
                  color: '#991B1B',
                  fontFamily: 'ui-monospace, monospace',
                  wordBreak: 'break-word',
                  lineHeight: '1.5',
                  maxHeight: '140px',
                  overflowY: 'auto',
                }}
              >
                <strong style={{ display: 'block', marginBottom: '4px', color: '#7F1D1D' }}>Backend Error:</strong>
                {error}
              </div>
            )}
            <button
              onClick={fetchItems}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#DC2626',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)',
              }}
            >
              <i className="ti ti-refresh" /> Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          /* Empty State */
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#F1F5F9',
                color: '#94A3B8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '24px',
              }}
            >
              <i className="ti ti-wallet" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#334155' }}>
              No Cash Advances Requested Yet
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748B' }}>
              Click the button above to request your first cash advance.
            </p>
            <button
              onClick={openCreateModal}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                background: '#10B981',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <i className="ti ti-plus" style={{ marginRight: '6px' }} /> Request Now
            </button>
          </div>
        ) : (
          /* Data List */
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Reference No.
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Purpose
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Amount (PHP)
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Date Needed
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Date Requested
                  </th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isDraft = item.status === 'Draft';
                  const isReturned = item.status === 'ReturnedForRevision' || (item.status as string) === 'Returned';
                  const isReadOnly = item.status === 'Submitted' || item.status === 'PendingFinanceManager' || item.status === 'Approved';

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        style={{
                          borderBottom: isReturned && item.rejectionReason ? 'none' : '1px solid #F1F5F9',
                          background: isReturned ? '#FEF2F2' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '14px 18px', fontWeight: 700, color: '#2563EB' }}>
                          {item.referenceNo}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#1E293B', fontWeight: 500 }}>
                          {item.purpose}
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                          {formatCurrency(item.amount)}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#64748B' }}>
                          {formatDate(item.dateNeeded)}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#64748B' }}>
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <StatusBadge status={item.status} />
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                            {/* Draft or Returned can edit */}
                            {(isDraft || isReturned) && (
                              <button
                                onClick={() => openEditModal(item)}
                                disabled={actionLoadingId === item.id}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid #CBD5E1',
                                  background: '#FFFFFF',
                                  color: '#334155',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Edit
                              </button>
                            )}

                            {/* Draft can submit, Returned can resubmit */}
                            {(isDraft || isReturned) && (
                              <button
                                onClick={() => handleSubmitForApproval(item)}
                                disabled={actionLoadingId === item.id}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#2563EB',
                                  color: '#FFFFFF',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: actionLoadingId === item.id ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                {actionLoadingId === item.id && (
                                  <span
                                    style={{
                                      width: '12px',
                                      height: '12px',
                                      border: '2px solid #FFFFFF',
                                      borderTopColor: 'transparent',
                                      borderRadius: '50%',
                                      display: 'inline-block',
                                      animation: 'spin 0.8s linear infinite',
                                    }}
                                  />
                                )}
                                {isReturned ? 'Resubmit' : 'Submit'}
                              </button>
                            )}

                            {/* Read-only status indicator */}
                            {isReadOnly && (
                              <span style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>
                                Under review
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Returned Rejection Reason Banner */}
                      {isReturned && item.rejectionReason && (
                        <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FEF2F2' }}>
                          <td colSpan={7} style={{ padding: '0 18px 12px 18px' }}>
                            <div
                              style={{
                                padding: '8px 12px',
                                background: '#FFFFFF',
                                border: '1px solid #FCA5A5',
                                borderRadius: '6px',
                                fontSize: '12px',
                                color: '#991B1B',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                              }}
                            >
                              <i className="ti ti-alert-circle" style={{ fontSize: '16px', color: '#DC2626' }} />
                              <span>
                                <strong>Rejection Reason:</strong> {item.rejectionReason} — Please update details above and resubmit.
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request / Edit Cash Advance Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              width: '100%',
              maxWidth: '500px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  {editingItem ? 'Edit Cash Advance Request' : 'New Cash Advance Request'}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Fill out the required information to request advance funds.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  padding: '6px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                <i className="ti ti-x" style={{ fontSize: '18px' }} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Amount (PHP) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  disabled={isSubmitting}
                  value={formData.amount === 0 ? '' : formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  placeholder="₱ 0.00"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Purpose <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={formData.purpose}
                  onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  placeholder="e.g. Warehouse logistics supplies, urgent delivery fuel"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Date Needed <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  disabled={isSubmitting}
                  value={formData.dateNeeded}
                  onChange={(e) => setFormData({ ...formData, dateNeeded: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Remarks (Optional)
                </label>
                <textarea
                  rows={3}
                  disabled={isSubmitting}
                  value={formData.remarks || ''}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Additional context or supporting notes..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  style={{
                    padding: '9px 16px',
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
                  disabled={isSubmitting}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#10B981',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
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
                    />
                  )}
                  {isSubmitting ? 'Saving...' : editingItem ? 'Update Draft' : 'Save as Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCashAdvances;
