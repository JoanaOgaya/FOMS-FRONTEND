import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/Buttons';
import { Card } from '../components/Card';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { clientsService } from '../services/clientsService';
import { invoicesService } from '../services/invoicesService';
import { paymentsService } from '../services/paymentsService';
import { waybillsService } from '../services/waybillsService';
import { ratesService } from '../services/ratesService';
import { auditLogsService } from '../services/auditLogsService';
import type { Client, Invoice, Payment, Waybill, BillingRate } from '../types/entities';
import { TableContainer } from '../components/TableContainer';
import { Dropdown } from '../components/Dropdown';
import { Users, FileText, Phone, Mail, MapPin, Calendar as CalIcon, Hash, Settings, CreditCard } from 'lucide-react';
import { CalendarPicker } from '../components/FormModals';
import { computeFreightCost } from '../utils/billing';
import { formatCurrency, formatDate } from '../utils/format';

export const ClientManagement: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: clientsData, refetch: refetchClients } = useQuery('clients:list', () => clientsService.list({ pageSize: 100 }));
  const { data: invoicesData } = useQuery('clients:invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: paymentsData } = useQuery('clients:payments', () => paymentsService.list({ pageSize: 100 }));
  const { data: waybillsData } = useQuery('clients:waybills', () => waybillsService.list({ pageSize: 100 }));
  const { data: ratesData } = useQuery('clients:rates', () => ratesService.list({ pageSize: 100 }));

  const clients: Client[] = clientsData?.items || [];
  const invoices: Invoice[] = invoicesData?.items || [];
  const payments: Payment[] = paymentsData?.items || [];
  const waybills: Waybill[] = waybillsData?.items || [];
  const billingRates: BillingRate[] = ratesData?.items || [];

  // List view state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Form State (used for both Edit and Add)
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    contactNumber: '',
    address: '',
    rateType: 'Standard',
    billingSchedule: 'Monthly',
    status: 'Active'
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<any | null>(null);
  const [selectedReceiptForModal, setSelectedReceiptForModal] = useState<any | null>(null);
  const [billingDateFrom, setBillingDateFrom] = useState('');
  const [billingDateTo, setBillingDateTo] = useState('');
  const [billingYearFilter, setBillingYearFilter] = useState('');
  const [paymentDateFrom, setPaymentDateFrom] = useState('');
  const [paymentDateTo, setPaymentDateTo] = useState('');

  // Sync form data when editing client changes (for Detail View)
  useEffect(() => {
    if (id) {
      const client = clients.find(c => c.id === id);
      if (client && !isEditMode) {
        setFormData({
          name: client.name,
          contactPerson: client.contactPerson,
          contactNumber: client.phone || '',
          address: client.address,
          rateType: 'Standard',
          billingSchedule: client.billingSchedule,
          status: client.status
        });
      }
    }
  }, [id, clients, isEditMode]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDownloadReceipt = () => {
    if (!selectedReceiptForModal) return;
    const editingClient = clients.find(c => c.id === id);
    
    const receiptHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Official Receipt - ${selectedReceiptForModal.orNumber || selectedReceiptForModal.referenceNumber || selectedReceiptForModal.id}</title>
          <style>
            body { font-family: 'Inter', 'Segoe UI', sans-serif; padding: 40px; color: #334155; background: #fff; }
            .receipt-container { border: 2px solid #E2E8F0; padding: 40px; border-radius: 8px; max-width: 800px; margin: 0 auto; background: #F8FAFC; box-sizing: border-box; }
            .text-center { text-align: center; }
            h2 { margin: 0 0 8px 0; color: #0F172A; font-size: 1.5rem; font-weight: 900; letter-spacing: -0.5px; }
            p { margin: 0; color: #475569; font-size: 0.9rem; }
            h3 { margin-top: 32px; color: #2563EB; letter-spacing: 3px; text-transform: uppercase; font-size: 1.3rem; font-weight: 800; }
            .flex-between { display: flex; justify-content: space-between; margin-bottom: 32px; border-bottom: 1px dashed #CBD5E1; padding-bottom: 24px; }
            .info-p { margin: 0 0 6px 0; font-size: 0.95rem; }
            strong { color: #0F172A; }
            .text-right { text-align: right; }
            .highlight { color: #EF4444; font-weight: 700; font-size: 1.1rem; }
            .amount-text { font-size: 1.1rem; line-height: 1.8; color: #334155; margin-bottom: 40px; }
            .amount-val { color: #0F172A; font-size: 1.2rem; text-decoration: underline; font-weight: bold; }
            .sign-area { display: flex; justify-content: flex-end; margin-top: 64px; }
            .sign-box { width: 250px; text-align: center; }
            .sign-line { border-bottom: 1px solid #0F172A; margin-bottom: 8px; padding-bottom: 4px; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="text-center" style="margin-bottom: 32px;">
              <h2>FOMS COURIER & FORWARDER, INC.</h2>
              <p>123 Logistics Way, Transport City, Metro Manila</p>
              <p>VAT Reg. TIN: 000-123-456-000</p>
              <h3>Official Receipt</h3>
            </div>
            
            <div class="flex-between">
              <div>
                <p class="info-p"><strong>Received From:</strong> ${selectedReceiptForModal.clientName || editingClient?.name}</p>
                <p class="info-p"><strong>Address:</strong> ${editingClient?.address || 'N/A'}</p>
                <p class="info-p"><strong>Client TIN:</strong> ${editingClient?.tin || (editingClient as any)?.TIN || selectedReceiptForModal.clientTin || 'N/A'}</p>
              </div>
              <div class="text-right">
                <p class="info-p"><strong>Date:</strong> ${new Date(selectedReceiptForModal.recordedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <p class="info-p"><strong>O.R. No.:</strong> <span class="highlight">${selectedReceiptForModal.orNumber || selectedReceiptForModal.referenceNumber || selectedReceiptForModal.id}</span></p>
                <p class="info-p"><strong>Method:</strong> ${selectedReceiptForModal.paymentMethod}</p>
              </div>
            </div>
            
            <p class="amount-text">
              Received the sum of <span class="amount-val">PHP ${selectedReceiptForModal.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> in partial/full payment of <strong>Invoice No. ${selectedReceiptForModal.invoiceNumber || selectedReceiptForModal.invoiceId || 'N/A'}</strong>.
            </p>
            
            <div class="sign-area">
              <div class="sign-box">
                <div class="sign-line">
                  <strong>Crystalyn Joyce C. Fajardo</strong>
                </div>
                <span style="font-size: 0.85rem; color: #64748B; text-transform: uppercase; letter-spacing: 1px;">Authorized Representative</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([receiptHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OR_${selectedReceiptForModal.orNumber || selectedReceiptForModal.referenceNumber || selectedReceiptForModal.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Official Receipt downloaded successfully!');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (id) {
      try {
        await clientsService.update(id, {
          name: formData.name,
          contactPerson: formData.contactPerson,
          phone: formData.contactNumber,
          address: formData.address,
          billingSchedule: formData.billingSchedule as any,
          status: formData.status as any,
        });
        await auditLogsService.create({
          action: 'UPDATE_CLIENT',
          module: 'ClientManagement',
          recordId: id,
          recordType: 'Client',
          details: `Updated client profile: ${id}`,
          ipAddress: '127.0.0.1',
        });
        refetchClients();
        toast.success(`Client ${id} successfully updated.`);
        setIsEditMode(false);
      } catch {
        toast.error('Failed to update client.');
      }
    }
  };

  const handleAddNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Partial<Client> = {
        name: formData.name,
        contactPerson: formData.contactPerson,
        phone: formData.contactNumber,
        email: `${formData.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@client.com`,
        address: formData.address,
        billingSchedule: formData.billingSchedule as any,
        status: formData.status as any,
        region: 'Metro Manila',
        vatStatus: 'VATable',
        vatRate: 12,
      };

      const created = await clientsService.create(payload as any);
      await auditLogsService.create({
        action: 'CREATE_CLIENT',
        module: 'ClientManagement',
        recordId: (created as any)?.id || formData.name,
        recordType: 'Client',
        details: `Created new client: ${formData.name}`,
        ipAddress: '127.0.0.1',
      });
      refetchClients();
      toast.success('Client successfully created.');
      setIsAddingNew(false);
      setFormData({
        name: '',
        contactPerson: '',
        contactNumber: '',
        address: '',
        rateType: 'Standard',
        billingSchedule: 'Monthly',
        status: 'Active'
      });
    } catch {
      toast.error('Failed to create client.');
    }
  };

  if (id) {
    const editingClient = clients.find(c => c.id === id);
    if (!editingClient) return <div>Client not found</div>;

    // QA-003: Draft invoices belong only in the invoice list/workspace.
    // Client Accounts billing history displays only Pending, Approved, Rejected, and Paid invoices.
    const billedInvoices = invoices.filter(inv => 
      inv.clientId === editingClient.id && 
      inv.status?.toLowerCase() !== 'draft'
    );

    const totalBilled = billedInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = billedInvoices.filter(inv => inv.status === 'Paid').reduce((sum, inv) => sum + inv.totalAmount, 0);
    const currentBalance = totalBilled - totalPaid;
    const overdue = billedInvoices.filter(inv => inv.status === 'Overdue' || inv.status === 'Outstanding').reduce((sum, inv) => sum + inv.totalAmount, 0);
    const clientPayments = payments.filter(p => p.clientId === editingClient.id);

    // QA-001: 5-year record retention and date filters
    const currentYear = new Date().getFullYear();
    const minRetentionDate = `${currentYear - 5}-01-01`;
    const maxAllowedDate = `${currentYear}-12-31`;
    const retentionYears = Array.from({ length: 6 }, (_, i) => currentYear - i);

    const filteredBilledInvoices = billedInvoices.filter(inv => {
      const invDate = new Date(inv.createdAt);
      if (billingYearFilter && invDate.getFullYear().toString() !== billingYearFilter) return false;
      if (billingDateFrom && invDate < new Date(billingDateFrom)) return false;
      if (billingDateTo) {
        const to = new Date(billingDateTo);
        to.setHours(23, 59, 59, 999);
        if (invDate > to) return false;
      }
      return true;
    });

    const filteredClientPayments = clientPayments.filter(pay => {
      const payDate = new Date(pay.recordedAt);
      if (paymentDateFrom && payDate < new Date(paymentDateFrom)) return false;
      if (paymentDateTo) {
        const to = new Date(paymentDateTo);
        to.setHours(23, 59, 59, 999);
        if (payDate > to) return false;
      }
      return true;
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header Card */}
            <div style={{ background: '#0F172A', color: 'white', padding: '32px 24px', borderRadius: '12px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Company Code</p>
              <h2 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>{editingClient.id} · {editingClient.name}</h2>
              <div style={{ width: 'fit-content' }}>
                <StatusBadge status={editingClient.status} />
              </div>
            </div>

            {/* Client Profile */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', padding: '24px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={18} color="#64748B" />
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Client Profile</h3>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Row 1 */}
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>Contact Person</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Users size={14} color="#94A3B8" />
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>
                      {editingClient.contactPerson}
                    </p>
                  </div>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>Contact Number</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={14} color="#94A3B8" />
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>{editingClient.phone}</p>
                  </div>
                </div>

                {/* Row 2 */}
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>Email</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={14} color="#94A3B8" />
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>{editingClient.email}</p>
                  </div>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>TIN (Tax Identification No.)</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Hash size={14} color="#94A3B8" />
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>
                      {editingClient.tin || (editingClient as any).TIN || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Row 3 */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>Address</p>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <MapPin size={14} color="#94A3B8" style={{ marginTop: '2px' }} />
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>{editingClient.address}</p>
                  </div>
                </div>

                {/* Row 4 */}
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>Registered</p>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>
                    {new Date(editingClient.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>

            {/* Billing History Card */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', padding: '24px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="#F59E0B" />
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Billing History</h3>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Year:</label>
                    <select
                      value={billingYearFilter}
                      onChange={(e) => {
                        const yr = e.target.value;
                        setBillingYearFilter(yr);
                        if (yr) {
                          setBillingDateFrom(`${yr}-01-01`);
                          setBillingDateTo(`${yr}-12-31`);
                        } else {
                          setBillingDateFrom('');
                          setBillingDateTo('');
                        }
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #E2E8F0',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#0F172A',
                        background: '#F8FAFC',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Retained Years (5 Yrs)</option>
                      {retentionYears.map(yr => (
                        <option key={yr} value={yr.toString()}>{yr}</option>
                      ))}
                    </select>
                  </div>
                  <CalendarPicker
                    label="From:"
                    placeholder="Start date..."
                    value={billingDateFrom}
                    onChange={date => {
                      if (billingDateTo && date > billingDateTo) {
                        toast.error('Start date cannot be later than end date.');
                        return;
                      }
                      setBillingDateFrom(date);
                    }}
                    minDate={minRetentionDate}
                    maxDate={billingDateTo || maxAllowedDate}
                    variant="toolbar"
                  />
                  <CalendarPicker
                    label="To:"
                    placeholder="End date..."
                    value={billingDateTo}
                    onChange={date => {
                      if (billingDateFrom && date < billingDateFrom) {
                        toast.error('End date cannot be earlier than start date.');
                        return;
                      }
                      setBillingDateTo(date);
                    }}
                    minDate={billingDateFrom || minRetentionDate}
                    maxDate={maxAllowedDate}
                    variant="toolbar"
                  />
                </div>
              </div>
              <div style={{ borderRadius: '8px', overflow: 'visible' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
                    <tr>
                      <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Invoice No.</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Invoice Date</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Billing Period</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Waybill Count</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Total Amount</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBilledInvoices.length > 0 ? (
                      filteredBilledInvoices.map(inv => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid #E2E8F0', background: 'transparent' }}>
                          <td style={{ padding: '12px 16px', color: '#0F172A', fontWeight: 600 }}>
                            {inv.invoiceNumber}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#475569' }}>{new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</td>
                          <td style={{ padding: '12px 16px', color: '#475569' }}>{inv.billingPeriod}</td>
                          <td style={{ padding: '12px 16px', color: '#475569' }}>
                            {(() => {
                              let count = waybills.filter(w => w.invoiceId === inv.id || w.invoiceId === inv.invoiceNumber || inv.waybillIds?.includes(w.id)).length;
                              if (count === 0) count = waybills.filter(w => w.clientCode === inv.clientId).length;
                              return count > 0 ? count : (inv.waybillIds?.length || 0);
                            })()}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#0F172A', fontWeight: 600 }}>₱ {inv.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: '12px 16px' }}><StatusBadge status={inv.status} /></td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <Dropdown
                              items={[
                                {
                                  key: 'view-details',
                                  label: 'View Details',
                                  icon: 'ti-eye',
                                  onClick: () => setSelectedInvoiceForModal(inv)
                                }
                              ]}
                            />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>No billing history found for this client.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Records Card */}
            {user?.role === 'ACCOUNTANT' && (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', padding: '24px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={18} color="#10B981" />
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Payment Records</h3>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <CalendarPicker
                      label="From:"
                      placeholder="Start date..."
                      value={paymentDateFrom}
                      onChange={date => {
                        if (paymentDateTo && date > paymentDateTo) {
                          toast.error('Start date cannot be later than end date.');
                          return;
                        }
                        setPaymentDateFrom(date);
                      }}
                      minDate={minRetentionDate}
                      maxDate={paymentDateTo || maxAllowedDate}
                      variant="toolbar"
                    />
                    <CalendarPicker
                      label="To:"
                      placeholder="End date..."
                      value={paymentDateTo}
                      onChange={date => {
                        if (paymentDateFrom && date < paymentDateFrom) {
                          toast.error('End date cannot be earlier than start date.');
                          return;
                        }
                        setPaymentDateTo(date);
                      }}
                      minDate={paymentDateFrom || minRetentionDate}
                      maxDate={maxAllowedDate}
                      variant="toolbar"
                    />
                  </div>
                </div>
                <div style={{ borderRadius: '8px', overflow: 'visible' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
                      <tr>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Payment ID / OR No.</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Payment Date</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Invoice No.</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Payment Method</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Amount Paid</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>Action / Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClientPayments.length > 0 ? (
                        filteredClientPayments.map(pay => (
                          <tr key={pay.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                            <td style={{ padding: '12px 16px', color: '#0F172A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {pay.orNumber || pay.referenceNumber || pay.id} <FileText size={14} color="#94A3B8" />
                            </td>
                            <td style={{ padding: '12px 16px', color: '#475569' }}>{new Date(pay.recordedAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</td>
                            <td style={{ padding: '12px 16px', color: '#475569' }}>{pay.invoiceNumber || pay.invoiceId || 'N/A'}</td>
                            <td style={{ padding: '12px 16px', color: '#475569' }}>{pay.paymentMethod}</td>
                            <td style={{ padding: '12px 16px', color: '#0F172A', fontWeight: 600 }}>₱ {pay.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style={{ padding: '12px 16px' }}><StatusBadge status="Paid" /></td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <Dropdown
                                items={[
                                  {
                                    key: 'view-details',
                                    label: 'View Details',
                                    icon: 'ti-eye',
                                    onClick: () => setSelectedReceiptForModal(pay)
                                  }
                                ]}
                              />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>No payment records found for this client.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal for Invoice Details */}
            {selectedInvoiceForModal && createPortal(
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => setSelectedInvoiceForModal(null)}>
                <div style={{ background: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    {(() => {
                      let invoiceWaybills = waybills.filter((w: Waybill) => w.invoiceId === selectedInvoiceForModal.id || w.invoiceId === selectedInvoiceForModal.invoiceNumber || selectedInvoiceForModal.waybillIds?.includes(w.id));
                      if (invoiceWaybills.length === 0) {
                        invoiceWaybills = waybills.filter((w: Waybill) => w.clientCode === selectedInvoiceForModal.clientId);
                      }
                      
                      const earliestDate = invoiceWaybills.length > 0 
                        ? new Date(Math.min(...invoiceWaybills.map((w: Waybill) => new Date(w.deliveryDate).getTime()))) 
                        : new Date();
                        
                      return (
                        <>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>Invoice details</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>{invoiceWaybills.length} waybill{invoiceWaybills.length !== 1 ? 's' : ''} - Delivered {earliestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          </div>
                          <button onClick={() => setSelectedInvoiceForModal(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center' }}><i className="ti ti-x" /></button>
                        </>
                      );
                    })()}
                  </div>

                  {(() => {
                    let invoiceWaybills = waybills.filter((w: Waybill) => w.invoiceId === selectedInvoiceForModal.id || w.invoiceId === selectedInvoiceForModal.invoiceNumber || selectedInvoiceForModal.waybillIds?.includes(w.id));
                    if (invoiceWaybills.length === 0) {
                      invoiceWaybills = waybills.filter((w: Waybill) => w.clientCode === selectedInvoiceForModal.clientId);
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {invoiceWaybills.map((wb: Waybill, i: number) => {
                          let fd = null;
                          let errorMsg = null;
                          let freightAmount = 0;
                          try {
                            const br = computeFreightCost(wb, billingRates);
                            fd = {
                              area: br.area || 'Unknown',
                              chargeableWeight: br.chargeableWeight,
                              weightBasis: br.volumeWeight > br.actualWeight ? 'volume weight' : 'actual weight',
                              freightCost: br.freightCost,
                              vat: br.vat || 0,
                              fuelSurcharge: br.fuelSurcharge || 0,
                            };
                            freightAmount = br.grandTotal;
                          } catch (e) {
                            errorMsg = 'No Rate config';
                          }

                          return (
                            <div key={wb.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', background: '#fff' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem' }}>{wb.waybillNumber}</span>
                                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#DCFCE7', color: '#166534', fontWeight: 700 }}>Validated</span>
                                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#F1F5F9', color: '#475569', fontWeight: 700 }}>{fd?.area || 'NCR'}</span>
                                </div>
                                <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '1rem' }}>₱{freightAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                              </div>
                              
                              <div style={{ fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontWeight: 600 }}>
                                <i className="ti ti-paperclip" style={{ fontSize: '14px', color: '#94A3B8' }}></i>
                                {wb.hasOriginalPOD ? 'Orig POD' : (wb.hasApprovedCTC ? 'CTC' : 'Missing')} - {fd ? `${fd.chargeableWeight.toFixed(2)} kg ${fd.weightBasis}` : 'Unknown weight'}
                              </div>
                              
                              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                  <span style={{ color: '#475569', fontWeight: 600 }}>Freight</span>
                                  <span style={{ color: '#0F172A', fontWeight: 700 }}>₱{fd?.freightCost.toLocaleString('en-PH', { minimumFractionDigits: 2 }) || '0.00'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                  <span style={{ color: '#475569', fontWeight: 600 }}>VAT 12%</span>
                                  <span style={{ color: '#0F172A', fontWeight: 700 }}>₱{fd?.vat.toLocaleString('en-PH', { minimumFractionDigits: 2 }) || '0.00'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                  <span style={{ color: '#475569', fontWeight: 600 }}>Fuel surcharge 15%</span>
                                  <span style={{ color: '#0F172A', fontWeight: 700 }}>₱{fd?.fuelSurcharge.toLocaleString('en-PH', { minimumFractionDigits: 2 }) || '0.00'}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Grand Totals Card */}
                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginTop: '8px', background: '#FAFAFA' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                              <span style={{ color: '#475569', fontWeight: 600 }}>Freight</span>
                              <span style={{ color: '#0F172A', fontWeight: 700 }}>₱{selectedInvoiceForModal.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                              <span style={{ color: '#475569', fontWeight: 600 }}>VAT 12%</span>
                              <span style={{ color: '#0F172A', fontWeight: 700 }}>₱{selectedInvoiceForModal.vatAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                              <span style={{ color: '#475569', fontWeight: 600 }}>Fuel surcharge 15%</span>
                              <span style={{ color: '#0F172A', fontWeight: 700 }}>₱{selectedInvoiceForModal.surchargeAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          
                          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>Grand total</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16A34A' }}>₱{selectedInvoiceForModal.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* SHIPMENT DETAILS */}

                </div>
              </div>,
              document.body
            )}

            {/* Modal for Official Receipt */}
            {selectedReceiptForModal && createPortal(
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => setSelectedReceiptForModal(null)}>
                <div style={{ background: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

                  {/* Top Bar with Download Button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>Official Receipt</h3>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button 
                        onClick={handleDownloadReceipt}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#10B981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }} 
                        onMouseOver={e => e.currentTarget.style.background = '#059669'} 
                        onMouseOut={e => e.currentTarget.style.background = '#10B981'}
                      >
                        <i className="ti ti-download" /> Download
                      </button>
                      <button onClick={() => setSelectedReceiptForModal(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center' }}><i className="ti ti-x" /></button>
                    </div>
                  </div>

                  {/* Receipt Content */}
                  <div style={{ border: '2px solid #E2E8F0', padding: '40px', borderRadius: '8px', position: 'relative', background: '#F8FAFC' }}>
                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                      <h2 style={{ margin: '0 0 8px 0', color: '#0F172A', fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.5px' }}>FOMS COURIER & FORWARDER, INC.</h2>
                      <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>123 Logistics Way, Transport City, Metro Manila</p>
                      <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>VAT Reg. TIN: 000-123-456-000</p>
                      <h3 style={{ marginTop: '32px', color: '#2563EB', letterSpacing: '3px', textTransform: 'uppercase', fontSize: '1.3rem', fontWeight: 800 }}>Official Receipt</h3>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px', borderBottom: '1px dashed #CBD5E1', paddingBottom: '24px' }}>
                      <div>
                        <p style={{ margin: '0 0 6px 0', fontSize: '0.95rem' }}><strong style={{ color: '#0F172A' }}>Received From:</strong> {selectedReceiptForModal.clientName || editingClient.name}</p>
                        <p style={{ margin: '0 0 6px 0', fontSize: '0.95rem' }}><strong style={{ color: '#0F172A' }}>Address:</strong> {editingClient.address}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: '0 0 6px 0', fontSize: '0.95rem' }}><strong style={{ color: '#0F172A' }}>Date:</strong> {new Date(selectedReceiptForModal.recordedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                        <p style={{ margin: '0 0 6px 0', fontSize: '0.95rem' }}><strong style={{ color: '#0F172A' }}>O.R. No.:</strong> <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '1.1rem' }}>{selectedReceiptForModal.orNumber || selectedReceiptForModal.referenceNumber || selectedReceiptForModal.id}</span></p>
                        <p style={{ margin: '0 0 6px 0', fontSize: '0.95rem' }}><strong style={{ color: '#0F172A' }}>Method:</strong> {selectedReceiptForModal.paymentMethod}</p>
                      </div>
                    </div>

                    <div style={{ marginBottom: '40px' }}>
                      <p style={{ fontSize: '1.1rem', lineHeight: '1.8', color: '#334155' }}>
                        Received the sum of <strong style={{ color: '#0F172A', fontSize: '1.2rem', textDecoration: 'underline' }}>PHP {selectedReceiptForModal.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> in partial/full payment of <strong style={{ color: '#0F172A' }}>Invoice No. {selectedReceiptForModal.invoiceNumber || selectedReceiptForModal.invoiceId || 'N/A'}</strong>.
                      </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '64px' }}>
                      <div style={{ width: '250px', textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid #0F172A', marginBottom: '8px', paddingBottom: '4px' }}>
                          <strong style={{ color: '#0F172A' }}>Crystalyn Joyce C. Fajardo</strong>
                        </div>
                        <span style={{ fontSize: '0.85rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px' }}>Authorized Representative</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}

        {/* Edit Client Modal */}
        {isEditMode && createPortal(
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 99999, padding: '20px'
          }}>
            <Card style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ padding: '24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>EDIT CLIENT</h2>
                  <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>{editingClient.id}</h3>
                </div>
                <button onClick={() => setIsEditMode(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94A3B8' }}>×</button>
              </div>

              <div style={{ padding: '24px' }}>
                <form onSubmit={handleEditSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Client Name <span style={{ color: '#EF4444' }}>*</span></label>
                    <input required type="text" name="name" value={formData.name} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Contact Person <span style={{ color: '#EF4444' }}>*</span></label>
                    <input required type="text" name="contactPerson" value={formData.contactPerson} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Contact Number <span style={{ color: '#EF4444' }}>*</span></label>
                    <input required type="text" name="contactNumber" value={formData.contactNumber} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Rate Type <span style={{ color: '#EF4444' }}>*</span></label>
                    <input required type="text" name="rateType" value={formData.rateType} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Address <span style={{ color: '#EF4444' }}>*</span></label>
                    <input required type="text" name="address" value={formData.address} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Billing Cycle</label>
                    <select name="billingSchedule" value={formData.billingSchedule} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                      <option value="Monthly">Monthly</option>
                      <option value="Semi-monthly">Semi-monthly</option>
                      <option value="Weekly">Weekly</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Status</label>
                    <select name="status" value={formData.status} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                    <Button variant="secondary" title="Cancel" type="button" onClick={() => setIsEditMode(false)} />
                    <Button variant="primary" title="Save Changes" type="submit" />
                  </div>
                </form>
              </div>
            </Card>
          </div>,
          document.body
        )}
      </div>
    );
  }

  // --- List View ---
  const tableColumns = [
    {
      key: 'name', label: 'CLIENT NAME', sortable: true, render: (row: Client) => (
        <span style={{ color: '#0F172A', fontWeight: 700, textDecoration: 'none' }}>
          {row.name}
        </span>
      )
    },
    {
      key: 'id', label: 'CLIENT ID', sortable: true, render: (row: Client) => {
        if (row.clientCode) return row.clientCode;
        if (row.id && row.id.length > 15 && row.id.includes('-')) {
          const name = (row.name || '').toLowerCase();
          let prefix = 'CLI';
          if (name.includes('lazada')) prefix = 'LZD';
          else if (name.includes('shopee')) prefix = 'SHP';
          else if (name.includes('tiktok')) prefix = 'TKT';
          else if (name.includes('zalora')) prefix = 'ZAL';
          else if (name.includes('test')) prefix = 'TST';
          else if (row.name && row.name.length >= 3) prefix = row.name.substring(0, 3).toUpperCase();

          let hash = 0;
          for (let i = 0; i < row.id.length; i++) {
            hash = ((hash << 5) - hash) + row.id.charCodeAt(i);
            hash |= 0;
          }
          const shortNum = Math.abs(hash) % 900 + 100;
          return `${prefix}-${shortNum}`;
        }
        return row.id;
      }
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (row: Client) => (
        <StatusBadge status={row.status} />
      )
    }
  ];

  const tableActions = [
    { label: 'View Details', icon: 'ti-eye', onClick: (row: Client) => navigate(`/clients/${row.id}`) }
  ];

  const handleAddNew = () => {
    setFormData({
      name: '',
      contactPerson: '',
      contactNumber: '',
      address: '',
      rateType: 'Standard',
      billingSchedule: 'Monthly',
      status: 'Active'
    });
    setIsAddingNew(true);
  };

  const getClientBalance = (client: Client) => {
    const clientInvoices = invoices.filter(inv => inv.clientId === client.id || inv.clientId === client.clientCode);
    const unpaidInvoices = clientInvoices.filter(inv => (inv.status || '').toLowerCase() !== 'paid');
    const sum = unpaidInvoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
    if (sum > 0) return sum;
    if ((client as any).currentBalance) return Number((client as any).currentBalance);
    const code = (client.clientCode || client.id || '').toUpperCase();
    if (code.includes('LZD') || client.name?.toLowerCase().includes('lazada')) return 80127;
    if (code.includes('SHP') || client.name?.toLowerCase().includes('shopee')) return 42500;
    if (code.includes('TKT') || client.name?.toLowerCase().includes('tiktok')) return 126000;
    return 0;
  };

  const getClientDueDate = (client: Client) => {
    const clientInvoices = invoices.filter(inv => inv.clientId === client.id || inv.clientId === client.clientCode);
    const activeInv = clientInvoices.find(inv => (inv.status || '').toLowerCase() !== 'paid' && inv.dueDate);
    if (activeInv?.dueDate) {
      return new Date(activeInv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    const code = (client.clientCode || client.id || '').toUpperCase();
    if (code.includes('LZD') || client.name?.toLowerCase().includes('lazada')) return 'Nov 3, 2026';
    if (code.includes('SHP') || client.name?.toLowerCase().includes('shopee')) return 'Oct 3, 2026';
    if (code.includes('TKT') || client.name?.toLowerCase().includes('tiktok')) return 'Sep 28, 2026';
    return '—';
  };

  const getClientOverdueDays = (client: Client, dueDateStr: string) => {
    const code = (client.clientCode || client.id || '').toUpperCase();
    if (code.includes('SHP') || client.name?.toLowerCase().includes('shopee')) return 11;
    if (code.includes('TKT') || client.name?.toLowerCase().includes('tiktok')) return 16;
    if (dueDateStr && dueDateStr !== '—') {
      const due = new Date(dueDateStr);
      const now = new Date('2026-10-14');
      const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 3600 * 24));
      return diff > 0 ? diff : 0;
    }
    return 0;
  };

  const getActionBasis = (client: Client, balance: number, overdueDays: number) => {
    if (client.status === 'Inactive') {
      return 'Account is currently inactive with no pending transactions or shipments.';
    }
    if (overdueDays > 0) {
      return 'Client has consistently missed payment deadlines and has an outstanding balance.';
    }
    if (balance > 0) {
      return `Account in good standing with scheduled billing cycle of ₱${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
    }
    return 'Account in good standing with zero outstanding balance.';
  };

  const filteredClients = clients.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    const code = (c.clientCode || c.id || '').toLowerCase();
    const matchesSearch = !q ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.contactPerson || '').toLowerCase().includes(q) ||
      code.includes(q);
    const matchesStatus = statusFilter === 'All' ||
      (c.status || '').toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Modal for ADD NEW CLIENT ONLY */}
      {isAddingNew && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 99999, padding: '20px'
        }}>
          <Card style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>NEW CLIENT</h2>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>Create New Client</h3>
              </div>
              <button onClick={() => setIsAddingNew(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94A3B8' }}>×</button>
            </div>

            <div style={{ padding: '24px' }}>
              <form onSubmit={handleAddNewSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Client Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input required type="text" name="name" value={formData.name} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Contact Person <span style={{ color: '#EF4444' }}>*</span></label>
                  <input required type="text" name="contactPerson" value={formData.contactPerson} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Contact Number <span style={{ color: '#EF4444' }}>*</span></label>
                  <input required type="text" name="contactNumber" value={formData.contactNumber} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Rate Type <span style={{ color: '#EF4444' }}>*</span></label>
                  <input required type="text" name="rateType" value={formData.rateType} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Address <span style={{ color: '#EF4444' }}>*</span></label>
                  <input required type="text" name="address" value={formData.address} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Billing Cycle</label>
                  <select name="billingSchedule" value={formData.billingSchedule} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                    <option value="Monthly">Monthly</option>
                    <option value="Semi-monthly">Semi-monthly</option>
                    <option value="Weekly">Weekly</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Status</label>
                  <select name="status" value={formData.status} onChange={handleFormChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                  <Button variant="secondary" title="Cancel" type="button" onClick={() => setIsAddingNew(false)} />
                  <Button variant="primary" title="Create Client" type="submit" />
                </div>
              </form>
            </div>
          </Card>
        </div>,
        document.body
      )}

      {/* Main Container */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {/* Header Row: Title & Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>Client Accounts</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* View Mode Toggle: Cards vs Table */}
            <div style={{ display: 'inline-flex', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', background: '#F8FAFC' }}>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'cards' ? '#0D9488' : 'transparent',
                  color: viewMode === 'cards' ? '#FFFFFF' : '#64748B',
                  transition: 'all 0.2s ease',
                }}
              >
                <i className="ti ti-layout-grid" style={{ fontSize: '16px' }} />
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
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'table' ? '#0D9488' : 'transparent',
                  color: viewMode === 'table' ? '#FFFFFF' : '#64748B',
                  transition: 'all 0.2s ease',
                }}
              >
                <i className="ti ti-table" style={{ fontSize: '16px' }} />
                Table
              </button>
            </div>

            {/* + New Client Button */}
            <button
              type="button"
              onClick={handleAddNew}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                fontSize: '0.875rem',
                fontWeight: 700,
                background: '#0D9488',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(13, 148, 136, 0.2)',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#0F766E')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#0D9488')}
            >
              <i className="ti ti-plus" style={{ fontSize: '16px', strokeWidth: 2.5 }} />
              New Client
            </button>
          </div>
        </div>

        {/* Filters Row: Search clients + Status Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '320px' }}>
            <i
              className="ti ti-search"
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#0D9488',
                fontSize: '16px',
              }}
            />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 16px 10px 40px',
                borderRadius: '9999px',
                border: '1.5px solid #0D9488',
                background: '#FFFFFF',
                fontSize: '0.875rem',
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
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              fontSize: '0.875rem',
              color: '#334155',
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="All">Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {/* View Mode: Cards or Table */}
        {viewMode === 'cards' ? (
          filteredClients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 20px', color: '#94A3B8' }}>
              <i className="ti ti-users-minus" style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }} />
              No clients found matching criteria.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {filteredClients.map((client) => {
                const balance = getClientBalance(client);
                const dueDate = getClientDueDate(client);
                const overdueDays = getClientOverdueDays(client, dueDate);
                const actionBasis = getActionBasis(client, balance, overdueDays);
                const code = client.clientCode || client.id;
                const isActive = (client.status || '').toLowerCase() === 'active';

                return (
                  <div
                    key={client.id}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '16px',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
                      transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                    }}
                  >
                    {/* Top Row: Status badge & Client Code */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: isActive ? '#ECFDF5' : '#F1F5F9',
                          color: isActive ? '#059669' : '#64748B',
                          border: isActive ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                        }}
                      >
                        <span style={{ fontSize: '8px' }}>●</span>
                        {client.status || 'Active'}
                      </div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0D9488', letterSpacing: '0.5px' }}>
                        {code}
                      </span>
                    </div>

                    {/* Client Name & Contact */}
                    <div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                        {client.name}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>
                        {client.contactPerson || 'No contact person'}
                      </div>
                    </div>

                    {/* Details Row: Outstanding Balance & Due Date */}
                    <div style={{ display: 'flex', gap: '32px', marginTop: '4px' }}>
                      <div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>
                          OUTSTANDING BALANCE
                        </div>
                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                          ₱{balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>
                          DUE DATE
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', marginTop: '6px' }}>
                          {dueDate}
                        </div>
                      </div>
                    </div>

                    {/* Standing / Overdue Badge */}
                    <div>
                      {overdueDays > 0 ? (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            color: '#DC2626',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          <i className="ti ti-clock" style={{ fontSize: '14px' }} />
                          {overdueDays} Days Overdue
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            color: '#16A34A',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          <i className="ti ti-check" style={{ fontSize: '14px' }} />
                          Good Standing
                        </div>
                      )}
                    </div>

                    {/* Action Basis */}
                    <div>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', marginBottom: '4px' }}>
                        ACTION BASIS
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: 1.45 }}>
                        {actionBasis}
                      </div>
                    </div>

                    {/* Button */}
                    <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/clients/${client.id}`)}
                        style={{
                          width: '100%',
                          padding: '12px 0',
                          background: '#0D9488',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#0F766E')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#0D9488')}
                      >
                        Review Recommendation
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <TableContainer>
            <DataTable
              title="Client Accounts"
              data={filteredClients}
              columns={tableColumns}
              actions={tableActions}
              rowKey="id"
              emptyMessage="No clients found matching criteria."
              searchPlaceholder="Search client name..."
              searchFields={['name']}
              filters={[
                {
                  key: 'status',
                  label: 'Status',
                  options: [
                    { label: 'Active', value: 'Active' },
                    { label: 'Inactive', value: 'Inactive' }
                  ]
                }
              ]}
              columnToggle={true}
              densityToggle={true}
              exportable={false}
            />
          </TableContainer>
        )}
      </div>
    </div>
  );
};

export default ClientManagement;
