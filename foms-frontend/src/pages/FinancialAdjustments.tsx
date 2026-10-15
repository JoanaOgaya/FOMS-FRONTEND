import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useQuery } from '../hooks/useQuery';
import { adjustmentsService } from '../services/adjustmentsService';
import { invoicesService } from '../services/invoicesService';
import { arService } from '../services/arService';
import { cashFlowService } from '../services/cashFlowService';
import { clientsService } from '../services/clientsService';
import { auditLogsService } from '../services/auditLogsService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { Card } from '../components/Card';
import { KpiCard } from '../components/shared/KpiCard';
import { Button } from '../components/Buttons';
import { StatusBadge } from '../components/shared/StatusBadge';
import { CalendarPicker } from '../components/FormModals';
import { formatCurrency, formatDate } from '../utils/format';
import { invalidateForMutation } from '../services/invalidation';
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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Form State
  const [type, setType] = useState<'Adjustment' | 'Credit Memo'>('Adjustment');
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [affectedRecordId, setAffectedRecordId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setType('Adjustment');
    setAmount('');
    setReason('');
    setReferenceNo('');
    setAffectedRecordId('');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setViewRecordId(null);
  };

  const handleSubmit = async (status: 'Draft' | 'Pending Approval' | 'Approved') => {
    if (submitting) return;
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

    setSubmitting(true);
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

      await invalidateForMutation('recordAdjustment');
      toast.success(`${type} recorded successfully.`, 'Success');
      handleCloseModal();
    } catch {
      toast.error('Failed to submit adjustment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (adj: FinancialAdjustment) => {
    if (submitting) return;
    setSubmitting(true);
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
      await invalidateForMutation('approveAdjustment');
    } catch {
      toast.error('Failed to approve adjustment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (adj: FinancialAdjustment) => {
    if (submitting) return;
    setSubmitting(true);
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
      await invalidateForMutation('rejectAdjustment');
      toast.error(`${adj.type} rejected.`, 'Rejected');
    } catch {
      toast.error('Failed to reject adjustment.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAdjustments = useMemo(() => {
    return financialAdjustments.filter(a => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inv = invoices.find(i => i.id === a.affectedRecordId);
        const client = clients.find(c => c.id === a.clientId)?.name || '';
        const match = 
          (a.id || '').toLowerCase().includes(q) ||
          (a.affectedRecordId || '').toLowerCase().includes(q) ||
          (inv?.invoiceNumber || '').toLowerCase().includes(q) ||
          client.toLowerCase().includes(q) ||
          (a.reason || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statusFilter && a.status !== statusFilter) return false;
      if (typeFilter && a.type !== typeFilter) return false;

      const aDate = new Date(a.createdAt);
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        if (aDate < from) return false;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (aDate > to) return false;
      }
      return true;
    });
  }, [financialAdjustments, searchQuery, statusFilter, typeFilter, fromDate, toDate, invoices, clients]);

  const totalAdjustments = filteredAdjustments.filter(a => a.type === 'Adjustment').reduce((sum, a) => sum + a.amount, 0);
  const totalCreditMemos = filteredAdjustments.filter(a => a.type === 'Credit Memo').reduce((sum, a) => sum + a.amount, 0);
  const pendingCount = filteredAdjustments.filter(a => a.status === 'Pending Approval').length;

  const isReviewer = user?.role === 'FINANCIAL_MANAGER' || user?.role === 'HEAD_ACCOUNTANT';
  const viewRecord = financialAdjustments.find(a => a.id === viewRecordId);

  // ── CSV & PDF Export ──────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (filteredAdjustments.length === 0) {
      toast.error('No adjustment records to export.');
      return;
    }
    const headers = ['ID', 'Type', 'Linked Invoice', 'Client', 'Amount', 'Reason', 'Status', 'Date'];
    const rows = filteredAdjustments.map(a => {
      const inv = invoices.find(i => i.id === a.affectedRecordId);
      const client = clients.find(c => c.id === a.clientId)?.name || a.clientId;
      return [
        a.id,
        a.type,
        inv ? `${inv.invoiceNumber} (${a.affectedRecordId})` : a.affectedRecordId,
        client,
        a.amount,
        `"${(a.reason || '').replace(/"/g, '""')}"`,
        a.status,
        formatDate(a.createdAt)
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `financial_adjustments_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredAdjustments.length} records to CSV.`);
  };

  const handleExportPDF = () => {
    if (filteredAdjustments.length === 0) {
      toast.error('No adjustment records to export.');
      return;
    }
    const doc = new jsPDF();
    const tableColumn = ['ID', 'Type', 'Linked Invoice', 'Client', 'Amount', 'Reason', 'Status', 'Date'];
    const tableRows = filteredAdjustments.map(a => {
      const inv = invoices.find(i => i.id === a.affectedRecordId);
      const client = clients.find(c => c.id === a.clientId)?.name || a.clientId;
      return [
        a.id,
        a.type,
        inv ? inv.invoiceNumber : a.affectedRecordId,
        client,
        formatCurrency(a.amount),
        a.reason || '',
        a.status,
        formatDate(a.createdAt)
      ];
    });

    doc.text('Financial Adjustments & Credit Memos', 14, 15);
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    });
    
    doc.save(`financial_adjustments_${Date.now()}.pdf`);
    toast.success(`Exported ${filteredAdjustments.length} records to PDF.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Stats Cards */}
      <div className="kpi-grid">
        <KpiCard label="Total Adjustments" value={formatCurrency(totalAdjustments)} icon="ti-adjustments" variant="teal" description="Adjustments" hideTrend />
        <KpiCard label="Credit Memos" value={formatCurrency(totalCreditMemos)} icon="ti-receipt-refund" variant="new" description="Credit Memos" hideTrend />
        <KpiCard label="Pending Approval" value={pendingCount} icon="ti-clock" variant="warning" description="Awaiting decision" hideTrend />
        <KpiCard label="Total Requests" value={filteredAdjustments.length} icon="ti-file-description" variant="info" description="All time" hideTrend />
      </div>

      {/* Main Content Area */}
      <Card style={{ padding: '24px' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: 280 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: 16 }} />
              <input 
                type="text" 
                placeholder="Search adjustments by ID, client, reason..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: '9px 16px 9px 40px', borderRadius: 28, border: '1px solid #E2E8F0', fontSize: 13, width: '100%', outline: 'none', background: '#F8FAFC', color: '#1E293B', boxSizing: 'border-box' }}
                onFocus={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#0D9488'; }}
                onBlur={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
              />
            </div>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#F8FAFC', cursor: 'pointer' }}
            >
              <option value="">All Types</option>
              <option value="Adjustment">Adjustment</option>
              <option value="Credit Memo">Credit Memo</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#F8FAFC', cursor: 'pointer' }}
            >
              <option value="">All Statuses</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>

            {/* Date Range Pickers */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <CalendarPicker
                label="From:"
                placeholder="Start date..."
                value={fromDate}
                onChange={setFromDate}
                variant="toolbar"
              />
              <CalendarPicker
                label="To:"
                placeholder="End date..."
                value={toDate}
                onChange={setToDate}
                minDate={fromDate}
                variant="toolbar"
              />
            </div>
          </div>

          {/* Action Buttons: Export & New Request */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={handleExportCSV}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: '#fff',
                color: '#334155',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <i className="ti ti-download" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#0D9488',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 4px rgba(13,148,136,0.25)',
                transition: 'background 0.2s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#0F766E'}
              onMouseLeave={e => e.currentTarget.style.background = '#0D9488'}
            >
              <i className="ti ti-file-text" />
              Export Formal PDF
            </button>

            {!isReviewer && (
              <button
                type="button"
                onClick={handleOpenModal}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#0F172A',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1E293B'}
                onMouseLeave={e => e.currentTarget.style.background = '#0F172A'}
              >
                <i className="ti ti-plus" />
                New Adjustment / Memo
              </button>
            )}
          </div>
        </div>

        {/* Count Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748B' }}>
            Showing <strong style={{ color: '#0F172A' }}>{filteredAdjustments.length}</strong> adjustment request{filteredAdjustments.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Cards Grid */}
        {filteredAdjustments.length === 0 ? (
          <div style={{
            background: '#F8FAFC',
            borderRadius: 12,
            border: '1px solid #E2E8F0',
            padding: '48px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 24 }}>
              <i className="ti ti-adjustments-off" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>No adjustments found</div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
              No adjustments match the active filter or search criteria.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
            {filteredAdjustments.map((adj: FinancialAdjustment) => {
              const isCreditMemo = adj.type === 'Credit Memo';
              const isPending = adj.status === 'Pending Approval';
              const inv = invoices.find(i => i.id === adj.affectedRecordId);
              const client = clients.find(c => c.id === adj.clientId);
              const clientName = client?.name || adj.clientId;

              return (
                <div
                  key={adj.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 22,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px -4px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                  }}
                >
                  {/* Top Row: Type Pill + Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: isCreditMemo ? '#F5F3FF' : '#F0FDFA',
                      color: isCreditMemo ? '#7C3AED' : '#0D9488',
                      border: `1px solid ${isCreditMemo ? '#DDD6FE' : '#CCFBF1'}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <i className={`ti ${isCreditMemo ? 'ti-file-percent' : 'ti-adjustments'}`} />
                      {adj.type}
                    </span>
                    <StatusBadge status={adj.status} />
                  </div>

                  {/* Client & Linked Invoice */}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#0F172A', lineHeight: 1.3 }}>
                      {clientName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <i className="ti ti-file-invoice" style={{ fontSize: 13, color: '#64748B' }} />
                        {inv?.invoiceNumber || adj.affectedRecordId}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>
                        ID: #{adj.id}
                      </span>
                    </div>
                  </div>

                  {/* Amount Highlight Box */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: isCreditMemo ? '#FAF5FF' : '#F0FDFA',
                    border: `1px solid ${isCreditMemo ? '#E9D5FF' : '#99F6E4'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: isCreditMemo ? '#7E22CE' : '#0F766E', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        {isCreditMemo ? 'CREDIT MEMO AMOUNT' : 'ADJUSTMENT AMOUNT'}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: isCreditMemo ? '#6B21A8' : '#0D9488', marginTop: 2 }}>
                        {formatCurrency(adj.amount)}
                      </div>
                    </div>
                    {adj.referenceNo && adj.referenceNo !== 'N/A' && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: '#fff',
                          color: '#64748B',
                          border: '1px solid #E2E8F0',
                          fontSize: 11,
                          fontWeight: 700
                        }}>
                          Ref: {adj.referenceNo}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Reason Box */}
                  <div style={{
                    padding: '10px 14px',
                    background: '#F8FAFC',
                    borderRadius: 8,
                    border: '1px solid #F1F5F9'
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>REASON / JUSTIFICATION</div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: '#334155', marginTop: 4, lineHeight: 1.4 }}>
                      {adj.reason}
                    </div>
                  </div>

                  {/* Meta Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                    padding: '8px 12px',
                    background: '#F8FAFC',
                    borderRadius: 8,
                    border: '1px solid #F1F5F9',
                    fontSize: 12
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>REQUESTED BY</div>
                      <div style={{ fontWeight: 600, color: '#0F172A', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {adj.createdBy || 'User'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>DATE</div>
                      <div style={{ fontWeight: 600, color: '#0F172A', marginTop: 2 }}>
                        {formatDate(adj.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                    {isReviewer && isPending ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleApprove(adj)}
                          style={{
                            flex: 1,
                            padding: '9px 12px',
                            background: submitting ? '#94A3B8' : '#0D9488',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 12.5,
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            boxShadow: '0 2px 4px rgba(13,148,136,0.25)',
                            transition: 'background 0.2s ease'
                          }}
                          onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = '#0F766E'; }}
                          onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = '#0D9488'; }}
                        >
                          <i className="ti ti-check" />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleReject(adj)}
                          style={{
                            flex: 1,
                            padding: '9px 12px',
                            background: '#fff',
                            color: submitting ? '#94A3B8' : '#DC2626',
                            border: `1px solid ${submitting ? '#CBD5E1' : '#FCA5A5'}`,
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 12.5,
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            transition: 'background 0.2s ease'
                          }}
                          onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = '#FEF2F2'; }}
                          onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = '#fff'; }}
                        >
                          <i className="ti ti-x" />
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewRecordId(adj.id)}
                          title="View Details"
                          style={{
                            padding: '9px 12px',
                            background: '#F1F5F9',
                            color: '#475569',
                            border: '1px solid #E2E8F0',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 14,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'}
                          onMouseLeave={e => e.currentTarget.style.background = '#F1F5F9'}
                        >
                          <i className="ti ti-eye" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setViewRecordId(adj.id)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          background: '#0F172A',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#1E293B'}
                        onMouseLeave={e => e.currentTarget.style.background = '#0F172A'}
                      >
                        <i className="ti ti-eye" />
                        View Details
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* New Adjustment Modal */}
      {isModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20
          }}
          onClick={handleCloseModal}
        >
          <div 
            style={{ 
              background: 'white', 
              borderRadius: 12, 
              width: '100%', 
              maxWidth: 500, 
              maxHeight: '85vh', 
              overflowY: 'auto', 
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              padding: 24
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                  New Financial Request
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                  Submit an adjustment or credit memo linked to an invoice.
                </p>
              </div>
              <button 
                onClick={handleCloseModal}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                    Request Type
                  </label>
                  <select 
                    value={type} 
                    onChange={e => setType(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, color: '#0F172A', outline: 'none', background: '#fff' }}
                  >
                    <option value="Adjustment">Adjustment</option>
                    <option value="Credit Memo">Credit Memo</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                    Reference No.
                  </label>
                  <input 
                    type="text" 
                    value={referenceNo} 
                    onChange={e => setReferenceNo(e.target.value)} 
                    placeholder="e.g. CM-REF-001" 
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, color: '#0F172A', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                  Linked Invoice <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <select 
                  value={affectedRecordId} 
                  onChange={e => setAffectedRecordId(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, color: '#0F172A', outline: 'none', background: '#fff' }}
                >
                  <option value="">Select Invoice...</option>
                  {invoices.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.invoiceNumber} — {clients.find(c => c.id === i.clientId)?.name || i.clientId} ({formatCurrency(i.totalAmount)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                  Amount (₱) <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={e => setAmount(Number(e.target.value))} 
                  placeholder="0.00" 
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14, fontWeight: 700, color: '#0F172A', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                  Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea 
                  value={reason} 
                  onChange={e => setReason(e.target.value)} 
                  placeholder="Reason for adjustment..." 
                  style={{ width: '100%', minHeight: 80, padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, color: '#0F172A', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, border: '1px solid #E2E8F0', background: 'white', color: '#64748B', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit('Pending Approval')}
                style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700, border: 'none', background: submitting ? '#94A3B8' : '#0D9488', color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Submitting...' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {viewRecord && (() => {
        const inv = invoices.find(i => i.id === viewRecord.affectedRecordId);
        const client = clients.find(c => c.id === viewRecord.clientId);
        const clientName = client?.name || viewRecord.clientId;

        return (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 20
            }}
            onClick={handleCloseModal}
          >
            <div 
              style={{ 
                background: 'white', 
                borderRadius: 12, 
                width: '100%', 
                maxWidth: 480, 
                maxHeight: '85vh', 
                overflowY: 'auto', 
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                padding: 24
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                    {viewRecord.id} • {viewRecord.type}
                  </h2>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                    View details of this financial request.
                  </p>
                </div>
                <button 
                  onClick={handleCloseModal}
                  style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer', padding: 4 }}
                >
                  <i className="ti ti-x" />
                </button>
              </div>

              {/* Summary Details Box */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ color: '#475569', fontSize: 13, fontWeight: 600 }}>Amount</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: viewRecord.type === 'Credit Memo' ? '#7C3AED' : '#10B981' }}>
                      {formatCurrency(viewRecord.amount)}
                    </span>
                    <StatusBadge status={viewRecord.status} />
                  </div>
                </div>

                <div style={{ height: 1, background: '#E2E8F0', margin: '0 -16px 12px' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>Client</span>
                  <span style={{ color: '#1E293B', fontWeight: 700 }}>{clientName}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>Linked Invoice</span>
                  <span style={{ color: '#1E293B', fontWeight: 700 }}>
                    {inv?.invoiceNumber || viewRecord.affectedRecordId}
                  </span>
                </div>

                {viewRecord.referenceNo && viewRecord.referenceNo !== 'N/A' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Reference No.</span>
                    <span style={{ color: '#1E293B', fontWeight: 600 }}>{viewRecord.referenceNo}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>Date Submitted</span>
                  <span style={{ color: '#1E293B', fontWeight: 600 }}>{formatDate(viewRecord.createdAt)}</span>
                </div>
              </div>

              {/* Reason Box */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                  Reason / Justification
                </div>
                <div style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.5 }}>
                  {viewRecord.reason}
                </div>
              </div>

              {/* Submitter & Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  By: <strong style={{ color: '#0F172A' }}>{viewRecord.createdBy || 'System'}</strong>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {viewRecord.status === 'Pending Approval' && isReviewer && (
                    <>
                      <button
                        type="button"
                        onClick={() => { handleReject(viewRecord); handleCloseModal(); }}
                        style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, border: '1px solid #FCA5A5', background: 'white', color: '#DC2626', cursor: 'pointer' }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleApprove(viewRecord); handleCloseModal(); }}
                        style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, border: 'none', background: '#0D9488', color: 'white', cursor: 'pointer' }}
                      >
                        Approve
                      </button>
                    </>
                  )}
                  <button 
                    onClick={handleCloseModal}
                    style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700, border: '1px solid #E2E8F0', background: 'white', color: '#64748B', cursor: 'pointer' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
