import React, { useState } from 'react';
import { useQuery } from '../hooks/useQuery';
import { adjustmentsService } from '../services/adjustmentsService';
import { invoicesService } from '../services/invoicesService';
import { arService } from '../services/arService';
import { cashFlowService } from '../services/cashFlowService';
import { clientsService } from '../services/clientsService';
import { auditLogsService } from '../services/auditLogsService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { DataTable } from '../components/DataTable';
import { TableContainer } from '../components/TableContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Buttons';
import { StatusBadge } from '../components/shared/StatusBadge';
import { CalendarPicker } from '../components/FormModals';
import { formatCurrency, formatDate } from '../utils/format';
import type { FinancialAdjustment, Invoice, ARRecord, Client } from '../types/entities';
import '../components/FormModals.css';

export default function FinancialAdjustments() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: adjData, refetch: refetchAdj } = useQuery('adj:list', () => adjustmentsService.list({ pageSize: 100 }));
  const { data: invData } = useQuery('adj:invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: arData } = useQuery('adj:ar', () => arService.records({ pageSize: 100 }));
  const { data: clientData } = useQuery('adj:clients', () => clientsService.list({ pageSize: 100 }));

  const financialAdjustments: FinancialAdjustment[] = adjData?.items || [];
  const invoices: Invoice[] = invData?.items || [];
  const arRecords: ARRecord[] = arData?.items || [];
  const clients: Client[] = clientData?.items || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewRecordId, setViewRecordId] = useState<string | null>(null);
  
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Form State
  const [type, setType] = useState<'Adjustment' | 'Credit Memo'>('Adjustment');
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [affectedRecordId, setAffectedRecordId] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showFullImage, setShowFullImage] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setType('Adjustment');
    setAmount('');
    setReason('');
    setReferenceNo('');
    setAffectedRecordId('');
    setPreviewImage(null);
    setShowFullImage(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setViewRecordId(null);
  };

  const handleSubmit = async (status: 'Draft' | 'Pending Approval' | 'Approved') => {
    if (!amount || Number(amount) <= 0) {
      toast.error('Amount must be greater than zero.', 'Validation Error');
      return;
    }
    if (!reason.trim()) {
      toast.error('Reason is required.', 'Validation Error');
      return;
    }
    if (!affectedRecordId) {
      toast.error('An affected finance record (e.g., Invoice) must be linked.', 'Missing Link');
      return;
    }

    const linkedInvoice = invoices.find(i => i.id === affectedRecordId);
    if (!linkedInvoice) {
      toast.error('The selected record could not be found.', 'Invalid Link');
      return;
    }

    try {
      const newAdjustment: Omit<FinancialAdjustment, 'id'> = {
        type,
        amount: Number(amount),
        reason,
        referenceNo: referenceNo || 'N/A',
        status,
        affectedRecordId: linkedInvoice.id,
        clientId: linkedInvoice.clientId,
        createdAt: new Date().toISOString(),
        createdBy: user?.fullName || 'User',
      };

      await adjustmentsService.create(newAdjustment);
      await auditLogsService.create({
        action: 'RECORD_ADJUSTMENT',
        module: 'Financial Adjustments',
        recordId: linkedInvoice.id,
        recordType: 'Adjustment',
        details: `Recorded ${type} for ${formatCurrency(Number(amount))} linked to ${linkedInvoice.id}. Status: ${status}`,
        ipAddress: '127.0.0.1',
      });

      refetchAdj();
      toast.success(`${type} recorded successfully.`, 'Success');
      handleCloseModal();
    } catch {
      toast.error('Failed to submit adjustment.');
    }
  };

  const handleApprove = async (adj: FinancialAdjustment) => {
    try {
      await adjustmentsService.act(adj.id, 'approve');
      
      const linkedInvoice = invoices.find(i => i.id === adj.affectedRecordId);
      if (linkedInvoice) {
        const ar = arRecords.find(a => a.invoiceId === linkedInvoice.id);
        const isPaid = linkedInvoice.status === 'Paid' || (ar && ar.paidAmount >= ar.originalAmount);

        if (isPaid) {
          await cashFlowService.create({
            type: 'Outflow',
            amount: adj.amount,
            sourceReference: `Refund (Credit Memo: ${adj.id}) - Client: ${adj.clientId}`,
            date: new Date().toISOString(),
            recordedBy: user?.fullName || 'System',
          });
          toast.success(`Approved! Invoice was already paid. A Refund (Cash Outflow) was automatically recorded.`, 'Refund Triggered');
        } else {
          toast.success(`Approved! AR outstanding balance was automatically reduced.`, 'Approved');
        }
      } else {
        toast.success(`${adj.type} approved successfully.`, 'Approved');
      }

      await auditLogsService.create({
        action: 'APPROVE_ADJUSTMENT',
        module: 'Financial Adjustments',
        recordId: adj.id,
        recordType: 'Adjustment',
        details: `Approved ${adj.type} ${adj.id}`,
        ipAddress: '127.0.0.1',
      });
      refetchAdj();
    } catch {
      toast.error('Failed to approve adjustment.');
    }
  };

  const handleReject = async (adj: FinancialAdjustment) => {
    try {
      await adjustmentsService.act(adj.id, 'reject');
      await auditLogsService.create({
        action: 'REJECT_ADJUSTMENT',
        module: 'Financial Adjustments',
        recordId: adj.id,
        recordType: 'Adjustment',
        details: `Rejected ${adj.type} ${adj.id}`,
        ipAddress: '127.0.0.1',
      });
      refetchAdj();
      toast.error(`${adj.type} rejected.`, 'Rejected');
    } catch {
      toast.error('Failed to reject adjustment.');
    }
  };

  const viewRecord = financialAdjustments.find(a => a.id === viewRecordId);

  const filteredAdjustments = financialAdjustments.filter(a => {
    const aDate = new Date(a.createdAt);
    if (fromDate && aDate < new Date(fromDate)) return false;
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      if (aDate > to) return false;
    }
    return true;
  });

  const totalAdjustments = filteredAdjustments.filter(a => a.type === 'Adjustment').reduce((sum, a) => sum + a.amount, 0);
  const totalCreditMemos = filteredAdjustments.filter(a => a.type === 'Credit Memo').reduce((sum, a) => sum + a.amount, 0);
  const pendingCount = filteredAdjustments.filter(a => a.status === 'Pending Approval').length;

  const isReviewer = user?.role === 'FINANCIAL_MANAGER' || user?.role === 'HEAD_ACCOUNTANT';

  const columns = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'type', label: 'TYPE', sortable: true },
    {
      key: 'affectedRecordId',
      label: 'LINKED INVOICE',
      sortable: true,
      render: (row: FinancialAdjustment) => {
        const inv = invoices.find(i => i.id === row.affectedRecordId);
        return inv ? `${inv.invoiceNumber} (${row.affectedRecordId})` : row.affectedRecordId;
      }
    },
    {
      key: 'clientId',
      label: 'CLIENT',
      sortable: true,
      render: (row: FinancialAdjustment) => clients.find(c => c.id === row.clientId)?.name || row.clientId,
    },
    {
      key: 'amount',
      label: 'AMOUNT',
      sortable: true,
      render: (row: FinancialAdjustment) => formatCurrency(row.amount),
    },
    { key: 'reason', label: 'REASON' },
    {
      key: 'status',
      label: 'STATUS',
      sortable: true,
      render: (row: FinancialAdjustment) => <StatusBadge status={row.status} />
    },
    {
      key: 'createdAt',
      label: 'DATE',
      sortable: true,
      render: (row: FinancialAdjustment) => formatDate(row.createdAt),
    }
  ];

  const actions = [
    {
      label: 'View',
      icon: 'ti-eye',
      onClick: (row: FinancialAdjustment) => setViewRecordId(row.id),
    },
    ...(isReviewer ? [
      {
        label: 'Approve',
        icon: 'ti-check',
        onClick: (row: FinancialAdjustment) => handleApprove(row),
      },
      {
        label: 'Reject',
        icon: 'ti-close',
        onClick: (row: FinancialAdjustment) => handleReject(row),
      }
    ] : [])
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Card style={{ padding: '20px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#0D9488', letterSpacing: '0.06em' }}>TOTAL ADJUSTMENTS</p>
          <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{formatCurrency(totalAdjustments)}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>Adjustments</p>
        </Card>
        <Card style={{ padding: '20px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#7C3AED', letterSpacing: '0.06em' }}>CREDIT MEMOS</p>
          <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{formatCurrency(totalCreditMemos)}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>Credit Memos</p>
        </Card>
        <Card style={{ padding: '20px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#F59E0B', letterSpacing: '0.06em' }}>PENDING APPROVAL</p>
          <p style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{pendingCount}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>Awaiting decision</p>
        </Card>
        <Card style={{ padding: '20px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.06em' }}>TOTAL REQUESTS</p>
          <p style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{filteredAdjustments.length}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>All time</p>
        </Card>
      </div>

      <TableContainer>
        <DataTable
          title={isReviewer ? 'Financial Validation' : 'Financial Adjustments'}
          exportable={true}
          createButtons={isReviewer ? undefined : [
            {
              label: 'New Adjustment / Memo',
              icon: 'ti-plus',
              onClick: handleOpenModal
            }
          ]}
          data={filteredAdjustments}
          columns={columns}
          actions={actions}
          rowKey="id"
          searchPlaceholder="Search adjustments by ID, Invoice, or Reason..."
          searchFields={['id', 'affectedRecordId', 'reason']}
          customFilters={
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>From:</span>
                <div style={{ width: '140px' }}>
                  <CalendarPicker 
                    label=""
                    value={fromDate} 
                    onChange={setFromDate} 
                    placeholder="Start date..." 
                    variant="filter"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>To:</span>
                <div style={{ width: '140px' }}>
                  <CalendarPicker 
                    label=""
                    value={toDate} 
                    onChange={setToDate} 
                    placeholder="End date..." 
                    variant="filter"
                  />
                </div>
              </div>
            </div>
          }
        />
      </TableContainer>

      {/* New Adjustment Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '600px' }}>
            <div className="modal-hd">
              <h2 className="modal-title">New Financial Request</h2>
              <button className="modal-close-btn" onClick={handleCloseModal}>&times;</button>
            </div>
            <div className="modal-bd">
              <div className="tf-group state-default" style={{ marginBottom: 16 }}>
                <label className="tf-label">Request Type</label>
                <div className="tf-wrapper">
                  <select className="tf-input" value={type} onChange={e => setType(e.target.value as any)}>
                    <option value="Adjustment">Adjustment</option>
                    <option value="Credit Memo">Credit Memo</option>
                  </select>
                </div>
              </div>

              <div className="tf-group state-default" style={{ marginBottom: 16 }}>
                <label className="tf-label">Linked Invoice <span style={{ color: 'red' }}>*</span></label>
                <div className="tf-wrapper">
                  <select className="tf-input" value={affectedRecordId} onChange={e => setAffectedRecordId(e.target.value)}>
                    <option value="">Select Invoice...</option>
                    {invoices.map(i => (
                      <option key={i.id} value={i.id}>{i.invoiceNumber} — {clients.find(c => c.id === i.clientId)?.name || i.clientId} ({formatCurrency(i.totalAmount)})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="tf-group state-default" style={{ marginBottom: 16 }}>
                <label className="tf-label">Amount (₱) <span style={{ color: 'red' }}>*</span></label>
                <div className="tf-wrapper">
                  <input type="number" className="tf-input" value={amount} onChange={e => setAmount(Number(e.target.value))} placeholder="0.00" />
                </div>
              </div>

              <div className="tf-group state-default" style={{ marginBottom: 16 }}>
                <label className="tf-label">Reference No.</label>
                <div className="tf-wrapper">
                  <input type="text" className="tf-input" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="e.g. CM-REF-001" />
                </div>
              </div>

              <div className="tf-group state-default" style={{ marginBottom: 16 }}>
                <label className="tf-label">Reason <span style={{ color: 'red' }}>*</span></label>
                <div className="tf-wrapper tf-textarea-wrapper">
                  <textarea className="tf-textarea" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for adjustment..." />
                </div>
              </div>
            </div>

            <div className="modal-ft" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button title="Cancel" variant="secondary" onClick={handleCloseModal} />
              <Button title="Submit for Approval" variant="primary" onClick={() => handleSubmit('Pending Approval')} />
            </div>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {viewRecord && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '600px' }}>
            <div className="modal-hd">
              <h2 className="modal-title">{viewRecord.type} Details</h2>
              <button className="modal-close-btn" onClick={handleCloseModal}>&times;</button>
            </div>
            <div className="modal-bd">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Record ID</label>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{viewRecord.id}</div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Status</label>
                  <div><StatusBadge status={viewRecord.status} /></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Linked Invoice</label>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{viewRecord.affectedRecordId}</div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Amount</label>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#15803D' }}>{formatCurrency(viewRecord.amount)}</div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Reference No.</label>
                <div style={{ fontSize: '13px', padding: '10px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0' }}>{viewRecord.referenceNo || 'N/A'}</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Reason</label>
                <div style={{ fontSize: '13px', padding: '10px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0' }}>{viewRecord.reason}</div>
              </div>
            </div>

            <div className="modal-ft" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              {viewRecord.status === 'Pending Approval' && isReviewer && (
                <>
                  <Button title="Reject" variant="secondary" icon="ti-close" onClick={() => { handleReject(viewRecord); handleCloseModal(); }} />
                  <Button title="Approve" variant="primary" icon="ti-check" onClick={() => { handleApprove(viewRecord); handleCloseModal(); }} />
                </>
              )}
              <Button title="Close" variant="secondary" onClick={handleCloseModal} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
