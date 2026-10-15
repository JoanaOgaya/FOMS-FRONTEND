import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Buttons';
import { Card } from '../components/Card';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { useQuery } from '../hooks/useQuery';
import { invoicesService } from '../services/invoicesService';
import { clientsService } from '../services/clientsService';
import { paymentsService } from '../services/paymentsService';
import { auditLogsService } from '../services/auditLogsService';
import type { Invoice, Client, Payment } from '../types/entities';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { ClientInfoCard } from '../components/ClientInfoCard';
import { CalendarPicker } from '../components/FormModals';
import { formatCurrency, formatDate } from '../utils/format';

/** Derive payment status from invoice */
function derivePaymentStatus(inv: Invoice): 'Unpaid' | 'Due Soon' | 'Overdue' | 'Paid' {
  if (inv.status === 'Paid') return 'Paid';
  const now = Date.now();
  const due = new Date(inv.dueDate).getTime();
  const daysUntilDue = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (daysUntilDue < 0) return 'Overdue';
  if (daysUntilDue <= 7) return 'Due Soon';
  return 'Unpaid';
}

/** Status badge color tokens */
function getStatusBadge(status: string) {
  switch (status) {
    case 'Draft':
      return { bg: '#F1F5F9', border: '#E2E8F0', text: '#64748B', dot: '#94A3B8', label: 'Draft' };
    case 'Pending Approval':
      return { bg: '#FEF3C7', border: '#FDE68A', text: '#D97706', dot: '#F59E0B', label: 'Pending Approval' };
    case 'Needs Revision':
      return { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', dot: '#EF4444', label: 'Needs Revision' };
    case 'Approved':
      return { bg: '#DCFCE7', border: '#BBF7D0', text: '#16A34A', dot: '#16A34A', label: 'Approved' };
    case 'Sent':
      return { bg: '#E0F2FE', border: '#BAE6FD', text: '#0284C7', dot: '#0284C7', label: 'Sent' };
    case 'Paid':
      return { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', dot: '#15803D', label: 'Paid' };
    default:
      return { bg: '#F1F5F9', border: '#E2E8F0', text: '#64748B', dot: '#94A3B8', label: status };
  }
}

/** Middle badge helper */
function getMiddleBadge(inv: any) {
  if (inv.derivedPaymentStatus === 'Overdue') {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          color: '#DC2626',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <i className="ti ti-clock" style={{ fontSize: 14 }} />
        Payment Overdue
      </div>
    );
  }
  if (inv.status === 'Pending Approval') {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          color: '#B45309',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <i className="ti ti-clock-hour-4" style={{ fontSize: 14 }} />
        Pending Approval
      </div>
    );
  }
  if (inv.status === 'Needs Revision') {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          color: '#DC2626',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <i className="ti ti-alert-triangle" style={{ fontSize: 14 }} />
        Needs Revision
      </div>
    );
  }
  if (inv.status === 'Approved' || inv.status === 'Paid') {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          color: '#16A34A',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <i className="ti ti-circle-check" style={{ fontSize: 14 }} />
        {inv.status === 'Paid' ? 'Paid in Full' : 'Approved & Verified'}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        color: '#64748B',
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <i className="ti ti-file-text" style={{ fontSize: 14 }} />
      Draft Invoice
    </div>
  );
}

export const InvoicingDesk: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const { toast } = useToast();
  const { user } = useAuth();

  const { data: invData, refetch: refetchInvoices } = useQuery('desk:invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: clientData } = useQuery('desk:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: payData } = useQuery('desk:payments', () => paymentsService.list({ pageSize: 100 }));

  const invoices: Invoice[] = invData?.items || [];
  const clients: Client[] = clientData?.items || [];
  const payments: Payment[] = payData?.items || [];

  let viewInvoice: Invoice | undefined = undefined;
  let viewClient: Client | undefined = undefined;

  if (id) {
    viewInvoice = invoices.find(i => i.id === id);
    if (!viewInvoice) {
      viewClient = clients.find(c => c.id === id);
    }
  }

  const selectedClientId = viewClient ? viewClient.id : null;

  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Enrich invoices with derived payment status
  const enrichedInvoices = useMemo(() => {
    const base = selectedClientId
      ? invoices.filter(i => i.clientId === selectedClientId)
      : invoices;

    const activeInvoices = base.filter((inv: Invoice) => {
      if (!['Draft', 'Needs Revision', 'Pending Approval', 'Approved', 'Sent', 'Paid'].includes(inv.status)) return false;
      if (filterDateFrom || filterDateTo) {
        const itemDate = new Date(inv.createdAt);
        itemDate.setHours(0, 0, 0, 0);
        if (filterDateFrom) {
          const fromDate = new Date(filterDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (itemDate < fromDate) return false;
        }
        if (filterDateTo) {
          const toDate = new Date(filterDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (itemDate > toDate) return false;
        }
      }
      return true;
    });

    return activeInvoices.map((inv: Invoice) => {
      const client = clients.find(c => c.id === inv.clientId);
      const ps = derivePaymentStatus(inv);
      return {
        ...inv,
        clientName: client?.name ?? inv.clientId,
        waybillCount: inv.waybillIds?.length || 0,
        derivedPaymentStatus: ps,
      };
    });
  }, [invoices, clients, selectedClientId, filterDateFrom, filterDateTo]);

  const allClients: string[] = useMemo(() => {
    return Array.from(new Set(invoices.map((inv: Invoice) => {
      const client = clients.find(c => c.id === inv.clientId);
      return client?.name ?? inv.clientId;
    }))).filter(Boolean);
  }, [invoices, clients]);

  const filteredInvoices = useMemo(() => {
    return enrichedInvoices.filter((inv: any) => {
      if (clientFilter !== 'All' && inv.clientName !== clientFilter) return false;
      if (statusFilter !== 'All' && inv.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNo = inv.invoiceNumber?.toLowerCase().includes(q);
        const matchClient = inv.clientName?.toLowerCase().includes(q);
        const matchPeriod = inv.billingPeriod?.toLowerCase().includes(q);
        if (!matchNo && !matchClient && !matchPeriod) return false;
      }
      return true;
    });
  }, [enrichedInvoices, clientFilter, statusFilter, searchQuery]);

  const handleTransition = async (invId: string, newStatus: Invoice['status'], successMsg: string, updates?: Partial<Invoice>) => {
    const inv = invoices.find(i => i.id === invId);
    if (!inv) return;

    try {
      await invoicesService.update(invId, { status: newStatus, ...updates });
      await auditLogsService.create({
        action: 'INVOICE_STATUS_CHANGE',
        module: 'InvoicingDesk',
        recordId: invId,
        recordType: 'Invoice',
        details: `Changed status to ${newStatus}`,
        ipAddress: '127.0.0.1',
      });
      refetchInvoices();
      toast.success(successMsg, 'Success');
    } catch {
      toast.error('Failed to update invoice status.', 'Error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {selectedClientId && viewClient ? (
        <ClientInfoCard client={viewClient} onBack={() => navigate('/invoicing-desk')} />
      ) : null}

      {viewInvoice ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button title="Back to Invoices" variant="secondary" icon="ti-arrow-left" onClick={() => navigate('/invoicing-desk')} />
            <div style={{ display: 'flex', gap: 8 }}>
              {(viewInvoice.status === 'Draft' || viewInvoice.status === 'Needs Revision') && (
                <Button
                  title="Submit for Approval"
                  variant="primary"
                  icon="ti-send"
                  onClick={() => handleTransition(viewInvoice!.id, 'Pending Approval', `Invoice ${viewInvoice!.invoiceNumber} submitted for approval`)}
                />
              )}
              {viewInvoice.status === 'Approved' && (
                <Button title="Mark as Sent" variant="primary" icon="ti-send" onClick={() => handleTransition(viewInvoice!.id, 'Sent', 'Invoice marked as sent')} />
              )}
            </div>
          </div>
          <Card>
            <InvoiceDocument invoice={viewInvoice} />
          </Card>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          {/* Header toolbar: Search, Client Filter, Status Filter, and Dates (no Create Invoice button) */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Search Input */}
              <div style={{ position: 'relative', width: 280 }}>
                <i
                  className="ti ti-search"
                  style={{
                    position: 'absolute',
                    left: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#0D9488',
                    fontSize: 18,
                    pointerEvents: 'none'
                  }}
                />
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 16px 10px 42px',
                    border: '1px solid #0D9488',
                    borderRadius: 9999,
                    fontSize: '0.9rem',
                    outline: 'none',
                    color: '#111827',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Client Filter */}
              <select
                value={clientFilter}
                onChange={e => setClientFilter(e.target.value)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  outline: 'none',
                  background: '#fff',
                  cursor: 'pointer',
                  color: '#111827'
                }}
              >
                <option value="All">All Clients</option>
                {allClients.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  outline: 'none',
                  background: '#fff',
                  cursor: 'pointer',
                  color: '#111827'
                }}
              >
                <option value="All">Invoice Status</option>
                <option value="Draft">Draft</option>
                <option value="Pending Approval">Pending Approval</option>
                <option value="Approved">Approved</option>
                <option value="Needs Revision">Needs Revision</option>
                <option value="Sent">Sent</option>
                <option value="Paid">Paid</option>
              </select>
            </div>

            {/* Date Range Pickers: Aligned horizontally side-by-side (pantay) */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <div style={{ width: 175, flexShrink: 0 }}>
                <CalendarPicker
                  label="From:"
                  placeholder="Start date..."
                  value={filterDateFrom}
                  onChange={setFilterDateFrom}
                />
              </div>
              <div style={{ width: 175, flexShrink: 0 }}>
                <CalendarPicker
                  label="To:"
                  placeholder="End date..."
                  value={filterDateTo}
                  onChange={setFilterDateTo}
                />
              </div>
              {(filterDateFrom || filterDateTo) && (
                <button
                  type="button"
                  onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}
                  title="Clear dates"
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    background: '#F8FAFC',
                    color: '#64748B',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    height: 38,
                    marginTop: 18,
                    flexShrink: 0
                  }}
                >
                  <i className="ti ti-x" /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Cards Grid matching 2nd picture style */}
          <div style={{ padding: 24 }}>
            {filteredInvoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', fontSize: 14 }}>
                <i className="ti ti-search" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
                No matching invoices found.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                {filteredInvoices.map((inv: any) => {
                  const badge = getStatusBadge(inv.status);

                  return (
                    <div
                      key={inv.id}
                      style={{
                        background: '#fff',
                        border: '1px solid #E2E8F0',
                        borderRadius: 12,
                        padding: 24,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* Top Row: Status (left) & Invoice Number (right) */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            background: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                            padding: '4px 12px',
                            borderRadius: '9999px',
                            fontSize: '12px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.dot }} />
                          {badge.label}
                        </span>

                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: '14px',
                            color: '#0D9488',
                            letterSpacing: '0.02em'
                          }}
                        >
                          {inv.invoiceNumber || inv.id}
                        </span>
                      </div>

                      {/* Title & Subtitle: Client Name & Billing Period */}
                      <div>
                        <div
                          onClick={() => navigate(`/invoicing-desk/${inv.id}`)}
                          style={{ fontWeight: 800, fontSize: 18, color: '#111827', lineHeight: 1.3, cursor: 'pointer' }}
                          title="View Invoice"
                        >
                          {inv.clientName || 'Unknown Client'}
                        </div>
                        <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>
                          {inv.billingPeriod || 'Standard Billing Period'}
                        </div>
                      </div>

                      {/* Details Row: 2 columns (matching OUTSTANDING BALANCE / DUE DATE in 2nd Picture) */}
                      <div style={{ display: 'flex', gap: 40, marginTop: 4 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>
                            TOTAL AMOUNT
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 16, color: '#111827', marginTop: 4 }}>
                            {formatCurrency(inv.totalAmount || 0)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>
                            INVOICE DATE
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: '#111827', marginTop: 4 }}>
                            {inv.createdAt ? formatDate(inv.createdAt) : 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Middle Status Badge (matching Good Standing / Overdue badge in 2nd Picture) */}
                      <div>
                        {getMiddleBadge(inv)}
                      </div>

                      {/* Invoice Details Preview (matching phone & address row in 2nd Picture) */}
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#64748B' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className="ti ti-truck-delivery" style={{ fontSize: 14, color: '#0D9488' }} />
                          <span>{inv.waybillCount} {inv.waybillCount === 1 ? 'Waybill' : 'Waybills'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className="ti ti-calendar" style={{ fontSize: 14, color: '#0D9488', flexShrink: 0 }} />
                          <span>Due: {inv.dueDate ? formatDate(inv.dueDate) : 'Net 30 Days'}</span>
                        </div>
                      </div>

                      {/* Bottom Button (solid teal VIEW button matching 2nd Picture) */}
                      <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => navigate(`/invoicing-desk/${inv.id}`)}
                          style={{
                            flex: 1,
                            padding: '12px 0',
                            background: '#0D9488',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#0F766E'}
                          onMouseLeave={e => e.currentTarget.style.background = '#0D9488'}
                        >
                          VIEW
                        </button>

                        {(inv.status === 'Draft' || inv.status === 'Needs Revision') && (
                          <button
                            type="button"
                            title="Submit for Approval"
                            onClick={() => handleTransition(inv.id, 'Pending Approval', `Invoice ${inv.invoiceNumber} submitted for approval`)}
                            style={{
                              padding: '12px 16px',
                              background: '#F0FDF4',
                              color: '#16A34A',
                              border: '1px solid #BBF7D0',
                              borderRadius: 8,
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#DCFCE7'}
                            onMouseLeave={e => e.currentTarget.style.background = '#F0FDF4'}
                          >
                            <i className="ti ti-send" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicingDesk;
