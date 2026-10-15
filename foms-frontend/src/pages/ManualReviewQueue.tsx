import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { DuplicateStatusBadge } from '../components/duplicate/DuplicateStatusBadge';
import {
  DuplicateComparisonModal,
  type ComparisonCandidate,
  type ScannedDocDetails,
} from '../components/duplicate/DuplicateComparisonModal';

export interface ManualReviewQueueItem {
  requestId: string;
  documentId: string;
  documentType: string;
  documentNumber: string;
  clientName: string;
  date: string;
  amount: number;
  referenceNumber: string;
  paymentMethod: string;
  submittedBy: string;
  submittedById: string;
  submittedDate: string;
  accountantNote: string;
  fileUrl: string;
  matches: ComparisonCandidate[];
}

export const ManualReviewQueue: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentUserId = user?.id || user?.employeeId || 'usr-fm-901';

  // State initialized with sample pending manual review records
  const [queueItems, setQueueItems] = useState<ManualReviewQueueItem[]>([
    {
      requestId: 'req-901',
      documentId: 'doc-849102',
      documentType: 'Invoice',
      documentNumber: 'INV-2026-9021',
      clientName: 'San Miguel Corporation',
      date: 'Oct 15, 2026',
      amount: 250000.00,
      referenceNumber: 'REF-2026-991',
      paymentMethod: 'Bank Transfer',
      submittedBy: 'Maria Mariel Jane Anonuevo (Accountant)',
      submittedById: 'usr-acc-101',
      submittedDate: 'Oct 15, 2026',
      accountantNote: 'Dates differ by 4 days, but invoice number and client match existing billing record. Please verify if this is an extension billing.',
      fileUrl: '/mock-receipt.png',
      matches: [
        {
          matchId: 'm-1',
          matchedDocumentId: 'doc-771829',
          documentNumber: 'INV-2026-9021',
          clientName: 'San Miguel Corporation',
          date: 'Oct 11, 2026',
          amount: 250000.00,
          referenceNumber: 'REF-2026-991',
          paymentMethod: 'Bank Transfer',
          sourceModule: 'Billing Invoices',
          uploadedBy: 'John Reyes (Accountant)',
          fileUrl: '/mock-receipt.png',
          similarityScore: 0.95,
          matchedFields: ['documentNumber', 'clientName', 'amount', 'referenceNumber'],
        },
      ],
    },
  ]);

  const [activeItem, setActiveItem] = useState<ManualReviewQueueItem | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnComment, setReturnComment] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Trigger bell notification to accountant
  const dispatchNotification = (recipientId: string, title: string, message: string) => {
    try {
      const existing = JSON.parse(localStorage.getItem('foms_notifications') || '[]');
      const notif = {
        id: `notif-${Date.now()}`,
        recipientId,
        title,
        message,
        date: new Date().toISOString(),
        read: false,
      };
      localStorage.setItem('foms_notifications', JSON.stringify([notif, ...existing]));
    } catch {
      // Ignored
    }
  };

  const handleResolve = (item: ManualReviewQueueItem, decision: 'CONFIRM_UNIQUE' | 'CONFIRM_DUPLICATE') => {
    // Segregation of duties: FM cannot review a document they submitted themselves
    if (item.submittedById === currentUserId) {
      toast.error('Violation: You cannot review a document that you submitted yourself.', 'Segregation of Duties');
      return;
    }

    setQueueItems(prev => prev.filter(q => q.requestId !== item.requestId));
    const title = decision === 'CONFIRM_UNIQUE' ? 'Manual Review Cleared: Unique' : 'Manual Review Confirmed: Duplicate Flagged';
    const message = `Document #${item.documentNumber} has been verified as ${decision === 'CONFIRM_UNIQUE' ? 'UNIQUE' : 'DUPLICATE (FLAGGED)'} by Finance Manager.`;

    dispatchNotification(item.submittedById, title, message);
    toast.success(
      `Document #${item.documentNumber} has been marked as ${decision === 'CONFIRM_UNIQUE' ? 'Unique' : 'Duplicate (Flagged)'}.`,
      'Review Completed'
    );
  };

  const handleReturnSubmit = () => {
    if (!activeItem) return;
    if (returnComment.trim().length < 10) {
      toast.warning('Please enter a feedback comment with at least 10 characters.', 'Required Comment');
      return;
    }

    setQueueItems(prev => prev.filter(q => q.requestId !== activeItem.requestId));
    dispatchNotification(
      activeItem.submittedById,
      'Document Returned by Finance Manager',
      `Document #${activeItem.documentNumber} was returned: "${returnComment}"`
    );

    setShowReturnModal(false);
    setReturnComment('');
    toast.info(`Document returned to ${activeItem.submittedBy} with comments.`, 'Document Returned');
  };

  const filteredItems = queueItems.filter(item => {
    if (filterType === 'ALL') return true;
    return item.documentType.toUpperCase() === filterType;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: '1.5rem', fontWeight: 800, color: '#0F172A' }}>
          Manual Review Queue
        </h1>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
          Authoritative review queue for ambiguous duplicate detections escalated by accountants.
        </p>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['ALL', 'INVOICE', 'OFFICIAL RECEIPT', 'PAYMENT PROOF'].map(type => (
          <button
            key={type}
            type="button"
            onClick={() => setFilterType(type)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: filterType === type ? '#0D9488' : '#FFFFFF',
              color: filterType === type ? '#FFFFFF' : '#475569',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Queue Listing */}
      {filteredItems.length === 0 ? (
        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '48px', textAlign: 'center' }}>
          <i className="ti ti-checklist" style={{ fontSize: '42px', color: '#0D9488' }} />
          <h3 style={{ margin: '12px 0 4px', fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
            Manual Review Queue is Clear
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
            No pending duplicate reviews require managerial validation.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredItems.map(item => {
            const isSelfSubmission = item.submittedById === currentUserId;
            return (
              <div
                key={item.requestId}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '1.05rem', color: '#0F172A' }}>{item.documentNumber}</strong>
                      <span style={{ fontSize: '0.85rem', color: '#475569' }}>({item.clientName})</span>
                      <DuplicateStatusBadge status="UNDER_MANUAL_REVIEW" />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                      Submitted by {item.submittedBy} on {item.submittedDate} • {item.documentType}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                      ₱{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Accountant Note Box */}
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#B45309', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                    Accountant Clarification Note
                  </span>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#78350F', lineHeight: 1.5 }}>
                    "{item.accountantNote}"
                  </p>
                </div>

                {/* Self-Review Warning */}
                {isSelfSubmission && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.785rem', color: '#991B1B' }}>
                    <i className="ti ti-lock" /> Segregation of duties: You submitted this document. Another Finance Manager must perform this review.
                  </div>
                )}

                {/* Decision Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveItem(item);
                      setIsComparing(true);
                    }}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    Side-by-Side View
                  </button>
                  <button
                    type="button"
                    disabled={isSelfSubmission}
                    onClick={() => {
                      setActiveItem(item);
                      setShowReturnModal(true);
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid #FFEDD5',
                      background: '#FFF7ED',
                      color: '#C2410C',
                      fontWeight: 700,
                      cursor: isSelfSubmission ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Return to Accountant
                  </button>
                  <button
                    type="button"
                    disabled={isSelfSubmission}
                    onClick={() => handleResolve(item, 'CONFIRM_UNIQUE')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#0D9488',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      cursor: isSelfSubmission ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Confirm Unique
                  </button>
                  <button
                    type="button"
                    disabled={isSelfSubmission}
                    onClick={() => handleResolve(item, 'CONFIRM_DUPLICATE')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#DC2626',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      cursor: isSelfSubmission ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Confirm Duplicate (Flag)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Comparison Modal in Review Mode */}
      {isComparing && activeItem && (
        <DuplicateComparisonModal
          isOpen={isComparing}
          onClose={() => setIsComparing(false)}
          scannedDoc={{
            documentNumber: activeItem.documentNumber,
            clientName: activeItem.clientName,
            date: activeItem.date,
            amount: activeItem.amount,
            referenceNumber: activeItem.referenceNumber,
            paymentMethod: activeItem.paymentMethod,
            fileUrl: activeItem.fileUrl,
          }}
          candidates={activeItem.matches}
          isReviewMode={true}
        />
      )}

      {/* Return Modal */}
      {showReturnModal && activeItem && (
        <div
          role="dialog"
          aria-modal="true"
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
          onClick={() => setShowReturnModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
              Return Document to Accountant
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#64748B' }}>
              Specify the missing information or verification steps required before re-evaluating.
            </p>
            <textarea
              rows={4}
              value={returnComment}
              onChange={e => setReturnComment(e.target.value)}
              placeholder="Enter clear review feedback and requirements (min 10 characters)..."
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                marginBottom: '16px',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#fff' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={returnComment.trim().length < 10}
                onClick={handleReturnSubmit}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: returnComment.trim().length >= 10 ? '#C2410C' : '#94A3B8',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: returnComment.trim().length >= 10 ? 'pointer' : 'not-allowed',
                }}
              >
                Send Return Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
