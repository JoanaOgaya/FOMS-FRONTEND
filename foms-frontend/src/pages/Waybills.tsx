import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/Buttons';
import { Card } from '../components/Card';
import { CalendarPicker } from '../components/FormModals';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { TableContainer } from '../components/TableContainer';
import { ClientInfoCard } from '../components/ClientInfoCard';
import { waybillsService } from '../services/waybillsService';
import { clientsService } from '../services/clientsService';
import { auditLogsService } from '../services/auditLogsService';
import { useQuery } from '../hooks/useQuery';
import { Waybill, Client } from '../types/entities';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { useDuplicatePreCheck } from '../hooks/useDuplicatePreCheck';
import { DuplicatePreCheckModal } from '../components/ai/DuplicatePreCheckModal';
import { canCheckDuplicateInForm } from '../utils/roleAccess';

const WaybillDetailCard: React.FC<{ waybill: Waybill, onUpdate: (id: string, updates: Partial<Waybill>) => void, userRole?: string }> = ({ waybill, onUpdate, userRole }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState({
    signature: false,
    waybillMatch: false,
    dateMatch: false,
    notDuplicate: false
  });
  const [ctcForm, setCtcForm] = useState({
    reason: '',
    additionalRemarks: ''
  });
  const [rejectReason, setRejectReason] = useState('');
  const [rejectCategory, setRejectCategory] = useState('');
  const [activeTab, setActiveTab] = useState(waybill.status === 'Missing' ? 'Submit CTC' : 'Approve');
  const [showImageModal, setShowImageModal] = useState(false);

  const allChecked = Object.values(checklist).every(Boolean);

  const handleValidate = async () => {
    if (window.confirm('Confirm this waybill is valid for billing?')) {
      const newStatus = waybill.is_ctc ? 'Validated (CTC)' : 'Validated';
      onUpdate(waybill.id, { status: newStatus as Waybill['status'] });
      try {
        await auditLogsService.create({
          userId: user?.employeeId || 'U-000',
          userFullName: user?.fullName || 'System',
          userRole: user?.role || 'ACCOUNTANT',
          action: 'VALIDATE_WAYBILL',
          module: 'Waybills',
          recordId: waybill.waybillNumber,
          recordType: 'Waybill',
          ipAddress: '127.0.0.1',
          details: `Validated waybill ${waybill.waybillNumber}`,
          timestamp: new Date().toISOString()
        });
      } catch (e) {}
      toast.success(`Waybill ${waybill.waybillNumber} successfully validated.`);
    }
  };

  const handleReject = () => {
    if (!rejectCategory) {
      toast.error('Please select a reason for rejection.');
      return;
    }
    if (window.confirm('Return this waybill to Operations for correction?')) {
      onUpdate(waybill.id, { status: 'Returned', notes: `${rejectCategory}: ${rejectReason}` });
      toast.warning(`Waybill ${waybill.waybillNumber} returned to Ops.`);
      setRejectReason('');
      setRejectCategory('');
    }
  };

  const handleMarkMissing = () => {
    if (window.confirm('Mark this waybill as Missing Original Document?')) {
      onUpdate(waybill.id, { status: 'Missing' });
      toast.warning(`Waybill ${waybill.waybillNumber} marked as Missing.`);
    }
  };

  const handleCtcSubmit = () => {
    onUpdate(waybill.id, {
      status: 'Pending',
      is_ctc: true,
      reason_for_missing: ctcForm.reason,
      notes: ctcForm.additionalRemarks,
      pod_image_url: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?q=80&w=600&auto=format&fit=crop',
      uploaded_date: new Date().toISOString()
    });
    toast.success(`CTC details submitted for ${waybill.waybillNumber}.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Header Card */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>Waybill Verification: {waybill.waybillNumber}</h3>
          <StatusBadge status={waybill.status} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="ti ti-calendar" style={{ fontSize: '16px' }} /> DELIVERY DATE</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>{new Date(waybill.deliveryDate).toLocaleDateString('en-PH')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="ti ti-package" style={{ fontSize: '16px' }} /> DELIVERY TYPE</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>{waybill.deliveryType || 'Standard'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="ti ti-user" style={{ fontSize: '16px' }} /> ASSIGNED COURIER</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>{waybill.assignedCourier || 'Pending Assignment'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="ti ti-map-pin" style={{ fontSize: '16px' }} /> DESTINATION AREA</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>{waybill.destinationArea || 'N/A'}</span>
          </div>
        </div>
      </Card>

      {/* 2. Waybill Information */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <i className="ti ti-file-description" style={{ fontSize: '24px', color: '#3B82F6' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Waybill Information</h4>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
            <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', margin: '0 0 12px' }}>SENDER DETAILS</h5>
            <p style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 600, color: '#0F172A' }}>{waybill.senderName || 'Unknown Sender'}</p>
            <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="ti ti-phone" /> {waybill.senderContact || 'No contact provided'}</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="ti ti-map-pin" /> {waybill.senderAddress || 'No address provided'}</p>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
            <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', margin: '0 0 12px' }}>RECEIVER DETAILS</h5>
            <p style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 600, color: '#0F172A' }}>{waybill.receiverName || 'Unknown Receiver'}</p>
            <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="ti ti-phone" /> {waybill.receiverContact || 'No contact provided'}</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="ti ti-map-pin" /> {waybill.receiverAddress || 'No address provided'}</p>
          </div>
        </div>

        <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
          <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', margin: '0 0 16px', textTransform: 'uppercase' }}>PACKAGE DETAILS</h5>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>DESCRIPTION</span>
              <span style={{ fontSize: '0.95rem', color: '#0F172A', fontWeight: 500 }}>{waybill.itemDescription || '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>QUANTITY</span>
              <span style={{ fontSize: '0.95rem', color: '#0F172A', fontWeight: 500 }}>{waybill.itemQuantity || '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>WEIGHT</span>
              <span style={{ fontSize: '0.95rem', color: '#0F172A', fontWeight: 500 }}>{waybill.itemWeight || '—'}</span>
            </div>
          </div>
        </div>

        {waybill.specialInstructions && (
          <div style={{ marginTop: '16px', padding: '12px', background: '#FFFBEB', borderRadius: '8px', border: '1px solid #FDE68A' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400E', display: 'block', marginBottom: '4px' }}>SPECIAL INSTRUCTIONS / REMARKS</span>
            <span style={{ fontSize: '0.85rem', color: '#92400E' }}>{waybill.specialInstructions}</span>
          </div>
        )}
      </Card>

      {/* 3. Document Verification */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <i className="ti ti-shield-check" style={{ fontSize: '24px', color: '#1D4ED8' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Waybill Document Verification</h4>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Left: Document Preview */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-file-text" /> Document Preview
            </h4>
            {waybill.pod_image_url ? (
              <div style={{ border: '1px dashed #CBD5E1', borderRadius: '8px', overflow: 'hidden' }}>
                <div onClick={() => setShowImageModal(true)} title="Click to view full size" style={{ display: 'block', cursor: 'pointer' }}>
                  <img src={waybill.pod_image_url} alt="POD Document" style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }} />
                </div>
                <div style={{ padding: '12px 16px', background: '#F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="ti ti-file-type-jpg" style={{ fontSize: '20px', color: '#6366F1' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                      {waybill.is_ctc ? 'Certified True Copy' : 'Original POD'}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748B' }}>
                    <p style={{ margin: 0 }}>By: {waybill.uploaded_by || 'Unknown'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ height: '200px', background: '#F1F5F9', border: '1px dashed #CBD5E1', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#94A3B8' }}>
                <i className="ti ti-camera-off" style={{ fontSize: '32px', margin: '0 0 12px', color: '#94A3B8' }} />
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>No document attached</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>Original POD is missing.</p>
              </div>
            )}
          </div>

          {/* Right: Actions / Verification Status */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-circle-check" style={{ color: '#10B981' }} /> Verification Status
            </h4>

            {waybill.status.includes('Validated') ? (
              <div style={{ background: '#F0FDF4', padding: '16px', borderRadius: '8px', border: '1px solid #BBF7D0', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                <i className="ti ti-circle-check" style={{ fontSize: '20px' }} />
                <span style={{ fontSize: '0.85rem' }}>This document has already been validated.</span>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: '#F8FAFC', padding: '4px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <button onClick={() => setActiveTab('Submit CTC')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: activeTab === 'Submit CTC' ? '#FFFBEB' : 'transparent', color: activeTab === 'Submit CTC' ? '#92400E' : '#64748B', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>Submit CTC</button>
                  <button onClick={() => setActiveTab('Approve')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: activeTab === 'Approve' ? '#F0FDF4' : 'transparent', color: activeTab === 'Approve' ? '#166534' : '#64748B', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>Approve</button>
                  <button onClick={() => setActiveTab('Reject')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: activeTab === 'Reject' ? '#FEF2F2' : 'transparent', color: activeTab === 'Reject' ? '#991B1B' : '#64748B', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>Reject</button>
                </div>

                {/* Tab Content */}
                {activeTab === 'Submit CTC' && (
                  <div style={{ background: '#FFFBEB', padding: '16px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#92400E', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="ti ti-alert-triangle" /> Missing Original Document
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: '#B45309', margin: '0 0 16px' }}>
                      The original POD was not received. Please submit CTC details to proceed.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400E', display: 'block', marginBottom: '4px' }}>Reason for Issuing CTC *</label>
                        <select value={ctcForm.reason} onChange={e => setCtcForm(p => ({ ...p, reason: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FCD34D', background: '#fff', outline: 'none' }}>
                          <option value="">Select Reason...</option>
                          <option value="POD Not Submitted">POD Not Submitted</option>
                          <option value="POD Lost/ Unavailable">POD Lost/ Unavailable</option>
                          <option value="POD Damaged / Unreadable">POD Damaged / Unreadable</option>
                          <option value="POD Not Obtained, Recipient">POD Not Obtained, Recipient</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400E', display: 'block', marginBottom: '4px' }}>Additional Remarks</label>
                        <textarea value={ctcForm.additionalRemarks} onChange={e => setCtcForm(p => ({ ...p, additionalRemarks: e.target.value }))} placeholder="Optional notes..." rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FCD34D', background: '#fff', outline: 'none', resize: 'vertical' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <Button title="Submit CTC" variant="primary" onClick={handleCtcSubmit} disabled={!ctcForm.reason} />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'Approve' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Validation Checklist</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1E293B', cursor: 'pointer' }}>
                        <input type="checkbox" checked={checklist.signature} onChange={e => setChecklist(p => ({ ...p, signature: e.target.checked }))} />
                        Receiver signature is clearly legible
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1E293B', cursor: 'pointer' }}>
                        <input type="checkbox" checked={checklist.waybillMatch} onChange={e => setChecklist(p => ({ ...p, waybillMatch: e.target.checked }))} />
                        Waybill number matches physical document
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1E293B', cursor: 'pointer' }}>
                        <input type="checkbox" checked={checklist.dateMatch} onChange={e => setChecklist(p => ({ ...p, dateMatch: e.target.checked }))} />
                        Delivery date matches system timestamp
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1E293B', cursor: 'pointer' }}>
                        <input type="checkbox" checked={checklist.notDuplicate} onChange={e => setChecklist(p => ({ ...p, notDuplicate: e.target.checked }))} />
                        Document confirmed not a duplicate scan
                      </label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Button title="Mark Missing POD" variant="secondary" onClick={handleMarkMissing} />
                      <Button title="Confirm & Validate" variant="primary" onClick={handleValidate} disabled={!allChecked} />
                    </div>
                  </div>
                )}

                {activeTab === 'Reject' && (
                  <div style={{ background: '#FEF2F2', padding: '16px', borderRadius: '8px', border: '1px solid #FECACA' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#991B1B', margin: '0 0 12px' }}>Return Waybill for Correction</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991B1B', display: 'block', marginBottom: '4px' }}>Rejection Category *</label>
                        <select value={rejectCategory} onChange={e => setRejectCategory(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#fff', outline: 'none' }}>
                          <option value="">Select Category...</option>
                          <option value="Illegible Signature">Illegible Signature</option>
                          <option value="Incorrect Date">Incorrect Date</option>
                          <option value="Mismatched Consignee">Mismatched Consignee</option>
                          <option value="Blurry Document Scan">Blurry Document Scan</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991B1B', display: 'block', marginBottom: '4px' }}>Specific Correction Notes</label>
                        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Provide instructions for operations..." rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#fff', outline: 'none', resize: 'vertical' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <Button title="Return to Ops" variant="danger" onClick={handleReject} disabled={!rejectCategory} />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Image Modal */}
      {showImageModal && waybill.pod_image_url && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 999999, padding: '24px'
        }} onClick={() => setShowImageModal(false)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowImageModal(false)} style={{
              position: 'absolute', top: '-16px', right: '-16px', background: '#EF4444', color: '#fff',
              border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
            }}>
              <i className="ti ti-x" style={{ fontSize: '20px' }} />
            </button>
            <img src={waybill.pod_image_url} alt="POD Preview" style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '4px' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export const Waybills: React.FC = () => {
  const { user } = useAuth();
  const { id: clientIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const waybillIdParam = searchParams.get('waybillId');
  const navigate = useNavigate();

  const {
    data: initialData,
    isLoading: loading,
    refetch,
  } = useQuery(
    'waybills:list_and_clients',
    async () => {
      const [wbRes, cliRes] = await Promise.all([
        waybillsService.list({ pageSize: 100 }),
        clientsService.list({ pageSize: 100 }),
      ]);
      return {
        waybills: wbRes.items || [],
        clients: cliRes.items || [],
      };
    }
  );

  const [localWaybills, setLocalWaybills] = useState<Waybill[] | null>(null);
  const waybills = localWaybills ?? initialData?.waybills ?? [];
  const clients = initialData?.clients || [];

  const [isRecording, setIsRecording] = useState(false);
  const { toast } = useToast();
  const {
    modalState: dupModalState,
    runPreCheck,
    handleModalCancel,
    handleModalRetry,
    handleProceedWithRemarks,
    handleProceedWithManualReview,
  } = useDuplicatePreCheck();

  const [newWaybill, setNewWaybill] = useState({
    waybillNumber: '',
    deliveryDate: new Date().toISOString().split('T')[0],
    clientCode: '',
    deliveryStatus: 'Completed',
    podFile: null as any
  });

  const updateWaybill = async (id: string, updates: Partial<Waybill>) => {
    try {
      await waybillsService.update(id, updates);
      setLocalWaybills(waybills.map((w: Waybill) => w.id === id ? { ...w, ...updates } : w));
    } catch (e: any) {
      toast.error(e.message || 'Failed to update waybill');
    }
  };

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (canCheckDuplicateInForm(user?.role, 'waybill')) {
        const check = await runPreCheck({
          entityType: 'waybill',
          fieldName: 'waybillNumber',
          fieldValue: newWaybill.waybillNumber,
        });
        if (!check.canProceed) return;
      }

      const payload: Partial<Waybill> = {
        waybillNumber: newWaybill.waybillNumber,
        clientCode: newWaybill.clientCode || clients[0]?.id || '',
        deliveryDate: newWaybill.deliveryDate,
        status: newWaybill.deliveryStatus === 'Completed' ? 'Pending' : 'Missing',
        hasOriginalPOD: false,
        hasApprovedCTC: false,
        encodedBy: user?.fullName || 'System',
        encodedAt: new Date().toISOString(),
      };
      const created = await waybillsService.create(payload as any);
      setLocalWaybills([created, ...waybills]);

      if (newWaybill.deliveryStatus === 'Completed') {
        toast.success(`Waybill ${newWaybill.waybillNumber} successfully recorded for verification.`);
      } else {
        toast.info(`Waybill ${newWaybill.waybillNumber} recorded for support/tracking only.`);
      }

      setNewWaybill({ waybillNumber: '', deliveryDate: new Date().toISOString().split('T')[0], clientCode: clients[0]?.id || '', deliveryStatus: 'Completed', podFile: null });
      setIsRecording(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record waybill');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading waybills..." />;
  }

  // --- View: Level 3 (Waybill Verification Document) ---
  if (waybillIdParam) {
    const wb = waybills.find((w: Waybill) => w.id === waybillIdParam);
    if (!wb) return <div>Waybill not found</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <WaybillDetailCard waybill={wb} onUpdate={updateWaybill} userRole={user?.role} />
      </div>
    );
  }

  // --- View: Level 2 (Client Detail View) ---
  if (clientIdParam) {
    const client = clients.find((c: Client) => c.id === clientIdParam);
    if (!client) return <div>Client not found</div>;

    const clientWaybills = waybills.filter((wb: Waybill) => wb.clientCode === clientIdParam);

    const columns = [
      { key: 'waybillNumber', label: 'WAYBILL NO.', sortable: true },
      { key: 'deliveryDate', label: 'DELIVERY DATE', sortable: true, render: (row: any) => new Date(row.deliveryDate).toLocaleDateString('en-US') },
      { key: 'status', label: 'STATUS', render: (row: any) => <StatusBadge status={row.status} /> }
    ];

    const actions = [
      { label: 'Verify', icon: 'ti-eye', onClick: (row: any) => navigate(`/waybills/${clientIdParam}?waybillId=${row.id}`) }
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        <ClientInfoCard client={{ ...client, region: 'NCR' }} onBack={() => navigate('/waybills')} />

        <Card>
          <div style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#0F172A', fontWeight: 700 }}>Waybill History</h3>
            <DataTable
              data={clientWaybills}
              columns={columns}
              actions={actions}
              rowKey="id"
              searchPlaceholder="Search waybills..."
              searchFields={['waybillNumber', 'status'] as any}
              filters={[{
                key: 'status', label: 'POD Status', options: [
                  { label: 'Missing', value: 'Missing' },
                  { label: 'Pending', value: 'Pending' },
                  { label: 'Validated', value: 'Validated' }
                ],
                filterFn: (row: any, val: string) => row.status === val
              }]}
              emptyMessage="No waybills found for this client."
              columnToggle={true} densityToggle={true} exportable={false}
            />
          </div>
        </Card>
      </div>
    );
  }

  // --- View: Level 1 (List View) ---
  const grouped = new Map<string, Waybill[]>();
  waybills.forEach((wb: Waybill) => {
    if (!grouped.has(wb.clientCode)) grouped.set(wb.clientCode, []);
    grouped.get(wb.clientCode)!.push(wb);
  });

  const listData = Array.from(grouped.entries()).map(([clientId, recs]) => {
    const client = clients.find((c: Client) => c.id === clientId);

    let computedStatus = 'Completed';
    if (recs.some(r => r.status !== 'Validated' && r.status !== 'Validated (CTC)')) {
      computedStatus = 'Pending';
    }

    return {
      id: clientId,
      clientName: client?.name ?? 'Unknown',
      status: computedStatus
    };
  });

  const tableColumns = [
    { key: 'id', label: 'CLIENT ID', sortable: true },
    {
      key: 'clientName', label: 'CLIENT NAME', sortable: true, render: (row: any) => (
        <span onClick={() => navigate(`/waybills/${row.id}`)} style={{ color: '#0F172A', fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}>
          {row.clientName}
        </span>
      )
    },
    { key: 'status', label: 'POD STATUS', render: (row: any) => <StatusBadge status={row.status} /> }
  ];

  const actions = [
    { label: 'View Details', icon: 'ti-eye', onClick: (row: any) => navigate(`/waybills/${row.id}`) }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {isRecording && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 99999, padding: '20px'
        }}>
          <Card style={{ width: '100%', maxWidth: '500px' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>NEW RECORD</h2>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>Record Waybill / POD</h3>
              </div>
              <button onClick={() => setIsRecording(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94A3B8' }}>×</button>
            </div>
            <div style={{ padding: '24px' }}>
              <form onSubmit={handleRecordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Waybill No. *</label>
                  <input required type="text" value={newWaybill.waybillNumber} onChange={e => setNewWaybill(p => ({ ...p, waybillNumber: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontFamily: 'inherit', fontSize: '13.5px' }} />
                </div>
                <CalendarPicker
                  label="Delivery Date"
                  value={newWaybill.deliveryDate}
                  onChange={v => setNewWaybill(p => ({ ...p, deliveryDate: v }))}
                  required={true}
                />
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Client *</label>
                  <select required value={newWaybill.clientCode || (clients[0]?.id ?? '')} onChange={e => setNewWaybill(p => ({ ...p, clientCode: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontFamily: 'inherit', fontSize: '13.5px' }}>
                    {clients.map((c: Client) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Delivery Status *</label>
                  <select required value={newWaybill.deliveryStatus} onChange={e => setNewWaybill(p => ({ ...p, deliveryStatus: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontFamily: 'inherit', fontSize: '13.5px' }}>
                    <option value="Completed">Completed (For Billing)</option>
                    <option value="Not Completed">Not Completed (Support/Tracking only)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Upload POD (Scanned/Photo) {newWaybill.deliveryStatus === 'Completed' ? '*' : '(Optional)'}</label>
                  <input required={newWaybill.deliveryStatus === 'Completed'} type="file" accept="image/*,.pdf" style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px dashed #CBD5E1', background: '#F8FAFC', fontFamily: 'inherit', fontSize: '13.5px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                  <Button variant="secondary" title="Cancel" type="button" onClick={() => setIsRecording(false)} />
                  <Button variant="primary" title="Save Record" type="submit" />
                </div>
              </form>
            </div>
          </Card>
        </div>,
        document.body
      )}

      <TableContainer>
        <DataTable
          title=""
          data={listData}
          columns={tableColumns}
          actions={actions}
          rowKey="id"
          createButtons={[{ label: 'Record Waybill/POD', icon: 'ti-file-plus', onClick: () => setIsRecording(true), variant: 'primary' }]}
          emptyMessage="No waybills found."
          searchPlaceholder="Search clients..."
          searchFields={['clientName']}
          filters={[{
            key: 'status', label: 'POD Status', options: [
              { label: 'Pending', value: 'Pending' },
              { label: 'Completed', value: 'Completed' }
            ],
            filterFn: (row: any, val: string) => row.status === val
          }]}
        />
      </TableContainer>

      <DuplicatePreCheckModal
        state={dupModalState}
        onCancel={handleModalCancel}
        onRetry={handleModalRetry}
        onProceedWithRemarks={handleProceedWithRemarks}
        onProceedWithManualReview={handleProceedWithManualReview}
      />
    </div>
  );
};

export default Waybills;
