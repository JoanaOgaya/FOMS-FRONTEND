import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Card } from '../components/Card';
import { KpiCard } from '../components/shared/KpiCard';
import { Button } from '../components/Buttons';
import { useToast } from '../components/ToastContext';
import { ClientInfoCard } from '../components/ClientInfoCard';
import { useQuery } from '../hooks/useQuery';
import { invoicesService } from '../services/invoicesService';
import { waybillsService } from '../services/waybillsService';
import { clientsService } from '../services/clientsService';
import { ratesService } from '../services/ratesService';
import { auditLogsService } from '../services/auditLogsService';
import type { Invoice, Waybill, Client, BillingRate } from '../types/entities';
import { computeFreightCost } from '../utils/billing';
import { formatCurrency, formatDate, formatBillingPeriod } from '../utils/format';
import { invalidateForMutation } from '../services/invalidation';
import '../components/FormModals.css';

export const InvoiceReview: React.FC = () => {
  const { toast } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: invData, refetch: refetchInvoices } = useQuery('review:invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: wbData } = useQuery('review:waybills', () => waybillsService.list({ pageSize: 200 }));
  const { data: clientData } = useQuery('review:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: rateData } = useQuery('review:rates', () => ratesService.list({ pageSize: 100 }));

  const invoices: Invoice[] = invData?.items || [];
  const waybills: Waybill[] = wbData?.items || [];
  const clients: Client[] = clientData?.items || [];
  const billingRates: BillingRate[] = rateData?.items || [];

  const [remarks, setRemarks] = useState('');
  const [reviewAction, setReviewAction] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [expandedWaybills, setExpandedWaybills] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // Toolbar Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Pending Approval' | 'Approved'>('ALL');
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('ALL');

  useEffect(() => {
    if (location.state?.clientId) {
      if (location.state?.invoiceId) {
        const inv = invoices.find(i => i.id === location.state.invoiceId);
        if (inv) setSelectedInvoice(inv);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, navigate, invoices, location.pathname]);

  const viewClient = clients.find(c => c.id === id);
  const selectedClientId = viewClient ? viewClient.id : location.state?.clientId;

  useEffect(() => {
    if (id && !viewClient) {
      const inv = invoices.find(i => i.id === id);
      if (inv) {
        setSelectedInvoice(inv);
        navigate('/invoice-review', { replace: true });
      }
    }
  }, [id, invoices, navigate, viewClient]);

  const visibleInvoices = invoices.filter(i => i.status !== 'Draft');
  const clientScopedInvoices = selectedClientId ? visibleInvoices.filter(i => i.clientId === selectedClientId) : visibleInvoices;

  // Enriched Clients
  const enrichedClients = clients.map(client => {
    const clientInvoices = visibleInvoices.filter(i => i.clientId === client.id);
    const pendingCount = clientInvoices.filter(i => i.status === 'Pending Approval').length;
    const totalAmount = clientInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
    return {
      id: client.id,
      clientName: client.name,
      pendingCount,
      totalAmount
    };
  }).filter(c => c.pendingCount > 0 || c.totalAmount > 0);

  // Filtered Invoices based on search, statusFilter, and selectedClientFilter
  const filteredInvoices = clientScopedInvoices.filter(inv => {
    if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
    if (!selectedClientId && selectedClientFilter !== 'ALL' && inv.clientId !== selectedClientFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const client = clients.find(c => c.id === inv.clientId);
      const clientName = client?.name?.toLowerCase() || '';
      const invNum = (inv.invoiceNumber || inv.id || '').toLowerCase();
      const period = (inv.billingPeriod || '').toLowerCase();
      const dateStr = formatDate(inv.createdAt).toLowerCase();
      if (!invNum.includes(q) && !clientName.includes(q) && !period.includes(q) && !dateStr.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const sortedInvoices = [...filteredInvoices].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // KPI Calculations
  const pendingCount = clientScopedInvoices.filter(i => i.status === 'Pending Approval').length;
  const approvedCount = clientScopedInvoices.filter(i => i.status === 'Approved').length;
  const totalAmount = clientScopedInvoices
    .filter(i => i.status === 'Pending Approval' || i.status === 'Approved')
    .reduce((sum, i) => sum + i.totalAmount, 0);

  // Status Handlers
  const handleApprove = async (viewInvoice: Invoice) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await invoicesService.act(viewInvoice.id, 'approve');
      await auditLogsService.create({
        action: 'APPROVE_INVOICE',
        module: 'InvoiceReview',
        recordId: viewInvoice.id,
        recordType: 'Invoice',
        details: `Approved invoice ${viewInvoice.invoiceNumber}`,
        ipAddress: '127.0.0.1',
      });
      await invalidateForMutation('approveInvoice');
      toast.success(`Invoice ${viewInvoice.invoiceNumber} has been approved.`, 'Success');
      setSelectedInvoice(null);
      setReviewAction('');
    } catch {
      toast.error('Failed to approve invoice.', 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (viewInvoice: Invoice) => {
    if (submitting) return;
    if (!remarks.trim()) {
      toast.error('Please provide remarks for the correction.', 'Error');
      return;
    }
    setSubmitting(true);
    try {
      await invoicesService.act(viewInvoice.id, 'reject', { remarks });
      await auditLogsService.create({
        action: 'RETURN_INVOICE',
        module: 'InvoiceReview',
        recordId: viewInvoice.id,
        recordType: 'Invoice',
        details: `Returned invoice ${viewInvoice.invoiceNumber} with remarks: ${remarks}`,
        ipAddress: '127.0.0.1',
      });
      await invalidateForMutation('rejectInvoice');
      toast.error(`Invoice ${viewInvoice.invoiceNumber} returned for correction.`, 'Returned');
      setSelectedInvoice(null);
      setRemarks('');
      setReviewAction('');
      setExpandedWaybills({});
    } catch {
      toast.error('Failed to return invoice.', 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const renderModal = () => {
    if (!selectedInvoice) return null;
    const client = clients.find(c => c.id === selectedInvoice.clientId);
    let invoiceWaybills = waybills.filter(
      w => selectedInvoice.waybillIds?.includes(w.id) ||
           w.invoiceId === selectedInvoice.id ||
           w.invoiceId === selectedInvoice.invoiceNumber
    );
    if (invoiceWaybills.length === 0) {
      invoiceWaybills = waybills.filter(w => w.clientCode === selectedInvoice.clientId);
    }

    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', padding: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E2E8F0' }}>
          {/* Modal Header */}
          <div style={{ padding: '24px 32px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#047857', border: '1px solid #10B981', padding: '4px 10px', borderRadius: '999px', background: '#ECFDF5' }}>
                  {selectedInvoice.invoiceNumber || selectedInvoice.id}
                </span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>{client?.name || selectedInvoice.clientId}</span>
              </div>
              <h2 style={{ margin: '2px 0 0', fontSize: '1.35rem', color: '#0F172A', fontWeight: 800 }}>Invoice Review</h2>
              <div style={{ display: 'inline-block', width: 'fit-content' }}>
                <StatusBadge status={selectedInvoice.status} />
              </div>
            </div>
            <button
              onClick={() => { setSelectedInvoice(null); setRemarks(''); setReviewAction(''); setExpandedWaybills({}); }}
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px', fontSize: '1.2rem', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Close modal"
            >
              &times;
            </button>
          </div>

          <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ background: '#ECFDF5', border: '1px solid #10B981', borderRadius: '10px', padding: '14px 18px' }}>
                <div style={{ fontSize: '10px', color: '#047857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Total Amount</div>
                <div style={{ fontSize: '1.25rem', color: '#047857', fontWeight: 800 }}>{formatCurrency(selectedInvoice.totalAmount)}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 18px' }}>
                <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Due Date</div>
                <div style={{ fontSize: '1.05rem', color: '#0F172A', fontWeight: 800 }}>{formatDate(selectedInvoice.dueDate)}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 18px' }}>
                <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Prepared By</div>
                <div style={{ fontSize: '1.05rem', color: '#0F172A', fontWeight: 700 }}>{selectedInvoice.createdBy || 'Accountant'}</div>
              </div>
            </div>

            {/* Waybill Lines Heading */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 -8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                WAYBILL LINES &bull; {invoiceWaybills.length}
              </div>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                Click "View Computation" on any card to see full calculation
              </span>
            </div>

            {/* Waybill Cards List (matching Picture 2 format precisely) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {invoiceWaybills.map((wb, idx) => {
                let fd: any;
                try {
                  const computed = computeFreightCost(wb, billingRates);
                  fd = {
                    area: computed.area || wb.destinationArea || 'NCR',
                    actualWeight: computed.actualWeight || wb.actualWeight || 0,
                    volumeWeight: computed.volumeWeight || 0,
                    chargeableWeight: computed.chargeableWeight || wb.chargeableWeight || 0,
                    weightBasis: computed.weightBasis || 'Actual Weight',
                    minimumRate: computed.minimumRate || 100,
                    excessRate: computed.excessRate || 25,
                    excessKgs: computed.excessKgs || 0,
                    freightCost: computed.freightCost || 0,
                    valuation: computed.valuation || 0,
                    odaCharge: computed.odaCharge || 0,
                    subtotal: computed.subtotal || computed.freightCost,
                    vat: computed.vat || 0,
                    fuelSurcharge: computed.fuelSurcharge || 0,
                    grandTotal: computed.grandTotal || computed.freightCost,
                  };
                } catch {
                  fd = {
                    area: wb.destinationArea || 'NCR',
                    actualWeight: wb.actualWeight || 0,
                    volumeWeight: 0,
                    chargeableWeight: wb.actualWeight || 1,
                    weightBasis: 'Actual Weight',
                    minimumRate: 100,
                    excessRate: 25,
                    excessKgs: 0,
                    freightCost: 0,
                    valuation: 0,
                    odaCharge: 0,
                    subtotal: 0,
                    vat: 0,
                    fuelSurcharge: 0,
                    grandTotal: 0,
                  };
                }
                
                const isExpanded = expandedWaybills[wb.id];
                const toggleExpand = () => setExpandedWaybills(prev => ({ ...prev, [wb.id]: !prev[wb.id] }));

                return (
                  <div
                    key={wb.id}
                    style={{
                      background: '#fff',
                      borderRadius: 12,
                      border: '1px solid #E2E8F0',
                      padding: '18px 20px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                  >
                    {/* Top Row: Region & Status Badges */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>
                          LINE #{idx + 1}
                        </span>
                        {wb.hasOriginalPOD ? (
                          <span style={{ fontSize: '10px', color: '#166534', background: '#DCFCE7', padding: '1px 7px', borderRadius: 4, fontWeight: 700 }}>
                            ORIG POD
                          </span>
                        ) : wb.hasApprovedCTC ? (
                          <span style={{ fontSize: '10px', color: '#1E40AF', background: '#DBEAFE', padding: '1px 7px', borderRadius: 4, fontWeight: 700 }}>
                            CTC
                          </span>
                        ) : null}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Area Badge (matching Picture 2: e.g. Luzon) */}
                        <span
                          style={{
                            background: '#F1F5F9',
                            color: '#475569',
                            border: '1px solid #E2E8F0',
                            padding: '3px 12px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.02em'
                          }}
                        >
                          {fd.area}
                        </span>

                        {/* Doc Status Badge (matching Picture 2: e.g. Validated in purple) */}
                        <span
                          style={{
                            background: '#EDE9FE',
                            color: '#6D28D9',
                            border: '1px solid #DDD6FE',
                            padding: '3px 12px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          <i className="ti ti-check" style={{ fontSize: 11 }} />
                          {wb.status || 'Validated'}
                        </span>
                      </div>
                    </div>

                    {/* Bold Waybill Number Title */}
                    <div>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: '1.2rem',
                          fontWeight: 800,
                          color: '#0F172A',
                          letterSpacing: '-0.01em'
                        }}
                      >
                        {wb.waybillNumber}
                      </h4>

                      {/* Delivered Date Subtitle with Truck Icon */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 4,
                          fontSize: '0.82rem',
                          color: '#64748B'
                        }}
                      >
                        <i className="ti ti-truck" style={{ fontSize: 14, color: '#94A3B8' }} />
                        <span>Delivered {formatDate(wb.deliveryDate)}</span>
                      </div>
                    </div>

                    {/* Metrics Row: Two Columns (Chargeable Wt. vs Amount) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          CHARGEABLE WT.
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                            {fd.chargeableWeight.toFixed(2)} kg
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              border: '1px solid #E2E8F0',
                              background: '#F8FAFC',
                              color: '#64748B',
                              padding: '1px 6px',
                              borderRadius: 12,
                              fontWeight: 700,
                              textTransform: 'uppercase'
                            }}
                          >
                            {fd.weightBasis === 'volume' || fd.weightBasis === 'Volume Weight' ? 'VOL' : 'ACT'}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          AMOUNT
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#059669', marginTop: 2 }}>
                          {formatCurrency(fd.grandTotal)}
                        </div>
                      </div>
                    </div>

                    {/* Footer Row: Left Info + Right "View Computation ▾" */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: '1px solid #F1F5F9',
                        paddingTop: 12,
                        marginTop: 4
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        {wb.hasOriginalPOD ? 'Original POD Verified' : (wb.hasApprovedCTC ? 'Approved CTC Verified' : 'Standard Document Verified')}
                      </span>

                      <button
                        type="button"
                        onClick={toggleExpand}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0284C7',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: 0
                        }}
                      >
                        <span>View Computation</span>
                        <i className={isExpanded ? 'ti ti-chevron-up' : 'ti ti-chevron-down'} style={{ fontSize: 13 }} />
                      </button>
                    </div>

                    {/* Expandable Computation Breakdown */}
                    {isExpanded && (
                      <div
                        style={{
                          marginTop: 4,
                          padding: '16px 18px',
                          borderRadius: 10,
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12
                        }}
                      >
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          BILLING COMPUTATION BREAKDOWN &bull; {fd.area.toUpperCase()}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                            <span>Actual Weight:</span>
                            <span style={{ fontWeight: 600, color: '#0F172A' }}>{fd.actualWeight.toFixed(2)} kg</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                            <span>Volume Weight:</span>
                            <span style={{ fontWeight: 600, color: '#0F172A' }}>{fd.volumeWeight.toFixed(2)} kg</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                            <span>Base Freight:</span>
                            <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatCurrency(fd.freightCost)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                            <span>Valuation Fee:</span>
                            <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatCurrency(fd.valuation)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                            <span>ODA Charge:</span>
                            <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatCurrency(fd.odaCharge)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                            <span>Net Subtotal:</span>
                            <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(fd.subtotal)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                            <span>12% VAT:</span>
                            <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatCurrency(fd.vat)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                            <span>Fuel Surcharge (15%):</span>
                            <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatCurrency(fd.fuelSurcharge)}</span>
                          </div>
                        </div>

                        <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>WAYBILL TOTAL</span>
                          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>{formatCurrency(fd.grandTotal)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {invoiceWaybills.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px', background: '#F8FAFC', borderRadius: 8, border: '1px dashed #E2E8F0' }}>
                  No linked waybill lines found for this invoice.
                </div>
              )}
            </div>

            {selectedInvoice.status === 'Pending Approval' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid #E2E8F0', paddingTop: '24px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <Button
                    title="Return for Revision"
                    variant={reviewAction === 'reject' ? 'primary' : 'secondary'}
                    icon="ti-arrow-back-up"
                    disabled={submitting}
                    onClick={() => setReviewAction('reject')}
                  />
                  <Button
                    title="Approve Invoice"
                    variant="primary"
                    icon="ti-check"
                    loading={submitting}
                    disabled={submitting}
                    onClick={() => handleApprove(selectedInvoice)}
                  />
                </div>

                {reviewAction === 'reject' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Remarks for Revision <span style={{ color: 'red' }}>*</span></label>
                    <textarea
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Specify what needs correction..."
                      style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #CBD5E1', minHeight: 80 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <Button title="Cancel" variant="secondary" disabled={submitting} onClick={() => { setReviewAction(''); setRemarks(''); }} />
                      <Button title="Confirm Return" variant="primary" loading={submitting} disabled={submitting} onClick={() => handleReject(selectedInvoice)} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {selectedClientId && viewClient ? (
        <ClientInfoCard client={viewClient} onBack={() => navigate('/invoice-review')} />
      ) : null}

      <div className="kpi-grid">
        <KpiCard label="Pending Approval" value={pendingCount} icon="ti-clock" variant="warning" />
        <KpiCard label="Approved Invoices" value={approvedCount} icon="ti-check" variant="success" />
        <KpiCard label="Total Invoiced Value" value={formatCurrency(totalAmount)} icon="ti-receipt" variant="info" />
      </div>

      {/* Main Review Section with Card / Table view */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Controls Toolbar: Search, Filter Tabs, Client Dropdown, View Mode */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          {/* Left: Search & Filter Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: 260 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 14 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search invoices or clients..."
                style={{
                  width: '100%',
                  padding: '8px 32px 8px 34px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#F8FAFC',
                  color: '#0F172A'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2 }}
                >
                  <i className="ti ti-x" style={{ fontSize: 13 }} />
                </button>
              )}
            </div>

            {/* Status Filter Tabs */}
            <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: 8 }}>
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                style={{
                  border: 'none',
                  background: statusFilter === 'ALL' ? '#fff' : 'transparent',
                  color: statusFilter === 'ALL' ? '#0F172A' : '#64748B',
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '6px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: statusFilter === 'ALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                All ({clientScopedInvoices.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Pending Approval')}
                style={{
                  border: 'none',
                  background: statusFilter === 'Pending Approval' ? '#fff' : 'transparent',
                  color: statusFilter === 'Pending Approval' ? '#D97706' : '#64748B',
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '6px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: statusFilter === 'Pending Approval' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                Pending ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Approved')}
                style={{
                  border: 'none',
                  background: statusFilter === 'Approved' ? '#fff' : 'transparent',
                  color: statusFilter === 'Approved' ? '#059669' : '#64748B',
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '6px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: statusFilter === 'Approved' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                Approved ({approvedCount})
              </button>
            </div>

            {/* Client Filter Dropdown (when not viewing a specific client page) */}
            {!selectedClientId && (
              <select
                value={selectedClientFilter}
                onChange={e => setSelectedClientFilter(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Clients ({clients.length})</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Invoices Cards Grid */}
          <div>
            {sortedInvoices.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                  gap: '18px'
                }}
              >
                {sortedInvoices.map((inv) => {
                  const client = clients.find(c => c.id === inv.clientId);
                  const invWaybills = waybills.filter(
                    w => inv.waybillIds?.includes(w.id) ||
                         w.invoiceId === inv.id ||
                         w.invoiceId === inv.invoiceNumber ||
                         w.clientCode === inv.clientId
                  );
                  const waybillCount = invWaybills.length || (inv.waybillIds?.length ?? 1);
                  const totalChargeableWeight = invWaybills.reduce(
                    (sum, w) => sum + (w.chargeableWeight || w.actualWeight || 0),
                    0
                  );

                  return (
                    <div
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      style={{
                        background: '#fff',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '20px 22px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = '0 8px 24px -4px rgba(15, 23, 42, 0.1)';
                        e.currentTarget.style.borderColor = '#CBD5E1';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                        e.currentTarget.style.borderColor = '#E2E8F0';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* Top Row: Client Badge & Status Badge (matching Picture 2 format) */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            background: '#F1F5F9',
                            color: '#334155',
                            border: '1px solid #E2E8F0',
                            padding: '3px 12px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            maxWidth: '65%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          title={client?.name || inv.clientId}
                        >
                          {client?.name || inv.clientId}
                        </span>
                        <StatusBadge status={inv.status} />
                      </div>

                      {/* Invoice Title & Dates */}
                      <div>
                        <h4
                          style={{
                            margin: 0,
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            color: '#0F172A',
                            letterSpacing: '-0.01em'
                          }}
                        >
                          {inv.invoiceNumber || inv.id}
                        </h4>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 6,
                            fontSize: '0.82rem',
                            color: '#64748B'
                          }}
                        >
                          <i className="ti ti-calendar" style={{ fontSize: 14, color: '#94A3B8' }} />
                          <span>Delivered {formatDate(inv.createdAt)}</span>
                          {inv.dueDate && (
                            <span style={{ color: '#94A3B8' }}>&bull; Due {formatDate(inv.dueDate)}</span>
                          )}
                        </div>
                        {inv.billingPeriod && (
                          <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 3 }}>
                            Period: {formatBillingPeriod(inv.billingPeriod)}
                          </div>
                        )}
                      </div>

                      {/* Details Row: Chargeable Wt / Waybill Count & Total Amount */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 16,
                          marginTop: 'auto',
                          paddingTop: 8
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            CHARGEABLE WT.
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                              {totalChargeableWeight > 0 ? `${totalChargeableWeight.toFixed(2)} kg` : `${waybillCount} Waybills`}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                border: '1px solid #E2E8F0',
                                background: '#F8FAFC',
                                color: '#64748B',
                                padding: '1px 6px',
                                borderRadius: 12,
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}
                            >
                              {totalChargeableWeight > 0 ? 'ACT' : 'ITEMS'}
                            </span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            AMOUNT
                          </div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#059669', marginTop: 2 }}>
                            {formatCurrency(inv.totalAmount)}
                          </div>
                        </div>
                      </div>

                      {/* Footer Action Row (matching Picture 2 format) */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderTop: '1px solid #F1F5F9',
                          paddingTop: 12,
                          marginTop: 4
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                          {inv.dueDate ? `Due: ${formatDate(inv.dueDate)}` : 'Net 30 Days'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedInvoice(inv);
                          }}
                          style={{
                            background: inv.status === 'Pending Approval' ? '#0F172A' : '#F1F5F9',
                            color: inv.status === 'Pending Approval' ? '#fff' : '#0F172A',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>{inv.status === 'Pending Approval' ? 'Review Invoice' : 'View Details'}</span>
                          <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94A3B8', border: '1px dashed #E2E8F0', borderRadius: '12px' }}>
                <i className="ti ti-file-search" style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#475569' }}>No invoices match your filter criteria.</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>Try adjusting your search query or status filter.</p>
              </div>
            )}
          </div>
      </div>

      {renderModal()}
    </div>
  );
};

export default InvoiceReview;
