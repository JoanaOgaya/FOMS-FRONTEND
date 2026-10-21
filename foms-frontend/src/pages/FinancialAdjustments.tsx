import React, { useState, useMemo } from 'react';
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
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Form State
  const [type, setType] = useState<'Adjustment' | 'Credit Memo'>('Adjustment');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [affectedRecordId, setAffectedRecordId] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showFullImage, setShowFullImage] = useState(false);

  const selectedInvoice = invoices.find(i => i.id === affectedRecordId);
  const selectedInvoiceMax = selectedInvoice 
    ? ((selectedInvoice.balance && selectedInvoice.balance > 0) ? selectedInvoice.balance : selectedInvoice.totalAmount) 
    : 0;

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

    const isCreditMemo = type === 'Credit Memo';
    const maxAllowable = (linkedInvoice.balance && linkedInvoice.balance > 0) 
      ? linkedInvoice.balance 
      : (linkedInvoice.totalAmount > 0 ? linkedInvoice.totalAmount : 0);

    if (isCreditMemo && maxAllowable > 0 && Number(amount) > maxAllowable) {
      toast.error(
        `Credit Memo amount (${formatCurrency(Number(amount))}) cannot exceed the linked invoice balance/total (${formatCurrency(maxAllowable)}).`,
        'Amount Exceeds Invoice'
      );
      return;
    }

    try {
      const newAdjustment = {
        invoiceNo: linkedInvoice.invoiceNumber || linkedInvoice.id,
        affectedRecordId: linkedInvoice.invoiceNumber || linkedInvoice.id,
        adjustmentType: type === 'Credit Memo' ? 'Credit' : 'Debit',
        type,
        amount: Number(amount),
        reason,
        referenceNo: referenceNo || `REF-${Date.now().toString().slice(-4)}`,
        status,
        clientId: linkedInvoice.clientId,
        createdAt: new Date().toISOString(),
        createdBy: user?.fullName || 'Accountant',
      };

      await adjustmentsService.create(newAdjustment);
      try {
        await auditLogsService.create({
          action: 'RECORD_ADJUSTMENT',
          module: 'Financial Adjustments',
          recordId: linkedInvoice.id,
          recordType: 'Adjustment',
          details: `Recorded ${type} for ${formatCurrency(Number(amount))} linked to ${linkedInvoice.id}. Status: ${status}`,
          ipAddress: '127.0.0.1',
        });
      } catch {
        // ignore audit failure
      }

      refetchAdj();
      toast.success(`${type} recorded and submitted for approval.`, 'Success');
      handleCloseModal();
    } catch (err: any) {
      const errorMsg = err?.data?.message || err?.message || 'Failed to submit adjustment.';
      toast.error(errorMsg, 'Submission Error');
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

  const searchedAdjustments = useMemo(() => {
    return filteredAdjustments.filter((adj: FinancialAdjustment) => {
      const q = searchQuery.toLowerCase();
      const matchStatus = !statusFilter || adj.status === statusFilter;
      if (!matchStatus) return false;
      if (!q) return true;
      const inv = invoices.find(i => i.id === adj.affectedRecordId);
      const client = clients.find(c => c.id === adj.clientId);
      return (
        adj.id.toLowerCase().includes(q) ||
        adj.affectedRecordId.toLowerCase().includes(q) ||
        (inv?.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
        (client?.name && client.name.toLowerCase().includes(q)) ||
        adj.reason.toLowerCase().includes(q) ||
        adj.type.toLowerCase().includes(q)
      );
    });
  }, [filteredAdjustments, searchQuery, statusFilter, invoices, clients]);

  const handleExportCardsCSV = () => {
    const headers = ['ID', 'Type', 'Linked Invoice', 'Client', 'Amount', 'Reason', 'Status', 'Date'];
    const rows = searchedAdjustments.map((adj: FinancialAdjustment) => {
      const inv = invoices.find(i => i.id === adj.affectedRecordId);
      const client = clients.find(c => c.id === adj.clientId);
      return [
        adj.id,
        adj.type,
        inv?.invoiceNumber || adj.affectedRecordId,
        `"${(client?.name || adj.clientId).replace(/"/g, '""')}"`,
        adj.amount,
        `"${adj.reason.replace(/"/g, '""')}"`,
        adj.status,
        formatDate(adj.createdAt)
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e: (string | number)[]) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `financial_adjustments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
        {/* Main Card Header with Title and Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              {isReviewer ? 'Financial Validation' : 'Financial Adjustments'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
              {isReviewer ? 'Review and validate adjustment requests.' : 'Create and manage adjustment requests for client accounts.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Cards vs Table View Switcher */}
            <div style={{ display: 'inline-flex', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', background: '#F8FAFC' }}>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'cards' ? '#0D9488' : 'transparent',
                  color: viewMode === 'cards' ? '#FFFFFF' : '#64748B',
                  transition: 'all 0.2s ease',
                }}
              >
                <i className="ti ti-layout-grid" style={{ fontSize: '15px' }} />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'table' ? '#0D9488' : 'transparent',
                  color: viewMode === 'table' ? '#FFFFFF' : '#64748B',
                  transition: 'all 0.2s ease',
                }}
              >
                <i className="ti ti-table" style={{ fontSize: '15px' }} />
                Table
              </button>
            </div>

            {viewMode === 'cards' && (
              <button
                type="button"
                onClick={handleExportCardsCSV}
                style={{
                  background: '#FFFFFF',
                  color: '#0F172A',
                  border: '1px solid #E2E8F0',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                <i className="ti ti-download" /> Export CSV
              </button>
            )}

            {!isReviewer && (
              <Button
                title="New Adjustment / Memo"
                icon="ti-plus"
                variant="primary"
                onClick={handleOpenModal}
              />
            )}
          </div>
        </div>

        {viewMode === 'cards' ? (
          <div>
            {/* Filter Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#0D9488', fontSize: '16px' }} />
                <input
                  type="text"
                  placeholder="Search adjustments by ID, Invoice, or Reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 16px 8px 38px',
                    borderRadius: '9999px',
                    border: '1.5px solid #0D9488',
                    background: '#FFFFFF',
                    fontSize: '0.85rem',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  fontSize: '0.85rem',
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Pending Approval">Pending Approval</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <CalendarPicker 
                  label="From:"
                  value={fromDate} 
                  onChange={setFromDate} 
                  placeholder="Start date..." 
                  variant="toolbar"
                  disableFutureDates={true}
                  maxDate={toDate}
                />
                <CalendarPicker 
                  label="To:"
                  value={toDate} 
                  onChange={setToDate} 
                  placeholder="End date..." 
                  variant="toolbar"
                  disableFutureDates={true}
                  minDate={fromDate}
                />
              </div>

              {(searchQuery || statusFilter || fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    setFromDate('');
                    setToDate('');
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #FCA5A5',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <i className="ti ti-x" /> Clear Filters
                </button>
              )}
            </div>

            {/* Cards Grid */}
            {searchedAdjustments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 20px', color: '#94A3B8' }}>
                <i className="ti ti-receipt-off" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#CBD5E1' }} />
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#334155' }}>No adjustments found</div>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>No adjustment or credit memo records match your filter criteria.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {searchedAdjustments.map((row: FinancialAdjustment) => {
                  const inv = invoices.find(i => i.id === row.affectedRecordId);
                  const client = clients.find(c => c.id === row.clientId);
                  return (
                    <div
                      key={row.id}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '16px',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '16px',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 12px 24px -6px rgba(0, 0, 0, 0.08)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.02)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* Top: ID, Type Pill, Status Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.85rem', color: '#0F172A', background: '#F1F5F9', padding: '3px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                            {row.id}
                          </span>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '20px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: row.type === 'Credit Memo' ? '#F3E8FF' : '#EFF6FF',
                            color: row.type === 'Credit Memo' ? '#6B21A8' : '#1E40AF',
                          }}>
                            {row.type}
                          </span>
                        </div>
                        <StatusBadge status={row.status} />
                      </div>

                      {/* Client & Linked Invoice */}
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                          {client?.name || row.clientId}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>
                          <i className="ti ti-file-invoice" style={{ fontSize: '14px' }} />
                          <span>Invoice: {inv?.invoiceNumber || row.affectedRecordId}</span>
                          <span>•</span>
                          <span>{formatDate(row.createdAt)}</span>
                        </div>
                      </div>

                      {/* Amount & Reason Box */}
                      <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px', border: '1px solid #F1F5F9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>ADJUSTMENT AMOUNT</span>
                          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0D9488' }}>{formatCurrency(row.amount)}</span>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#475569', fontStyle: 'italic', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                          {row.reason}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setViewRecordId(row.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            background: '#FFFFFF',
                            color: '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="ti ti-eye" style={{ fontSize: '14px' }} />
                          View
                        </button>
                        {isReviewer && row.status === 'Pending Approval' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApprove(row)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 12px',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                borderRadius: '8px',
                                border: 'none',
                                background: '#059669',
                                color: '#FFFFFF',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="ti ti-check" /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(row)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 12px',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                borderRadius: '8px',
                                border: 'none',
                                background: '#DC2626',
                                color: '#FFFFFF',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="ti ti-close" /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <DataTable
            title=""
            exportable={true}
            data={filteredAdjustments}
            columns={columns}
            actions={actions}
            rowKey="id"
            searchPlaceholder="Search adjustments by ID, Invoice, or Reason..."
            searchFields={['id', 'affectedRecordId', 'reason']}
            customFilters={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CalendarPicker 
                  label="From:"
                  value={fromDate} 
                  onChange={setFromDate} 
                  placeholder="Start date..." 
                  variant="toolbar"
                  disableFutureDates={true}
                  maxDate={toDate}
                />
                <CalendarPicker 
                  label="To:"
                  value={toDate} 
                  onChange={setToDate} 
                  placeholder="End date..." 
                  variant="toolbar"
                  disableFutureDates={true}
                  minDate={fromDate}
                />
              </div>
            }
          />
        )}
      </TableContainer>

      {/* New Adjustment Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
            boxSizing: 'border-box',
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '580px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#F0FDFA',
                    color: '#0D9488',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}
                >
                  <i className="ti ti-plus" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                    New Financial Request
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                    Record a credit memo or billing adjustment linked to an invoice
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#F1F5F9',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748B',
                  fontSize: '18px',
                }}
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                  Request Type
                </label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '0.9rem',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="Adjustment">Debit Adjustment (Additional Charge / Dagdag Singil)</option>
                  <option value="Credit Memo">Credit Memo (Deduction, Refund or Discount / Bawas Singil)</option>
                </select>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                  {type === 'Adjustment'
                    ? 'ℹ️ Increases the client’s balance for extra charges or missed fees (no maximum limit).'
                    : 'ℹ️ Deducts from client’s balance or issues a refund (cannot exceed invoice total).'}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                  Linked Invoice <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <select
                  value={affectedRecordId}
                  onChange={e => setAffectedRecordId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '0.9rem',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Invoice...</option>
                  {invoices.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.invoiceNumber} — {clients.find(c => c.id === i.clientId)?.name || i.clientId}
                    </option>
                  ))}
                </select>

                {/* Selected Invoice Details Info Card */}
                {selectedInvoice && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '10px 14px',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div>
                      <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 700 }}>INVOICE TOTAL</div>
                      <div style={{ fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                        {formatCurrency(selectedInvoice.totalAmount)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 700 }}>BALANCE</div>
                      <div style={{ fontWeight: 800, color: '#0D9488', marginTop: '2px' }}>
                        {formatCurrency(selectedInvoice.balance ?? selectedInvoice.totalAmount)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 700 }}>STATUS</div>
                      <div style={{ marginTop: '2px' }}>
                        <StatusBadge status={selectedInvoice.paymentStatus || selectedInvoice.status} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                    Amount (₱) <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        setAmount('');
                        return;
                      }
                      // Remove leading zeros like "05" -> "5", while keeping decimals like "0.5"
                      const sanitized = val.replace(/^0+(?=[1-9])/, '');
                      setAmount(sanitized);
                    }}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1.5px solid ${type === 'Credit Memo' && selectedInvoice && amount && Number(amount) > selectedInvoiceMax ? '#EF4444' : '#CBD5E1'}`,
                      background: '#FFFFFF',
                      fontSize: '0.9rem',
                      color: '#0F172A',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {selectedInvoice && type === 'Credit Memo' && (
                    <div
                      style={{
                        fontSize: '0.72rem',
                        marginTop: '4px',
                        fontWeight: 600,
                        color: amount && Number(amount) > selectedInvoiceMax ? '#DC2626' : '#64748B',
                      }}
                    >
                      {amount && Number(amount) > selectedInvoiceMax
                        ? `⚠️ Exceeds invoice maximum of ${formatCurrency(selectedInvoiceMax)}`
                        : `Max credit allowable: ${formatCurrency(selectedInvoiceMax)} (Invoice Balance)`}
                    </div>
                  )}
                  {type === 'Adjustment' && (
                    <div
                      style={{
                        fontSize: '0.72rem',
                        marginTop: '4px',
                        fontWeight: 500,
                        color: '#64748B',
                      }}
                    >
                      Enter custom amount to charge client (no limit).
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                    Reference No.
                  </label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={e => setReferenceNo(e.target.value)}
                    placeholder="e.g. CM-REF-001"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1.5px solid #CBD5E1',
                      background: '#FFFFFF',
                      fontSize: '0.9rem',
                      color: '#0F172A',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                  Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Describe the reason for adjustment or credit memo..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '0.9rem',
                    color: '#0F172A',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    lineHeight: 1.5,
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #E2E8F0',
                background: '#FFFFFF',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              }}
            >
              <Button title="Cancel" variant="secondary" onClick={handleCloseModal} />
              <Button title="Submit for Approval" variant="primary" onClick={() => handleSubmit('Pending Approval')} />
            </div>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {viewRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
            boxSizing: 'border-box',
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#F0FDFA',
                    color: '#0D9488',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}
                >
                  <i className="ti ti-file-text" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                    {viewRecord.type} Details
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                    Record Reference: {viewRecord.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#F1F5F9',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748B',
                  fontSize: '18px',
                }}
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>RECORD ID</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', marginTop: '2px', fontFamily: 'monospace' }}>
                    {viewRecord.id}
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', marginBottom: '4px' }}>STATUS</div>
                  <StatusBadge status={viewRecord.status} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>LINKED INVOICE</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                    {invoices.find(i => i.id === viewRecord.affectedRecordId)?.invoiceNumber || viewRecord.affectedRecordId}
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>AMOUNT</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0D9488', marginTop: '2px' }}>
                    {formatCurrency(viewRecord.amount)}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', marginBottom: '4px', letterSpacing: '0.04em' }}>REFERENCE NO.</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A', background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  {viewRecord.referenceNo || 'N/A'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', marginBottom: '4px', letterSpacing: '0.04em' }}>
                  REASON / JUSTIFICATION (SUBMITTED BY ACCOUNTANT)
                </div>
                <div style={{ fontSize: '0.9rem', color: '#1E293B', background: '#F8FAFC', padding: '12px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', lineHeight: 1.5 }}>
                  {viewRecord.reason}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Submitted by: <strong style={{ color: '#0F172A' }}>{viewRecord.createdBy || 'Accountant'}</strong></span>
                  <span>Submitted on: {formatDate(viewRecord.createdAt)}</span>
                </div>
              </div>

              {(viewRecord.status === 'ReturnedForRevision' || viewRecord.status === 'Returned') && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '12px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#991B1B' }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: '18px', color: '#DC2626', flexShrink: 0 }} />
                  <span>
                    <strong>Returned for Revision:</strong> {(viewRecord as any).rejectionReason || viewRecord.notes || 'Please update and resubmit.'}
                  </span>
                </div>
              )}

              {(viewRecord.status === 'Pending Approval' || viewRecord.status === 'Submitted' || viewRecord.status === 'PendingFinanceManager') && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '10px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#B45309' }}>
                  <i className="ti ti-clock-hour-4" style={{ fontSize: '16px', flexShrink: 0 }} />
                  <span>Awaiting review and approval by Assistant FM / Finance Manager. Record is read-only.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #E2E8F0',
                background: '#FFFFFF',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              }}
            >
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
