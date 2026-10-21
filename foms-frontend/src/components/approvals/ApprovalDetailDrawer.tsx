import React, { useState, useEffect } from 'react';
import type { ApprovalRequest, ApprovalStep } from '../../types/approvals';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { StatusBadge } from '../shared/StatusBadge';
import { ApprovalHistoryTimeline } from './ApprovalHistoryTimeline';
import { RejectModal } from './RejectModal';
import { ApproveConfirmModal } from './ApproveConfirmModal';
import { approvalsService, formatApprovalErrorMessage } from '../../services/approvalsService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ToastContext';

export interface ApprovalDetailDrawerProps {
  isOpen: boolean;
  requestId: string | null;
  onClose: () => void;
  onActionSuccess?: () => void;
}

export const ApprovalDetailDrawer: React.FC<ApprovalDetailDrawerProps> = ({
  isOpen,
  requestId,
  onClose,
  onActionSuccess,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [history, setHistory] = useState<ApprovalStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadDetails = async () => {
    if (!requestId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [reqData, histData] = await Promise.all([
        approvalsService.getById(requestId),
        approvalsService.getHistory(requestId).catch(() => []),
      ]);
      setRequest(reqData);
      setHistory(histData || []);
    } catch (err) {
      setError(formatApprovalErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && requestId) {
      loadDetails();
    } else {
      setRequest(null);
      setHistory([]);
      setError(null);
    }
  }, [isOpen, requestId]);

  if (!isOpen) return null;

  // Self-approval guard check
  const isSelfRequest = Boolean(
    user &&
      request &&
      (user.id === request.requestedById ||
        user.employeeId === request.requestedById ||
        user.fullName === request.requestedBy ||
        (user.id && user.id === request.requestedBy) ||
        (user.employeeId && user.employeeId === request.requestedBy))
  );

  const isFinanceManager = user?.role === 'FINANCIAL_MANAGER';
  const isAssistant = user?.role === 'ASSISTANT_FM';

  // Detail Drawer Actions:
  // Show "Approve" and "Reject" ONLY when status is PendingFinanceManager,
  // role is Finance Manager, and logged-in user is not the requester.
  const canFmAct = Boolean(
    request &&
      request.status === 'PendingFinanceManager' &&
      isFinanceManager &&
      !isSelfRequest
  );

  // Asst. Finance Manager actions on Level 1 Submitted requests
  const canAfmAct = Boolean(
    request &&
      request.status === 'Submitted' &&
      isAssistant &&
      !isSelfRequest
  );

  const canTakeAction = canFmAct || canAfmAct;

  const getStateExplanation = (): string | null => {
    if (!request) return null;
    if (isSelfRequest) {
      return 'You are the requester. Self-approval is not permitted.';
    }
    if (request.status === 'ReturnedForRevision' || request.status === 'Returned') {
      return 'Returned to requester. Waiting for resubmission.';
    }
    if (request.status === 'Approved') {
      return 'Approved and posted to cash flow.';
    }
    if (request.status === 'Rejected') {
      return 'Rejected. Transaction closed.';
    }
    if (request.status === 'PendingFinanceManager' && !isFinanceManager) {
      return 'Escalated to Finance Manager for final approval.';
    }
    if (request.status === 'Submitted' && isFinanceManager) {
      return 'Awaiting initial review by Assistant Finance Manager.';
    }
    return null;
  };

  const stateExplanation = getStateExplanation();

  const handleActionError = async (err: unknown, defaultMessage: string) => {
    const errorObj = err as any;
    const status = errorObj?.status || errorObj?.response?.status;
    if (status === 409) {
      toast.warning('This record was already acted on by someone else.', 'Status Changed');
    } else if (status === 403) {
      toast.error('You do not have permission to perform this action.', 'Action Restricted');
    } else {
      toast.error(formatApprovalErrorMessage(err) || defaultMessage, 'Action Failed');
    }
    await loadDetails();
    onActionSuccess?.();
  };

  const handleApprove = async () => {
    if (!request) return;
    setIsSubmitting(true);
    try {
      await approvalsService.approve(request.id);
      toast.success(
        `Approved ${request.entityType} ${request.referenceNo} successfully`,
        'Approval Successful'
      );
      setIsApproveModalOpen(false);
      onActionSuccess?.();
      onClose();
    } catch (err) {
      await handleActionError(err, 'Approval Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!request) return;
    setIsSubmitting(true);
    try {
      await approvalsService.reject(request.id, reason);
      toast.warning(
        `Returned ${request.entityType} ${request.referenceNo} for revision`,
        'Record Returned'
      );
      setIsRejectModalOpen(false);
      onActionSuccess?.();
      onClose();
    } catch (err) {
      await handleActionError(err, 'Rejection Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEscalate = async () => {
    if (!request) return;
    setIsSubmitting(true);
    try {
      await approvalsService.escalate(
        request.id,
        'Flagged for secondary review by policy. Endorsed to Financial Manager.'
      );
      toast.warning(
        `Escalated ${request.entityType} ${request.referenceNo} to Financial Manager`,
        'Transaction Escalated'
      );
      onActionSuccess?.();
      onClose();
    } catch (err) {
      await handleActionError(err, 'Escalation Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 9000,
          display: 'flex',
          justifyContent: 'flex-end',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSubmitting) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-detail-drawer-title"
      >
        <div
          style={{
            width: '100%',
            maxWidth: '560px',
            height: '100%',
            background: '#FFFFFF',
            boxShadow: '-10px 0 25px -5px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: '#64748B',
                    letterSpacing: '0.05em',
                  }}
                >
                  {request?.entityType || 'Approval'} Request
                </span>
                {request && <StatusBadge status={request.status} />}
              </div>
              <h2
                id="approval-detail-drawer-title"
                style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}
              >
                {request?.referenceNo || 'Loading Details...'}
              </h2>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close drawer"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                color: '#64748B',
                padding: '8px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="ti ti-x" style={{ fontSize: '20px' }} />
            </button>
          </div>

          {/* Body Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ height: '70px', background: '#F1F5F9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ height: '120px', background: '#F1F5F9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ height: '180px', background: '#F1F5F9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
              </div>
            ) : error ? (
              <div
                style={{
                  padding: '24px',
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '12px',
                  textAlign: 'center',
                }}
              >
                <i className="ti ti-alert-triangle" style={{ fontSize: '28px', color: '#DC2626', marginBottom: '8px', display: 'block' }} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#991B1B', marginBottom: '6px' }}>
                  Failed to Load Request Details
                </div>
                <div style={{ fontSize: '13px', color: '#B91C1C', marginBottom: '16px' }}>{error}</div>
                <button
                  type="button"
                  onClick={loadDetails}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <i className="ti ti-refresh" style={{ marginRight: '6px' }} /> Retry
                </button>
              </div>
            ) : request ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Escalation Notice (Server decided only) */}
                {request.isEscalated === true && (
                  <div
                    style={{
                      padding: '14px 16px',
                      background: '#FFFBEB',
                      border: '1px solid #FCD34D',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <i className="ti ti-alert-circle" style={{ fontSize: '20px', color: '#D97706', marginTop: '1px', flexShrink: 0 }} />
                    <div style={{ fontSize: '13px', color: '#92400E', lineHeight: '1.4' }}>
                      <strong style={{ display: 'block', marginBottom: '2px', color: '#78350F' }}>
                        High-Value Escalation Notice
                      </strong>
                      This transaction is escalated to the Finance Manager for secondary approval
                      {typeof request.escalationThreshold === 'number' && (
                        <span> (exceeds threshold of {formatCurrency(request.escalationThreshold)})</span>
                      )}
                      .
                    </div>
                  </div>
                )}

                {/* Self Approval Warning Banner */}
                {isSelfRequest && (
                  <div
                    style={{
                      padding: '12px 16px',
                      background: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '13px',
                      color: '#475569',
                    }}
                  >
                    <i className="ti ti-shield-lock" style={{ fontSize: '18px', color: '#0EA5E9' }} />
                    <span>
                      <strong>Self-Approval Guard:</strong> You are the requester. You cannot approve or reject this request.
                    </span>
                  </div>
                )}

                {/* Amount Hero Card */}
                <div
                  style={{
                    padding: '18px 20px',
                    background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
                    borderRadius: '14px',
                    border: '1px solid #DBEAFE',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                      Transaction Amount
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#1E3A8A' }}>
                      {formatCurrency(request.amount)}
                    </div>
                  </div>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: '#DBEAFE',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                    }}
                  >
                    <i className="ti ti-cash" />
                  </div>
                </div>

                {/* Record Details Grid */}
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '18px',
                  }}
                >
                  <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                    Record Information
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                        TRANSACTION TYPE
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                        {request.entityType}
                      </span>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                        REFERENCE NUMBER
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                        {request.referenceNo}
                      </span>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                        REQUESTED BY
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                        {request.requestedBy || 'N/A'}
                      </span>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                        DATE SUBMITTED
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                        {formatDateTime(request.createdAt)}
                      </span>
                    </div>

                    {request.currentLevel && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                          CURRENT APPROVAL LEVEL
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#2563EB' }}>
                          {request.currentLevel}
                        </span>
                      </div>
                    )}

                    {(request.purpose || request.description) && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                          PURPOSE / DESCRIPTION
                        </span>
                        <span style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                          {request.purpose || request.description}
                        </span>
                      </div>
                    )}

                    {(request.status === 'ReturnedForRevision' || request.status === 'Returned' || Boolean(request.rejectionReason)) && (
                      <div
                        style={{
                          gridColumn: 'span 2',
                          padding: '14px 16px',
                          background: '#FEF2F2',
                          borderRadius: '10px',
                          border: '1px solid #FECACA',
                          boxShadow: '0 1px 3px rgba(239, 68, 68, 0.1)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <i className="ti ti-alert-triangle" style={{ fontSize: '18px', color: '#DC2626' }} />
                          <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Reason for Return / Revision Required
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#B91C1C', lineHeight: '1.5', whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                          {request.rejectionReason || request.remarks || 'Returned to requester for corrections. Waiting for resubmission.'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Approval History Timeline */}
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '18px',
                  }}
                >
                  <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                    Approval History & Audit Trail
                  </h4>
                  <ApprovalHistoryTimeline
                    history={history}
                    isLoading={false}
                    requestedBy={request.requestedBy}
                    requestedById={request.requestedById}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer Action Buttons */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            {canTakeAction ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Close
                </button>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {/* Reject Button */}
                  <button
                    type="button"
                    onClick={() => setIsRejectModalOpen(true)}
                    disabled={isSubmitting}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '8px',
                      border: '1px solid #EF4444',
                      background: '#FFFFFF',
                      color: '#EF4444',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {isSubmitting ? (
                      <i className="ti ti-loader animate-spin" />
                    ) : (
                      <i className="ti ti-x" />
                    )}
                    Reject
                  </button>

                  {/* Escalate (AFM on flagged items) or Approve */}
                  {canAfmAct && request?.isEscalated === true ? (
                    <button
                      type="button"
                      onClick={handleEscalate}
                      disabled={isSubmitting}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#D97706',
                        color: '#FFFFFF',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 6px rgba(217, 119, 6, 0.3)',
                      }}
                    >
                      {isSubmitting ? (
                        <i className="ti ti-loader animate-spin" />
                      ) : (
                        <i className="ti ti-urgent" />
                      )}
                      Escalate to Financial Manager
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsApproveModalOpen(true)}
                      disabled={isSubmitting}
                      style={{
                        padding: '10px 22px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#10B981',
                        color: '#FFFFFF',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      {isSubmitting ? (
                        <i className="ti ti-loader animate-spin" />
                      ) : (
                        <i className="ti ti-check" />
                      )}
                      Approve
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {stateExplanation ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B', fontSize: '13px', fontWeight: 500 }}>
                    <i className="ti ti-info-circle" style={{ fontSize: '16px', color: '#94A3B8' }} />
                    <span>{stateExplanation}</span>
                  </div>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation and Reject Modals */}
      {request && (
        <>
          <ApproveConfirmModal
            isOpen={isApproveModalOpen}
            referenceNo={request.referenceNo}
            amount={request.amount}
            entityType={request.entityType}
            isSubmitting={isSubmitting}
            onClose={() => setIsApproveModalOpen(false)}
            onConfirm={handleApprove}
          />
          <RejectModal
            isOpen={isRejectModalOpen}
            referenceNo={request.referenceNo}
            isSubmitting={isSubmitting}
            onClose={() => setIsRejectModalOpen(false)}
            onConfirm={handleReject}
          />
        </>
      )}
    </>
  );
};
