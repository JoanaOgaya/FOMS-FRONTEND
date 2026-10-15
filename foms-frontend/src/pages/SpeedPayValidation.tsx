import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { CalendarPicker } from '../components/FormModals';
import { StatusBadge } from '../components/shared/StatusBadge';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { TableContainer } from '../components/TableContainer';
import { speedpayService } from '../services/speedpayService';
import { invoicesService } from '../services/invoicesService';
import { clientsService } from '../services/clientsService';
import { paymentsService } from '../services/paymentsService';
import { useQuery } from '../hooks/useQuery';
import { KpiCard } from '../components/shared/KpiCard';
import { formatCurrency } from '../utils/format';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { useDuplicatePreCheck } from '../hooks/useDuplicatePreCheck';
import { DuplicatePreCheckModal } from '../components/ai/DuplicatePreCheckModal';
import { canCheckDuplicateInForm, canActOnRecord } from '../utils/roleAccess';
import { invalidateForMutation } from '../services/invalidation';
import { Role, type SpeedPaySubmission, type Invoice, type Client } from '../types/entities';

export const SpeedPayValidation: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);

  const {
    data: initialData,
    isLoading: loading,
    error,
    refetch,
  } = useQuery(
    'speedpay:validation_list',
    async () => {
      const [spRes, invRes, cliRes] = await Promise.all([
        speedpayService.list({ pageSize: 100 }),
        invoicesService.list({ pageSize: 100 }),
        clientsService.list({ pageSize: 100 }),
      ]);
      return {
        speedPay: spRes.items || [],
        invoices: invRes.items || [],
        clients: cliRes.items || [],
      };
    }
  );

  const speedPay = initialData?.speedPay || [];
  const invoices = initialData?.invoices || [];
  const clients = initialData?.clients || [];

  const [validationStatus, setValidationStatus] = useState<'Approve' | 'Reject' | 'Endorse' | 'Return' | ''>('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const {
    modalState: dupModalState,
    runPreCheck,
    handleModalCancel,
    handleModalRetry,
    handleProceedWithRemarks,
    handleProceedWithManualReview,
  } = useDuplicatePreCheck();

  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // ─── Enrich SpeedPay submissions ─────────────────────────────────
  const allEnriched = useMemo(() => {
    return speedPay.map((sub: SpeedPaySubmission) => {
      const invoice = invoices.find((i: Invoice) => i.id === sub.invoiceId);
      const clientId = (sub as any).clientId || (invoice ? invoice.clientId : 'UNKNOWN');
      const client = clients.find((c: Client) => c.id === clientId);

      let submittedTimeStr = sub.submittedAt || new Date().toISOString();
      if (!submittedTimeStr.endsWith('Z') && !submittedTimeStr.includes('+')) {
        submittedTimeStr += 'Z';
      }

      return {
        ...sub,
        clientId,
        clientName: sub.clientName ?? client?.name ?? 'Unknown',
        invoiceNumber: sub.invoiceNumber ?? invoice?.invoiceNumber ?? sub.invoiceId,
        invoiceAmount: invoice?.totalAmount ?? sub.amountPaid ?? 0,
        submittedAt: submittedTimeStr
      };
    });
  }, [speedPay, invoices, clients]);

  // ─── Chart Data ───────────────────────────────────────────────────
  const pending = allEnriched.filter(s => s.status === 'Pending Validation').length;
  const validated = allEnriched.filter(s => s.status === 'Validated').length;
  const rejected = allEnriched.filter(s => s.status === 'Rejected').length;
  const todayStr = new Date().toLocaleDateString('en-PH');
  const validatedToday = allEnriched.filter(s => s.status === 'Validated' && new Date((s as any).validatedAt || '').toLocaleDateString('en-PH') === todayStr).length;

  const totalCollected = useMemo(() =>
    allEnriched.filter(s => s.status === 'Validated').reduce((sum, s) => sum + (s.amountPaid ?? 0), 0),
    [allEnriched]
  );

  const pendingAmount = useMemo(() =>
    allEnriched.filter(s => s.status === 'Pending Validation').reduce((sum, s) => sum + (s.amountPaid ?? 0), 0),
    [allEnriched]
  );

  // ─── Handle Validate/Reject ────────────────────
  const handleValidate = async (sub: any) => {
    if ((validationStatus === 'Reject' || validationStatus === 'Return') && !rejectionReason.trim()) {
      toast.error(`Please provide a ${validationStatus === 'Reject' ? 'rejection' : 'return'} reason.`, 'Required Field Missing');
      return;
    }

    // Separation of duties check: creator cannot approve own record
    if (sub.createdBy && (sub.createdBy === user?.id || sub.createdBy === user?.employeeId)) {
      toast.error('You cannot act on your own record.', 'Separation of Duties');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (validationStatus === 'Approve') {
        // Pre-save duplicate check on payment reference number
        if (sub.referenceNumber && canCheckDuplicateInForm(user?.role, 'speedpay')) {
          const check = await runPreCheck({
            entityType: 'speedpay',
            fieldName: 'referenceNumber',
            fieldValue: sub.referenceNumber,
            entityId: sub.id,
          });
          if (!check.canProceed) {
            setIsSubmitting(false);
            return;
          }
        }

        await speedpayService.validate(sub.id, { status: 'Validated', notes: 'Approved via SpeedPay Validation' });
        // Mark payment or invoice as paid
        if (sub.invoiceId) {
          await invoicesService.update(sub.invoiceId, { status: 'Paid' as any });
        }
        await invalidateForMutation('validateSpeedpay');
        toast.success(`Payment from ${sub.clientName} approved. Invoice marked as Paid.`, 'Payment Validated');
      } else if (validationStatus === 'Reject') {
        await speedpayService.validate(sub.id, { status: 'Rejected', notes: rejectionReason });
        await invalidateForMutation('rejectSpeedpay');
        toast.error(`Payment from ${sub.clientName} has been Rejected.`, 'Payment Rejected');
      } else if (validationStatus === 'Endorse') {
        await speedpayService.update(sub.id, { status: 'Pending Finance Validation' as any, notes: 'Endorsed for final validation by Accountant' } as any);
        await invalidateForMutation('validateSpeedpay');
        toast.success(`Payment from ${sub.clientName} endorsed to Finance Manager.`, 'Endorsed');
      } else if (validationStatus === 'Return') {
        await speedpayService.update(sub.id, { status: 'Returned / Needs Correction' as any, notes: rejectionReason } as any);
        await invalidateForMutation('rejectSpeedpay');
        toast.error(`Payment from ${sub.clientName} returned for correction.`, 'Payment Returned');
      }
      
      setSelectedSubmission(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Action failed.', 'Validation Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    { key: 'id', label: 'TRANSACTION ID', render: (row: any) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{row.id.substring(0, 8)}...</span> },
    {
      key: 'clientName', label: 'CLIENT NAME', sortable: true,
      render: (row: any) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A' }}>{row.clientName}</div>
          {row.clientId && row.clientId !== 'UNKNOWN' && <div style={{ fontSize: 11, color: '#64748B' }}>{row.clientId}</div>}
        </div>
      )
    },
    { key: 'invoiceNumber', label: 'INVOICE NO.' },
    { key: 'paymentMethod', label: 'METHOD' },
    {
      key: 'amountPaid', label: 'AMOUNT', sortable: true,
      render: (row: any) => <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(Number(row.amountPaid))}</span>
    },
    {
      key: 'proofFileName', label: 'PROOF',
      render: (row: any) => row.proofFileName
        ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i className="ti ti-photo" style={{ fontSize: 16, color: '#0EA5E9' }} /><span style={{ fontSize: 12, color: '#64748B' }}>{row.proofFileName}</span></span>
        : <span style={{ color: '#94A3B8' }}>None</span>
    },
    {
      key: 'submittedAt', label: 'SUBMITTED',
      render: (row: any) => new Date(row.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    },
    { key: 'status', label: 'STATUS', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  const actions = [
    {
      label: 'View Details',
      icon: 'ti-eye',
      onClick: (row: any) => setSelectedSubmission(row),
    },
  ];

  const filteredData = useMemo(() => {
    let result = allEnriched;
    if (methodFilter !== 'All') {
      result = result.filter(r => r.paymentMethod === methodFilter);
    }
    if (statusFilter !== 'All') {
      result = result.filter(r => r.status === statusFilter);
    }
    if (dateFrom) {
      const fromD = new Date(dateFrom);
      result = result.filter(r => new Date(r.submittedAt) >= fromD);
    }
    if (dateTo) {
      const toD = new Date(dateTo);
      toD.setHours(23, 59, 59, 999);
      result = result.filter(r => new Date(r.submittedAt) <= toD);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(r =>
        (r.clientName || '').toLowerCase().includes(q) ||
        (r.invoiceNumber || '').toLowerCase().includes(q) ||
        (r.referenceNumber || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [allEnriched, dateFrom, dateTo, methodFilter, statusFilter, searchQuery]);

  const methodFilterOptions = [
    { label: 'GCash', value: 'GCash' },
    { label: 'Maya', value: 'Maya' },
  ];

  const statusFilterOptions = [
    { label: 'Pending Validation', value: 'Pending Validation' },
    { label: 'Validated', value: 'Validated' },
    { label: 'Rejected', value: 'Rejected' },
  ];

  const dtFilters = [
    {
      key: 'paymentMethod',
      label: 'Method',
      options: methodFilterOptions,
    },
    {
      key: 'status',
      label: 'Status',
      options: statusFilterOptions,
    }
  ];

  if (loading) {
    return <LoadingSpinner text="Loading SpeedPay validation queue..." />;
  }

  if (error) {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center', background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', margin: '20px 0' }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: '3rem', color: '#EF4444', marginBottom: 12, display: 'block' }} />
        <h3 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>SpeedPay service unavailable</h3>
        <p style={{ margin: '0 0 20px', color: '#64748B', fontSize: '0.9rem' }}>
          Unable to connect to the SpeedPay API service. The rest of FOMS remains operational.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          style={{ background: '#0D9488', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KpiCard label="Pending Validation" value={pending} icon="ti-clock" variant="warning" description={`${formatCurrency(pendingAmount)} awaiting`} hideTrend />
        <KpiCard label="Validated" value={validated} icon="ti-circle-check" variant="success" description={`Today: ${validatedToday}`} hideTrend />
        <KpiCard label="Rejected" value={rejected} icon="ti-circle-x" variant="danger" description="Total returned" hideTrend />
        <KpiCard label="Total Collected" value={formatCurrency(totalCollected)} icon="ti-cash" variant="info" description="From validated payments" hideTrend />
      </div>

      {/* SpeedPay Toolbar & Card Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Toolbar: Search, Method, Status, Date Pickers, Clear */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          background: '#fff',
          padding: '16px 20px',
          borderRadius: 14,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 280 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 260, flex: '1 1 260px' }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 16 }} />
              <input
                type="text"
                placeholder="Search by client, invoice, or reference..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 36px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  fontSize: '0.875rem',
                  color: '#0F172A',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                >
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>

            {/* Method Filter */}
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.85rem', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
            >
              <option value="All">All Methods</option>
              <option value="GCash">GCash</option>
              <option value="Maya">Maya</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.85rem', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
            >
              <option value="All">All Statuses</option>
              <option value="Pending Validation">Pending Validation</option>
              <option value="Validated">Validated</option>
              <option value="Rejected">Rejected</option>
            </select>

            {/* Date Pickers */}
            <CalendarPicker
              label="From:"
              placeholder="Start date..."
              value={dateFrom}
              onChange={setDateFrom}
              maxDate={dateTo || "2026-12-31"}
              variant="toolbar"
            />

            <CalendarPicker
              label="To:"
              placeholder="End date..."
              value={dateTo}
              onChange={setDateTo}
              minDate={dateFrom}
              maxDate="2026-12-31"
              variant="toolbar"
            />

            {(methodFilter !== 'All' || statusFilter !== 'All' || dateFrom || dateTo || searchQuery) && (
              <button
                onClick={() => { setMethodFilter('All'); setStatusFilter('All'); setDateFrom(''); setDateTo(''); setSearchQuery(''); }}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <i className="ti ti-x" /> Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Results Count Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748B' }}>
            Showing <strong style={{ color: '#0F172A' }}>{filteredData.length}</strong> SpeedPay submission{filteredData.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Cards Grid */}
        {filteredData.length === 0 ? (
          <div style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #E2E8F0',
            padding: '60px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12
          }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 28 }}>
              <i className="ti ti-wallet-off" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>No submissions found</div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748B', maxWidth: 400 }}>
              No SpeedPay transactions match your current search and filter settings.
            </p>
            {(methodFilter !== 'All' || statusFilter !== 'All' || dateFrom || dateTo || searchQuery) && (
              <button
                onClick={() => { setMethodFilter('All'); setStatusFilter('All'); setDateFrom(''); setDateTo(''); setSearchQuery(''); }}
                style={{ marginTop: 8, padding: '8px 18px', borderRadius: 8, background: '#0F172A', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 20 }}>
            {filteredData.map((sub: any) => {
              const isPending = sub.status === 'Pending Validation';
              return (
                <div
                  key={sub.id}
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
                  {/* Top Row: Method Badge + Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 9999,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      background: sub.paymentMethod === 'GCash' ? '#EFF6FF' : '#F0FDF4',
                      color: sub.paymentMethod === 'GCash' ? '#2563EB' : '#15803D',
                      border: `1px solid ${sub.paymentMethod === 'GCash' ? '#BFDBFE' : '#BBF7D0'}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <i className="ti ti-wallet" />
                      {sub.paymentMethod || 'SpeedPay'}
                    </span>
                    <StatusBadge status={sub.status} />
                  </div>

                  {/* Client Info & Linked Invoice */}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#0F172A', lineHeight: 1.3 }}>
                      {sub.clientName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: 4 }}>
                        {sub.invoiceNumber}
                      </span>
                      {sub.clientId && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>
                          • ID: {sub.clientId}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount Highlight Box */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#166534', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        AMOUNT SUBMITTED
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#15803D', marginTop: 2 }}>
                        {formatCurrency(Number(sub.amountPaid))}
                      </div>
                    </div>
                    {sub.proofFileUrl && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPreviewImage(sub.proofFileUrl!); }}
                        title="Quick View Proof"
                        style={{
                          background: '#fff',
                          border: '1px solid #BBF7D0',
                          borderRadius: 8,
                          padding: '6px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#059669',
                          cursor: 'pointer'
                        }}
                      >
                        <i className="ti ti-photo" /> Proof
                      </button>
                    )}
                  </div>

                  {/* Details Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                    padding: '10px 14px',
                    background: '#F8FAFC',
                    borderRadius: 8,
                    border: '1px solid #F1F5F9'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>REF NUMBER</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sub.referenceNumber}>
                        {sub.referenceNumber || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>SUBMISSION DATE</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginTop: 2 }}>
                        {new Date(sub.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedSubmission(sub)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: isPending ? '#0D9488' : '#0F172A',
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
                        boxShadow: isPending ? '0 2px 4px rgba(13,148,136,0.25)' : 'none'
                      }}
                    >
                      <i className={isPending ? "ti ti-shield-check" : "ti ti-eye"} />
                      {isPending ? 'Review & Validate' : 'View Payment Details'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* SpeedPay Details Modal — Redesigned Side-by-Side User-Friendly Layout */}
      {selectedSubmission && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: 24
          }}
          onClick={() => setSelectedSubmission(null)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: 1040,
              maxHeight: '92vh',
              background: '#fff',
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.35)',
              overflow: 'hidden',
              border: '1px solid #E2E8F0'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              background: '#0F172A',
              padding: '18px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              borderBottom: '1px solid #1E293B'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                  SpeedPay Submission · {selectedSubmission.id}
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', fontWeight: 800 }}>
                  Payment Information
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <StatusBadge status={selectedSubmission.status} />
                <button 
                  onClick={() => setSelectedSubmission(null)}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                >
                  <i className="ti ti-x" style={{ fontSize: 20 }} />
                </button>
              </div>
            </div>

            {/* Side-by-Side 2-Column Content */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px 28px',
              display: 'grid',
              gridTemplateColumns: '1.15fr 1fr',
              gap: 24,
              alignItems: 'start'
            }}>
              {/* LEFT COLUMN: Payment Details + Decision Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Amount Paid Highlight Card */}
                <div style={{
                  background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)',
                  border: '1px solid #A7F3D0',
                  borderLeft: '5px solid #10B981',
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#065F46', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      AMOUNT PAID
                    </div>
                    <div style={{ fontSize: 28, color: '#047857', fontWeight: 800, marginTop: 2 }}>
                      {formatCurrency(Number(selectedSubmission.amountPaid))}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#059669', fontWeight: 600, marginTop: 4 }}>
                      Submitted {selectedSubmission.submittedAt ? new Date(selectedSubmission.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      padding: '6px 14px',
                      background: '#fff',
                      border: '1px solid #A7F3D0',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#065F46',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <i className="ti ti-wallet" />
                      {selectedSubmission.paymentMethod || 'SpeedPay'}
                    </span>
                  </div>
                </div>

                {/* Client & Payment Details Card */}
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14
                }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: '#64748B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    CLIENT & INVOICE DETAILS
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>Client Name</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                        {selectedSubmission.clientName}
                      </div>
                      {selectedSubmission.clientId && (
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>ID: {selectedSubmission.clientId}</div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>Linked Invoice No.</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', marginTop: 2, background: '#fff', padding: '3px 8px', borderRadius: 4, border: '1px solid #E2E8F0', display: 'inline-block' }}>
                        {selectedSubmission.invoiceNumber}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>Payment Method</div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', marginTop: 2 }}>
                        {selectedSubmission.paymentMethod}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>Reference Number</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', fontFamily: 'monospace', marginTop: 2 }}>
                        {selectedSubmission.referenceNumber || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Validation Decision Form Card */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: '18px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                  {(selectedSubmission.status !== 'Validated' && selectedSubmission.status !== 'Rejected') ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                          Validation Decision <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <select
                          value={validationStatus}
                          onChange={(e) => setValidationStatus(e.target.value as 'Approve' | 'Reject' | 'Endorse' | 'Return')}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            border: '1px solid #CBD5E1',
                            borderRadius: 8,
                            fontSize: 13.5,
                            background: '#F8FAFC',
                            color: '#0F172A',
                            outline: 'none',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <option value="" disabled>Select Decision...</option>
                          {user?.role === Role.ACCOUNTANT ? (
                            <>
                              <option value="Endorse">Endorse for Validation</option>
                              <option value="Return">Return for Correction</option>
                            </>
                          ) : (
                            <>
                              <option value="Approve">Validate payment (Approve)</option>
                              <option value="Reject">Reject payment</option>
                            </>
                          )}
                        </select>
                      </div>

                      {(validationStatus === 'Reject' || validationStatus === 'Return') && (
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#DC2626', marginBottom: 6 }}>
                            Reason for {validationStatus === 'Reject' ? 'Rejection' : 'Return'} <span style={{ color: '#EF4444' }}>*</span>
                          </label>
                          <textarea
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                            placeholder={`Explain why this payment submission is being ${validationStatus === 'Reject' ? 'rejected' : 'returned for correction'}...`}
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              border: '1px solid #FECACA',
                              borderRadius: 8,
                              fontSize: 13,
                              outline: 'none',
                              resize: 'none',
                              boxSizing: 'border-box',
                              background: '#FFF5F5'
                            }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => setSelectedSubmission(null)}
                          style={{
                            padding: '9px 18px',
                            background: '#F1F5F9',
                            color: '#475569',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: 13
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleValidate(selectedSubmission)}
                          disabled={isSubmitting || validationStatus === '' || ((validationStatus === 'Reject' || validationStatus === 'Return') && !rejectionReason.trim())}
                          style={{
                            padding: '9px 24px',
                            borderRadius: 8,
                            border: 'none',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: (isSubmitting || validationStatus === '') ? 'not-allowed' : 'pointer',
                            background: (isSubmitting || validationStatus === '') ? '#94A3B8' : '#0D9488',
                            color: '#fff',
                            boxShadow: (isSubmitting || validationStatus === '') ? 'none' : '0 2px 4px rgba(13,148,136,0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <i className="ti ti-check" />
                          {isSubmitting ? 'Processing...' : (validationStatus === 'Approve' ? 'Confirm Validation' : 'Submit Decision')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: selectedSubmission.status === 'Validated' ? '#10B981' : '#EF4444', fontWeight: 700, fontSize: 14 }}>
                        <i className={`ti ${selectedSubmission.status === 'Validated' ? 'ti-circle-check' : 'ti-alert-circle'}`} style={{ fontSize: 20 }} />
                        <span>This submission is already <strong>{selectedSubmission.status}</strong>.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedSubmission(null)}
                        style={{
                          background: '#0F172A',
                          color: '#fff',
                          border: 'none',
                          padding: '7px 18px',
                          borderRadius: 6,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: 13
                        }}
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Proof of Payment Document Viewer */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 14,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 460
              }}>
                <div style={{
                  padding: '14px 18px',
                  background: '#fff',
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-text" style={{ color: '#0D9488', fontSize: 18 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Proof of Payment
                    </span>
                  </div>
                  {selectedSubmission.proofFileUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(selectedSubmission.proofFileUrl!)}
                      style={{
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        color: '#2563EB',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <i className="ti ti-zoom-in" /> Full Size
                    </button>
                  )}
                </div>

                <div style={{
                  flex: 1,
                  background: '#0F172A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                  position: 'relative',
                  minHeight: 340
                }}>
                  {selectedSubmission.proofFileUrl ? (
                    <div
                      onClick={() => setPreviewImage(selectedSubmission.proofFileUrl!)}
                      style={{
                        position: 'relative',
                        cursor: 'pointer',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Click to view full size"
                    >
                      <img 
                        src={selectedSubmission.proofFileUrl} 
                        alt="Proof of Payment" 
                        style={{
                          maxWidth: '100%',
                          maxHeight: '380px',
                          objectFit: 'contain',
                          borderRadius: 8,
                          boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                        }} 
                      />
                      <div style={{
                        position: 'absolute',
                        bottom: 12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.75)',
                        color: '#fff',
                        padding: '6px 14px',
                        borderRadius: 20,
                        fontSize: 11.5,
                        fontWeight: 700,
                        pointerEvents: 'none',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5
                      }}>
                        <i className="ti ti-maximize" /> Click to view full size
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                      <i className="ti ti-photo-off" style={{ fontSize: 36, display: 'block', marginBottom: 8 }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>No document proof attached</span>
                    </div>
                  )}
                </div>

                <div style={{
                  padding: '12px 18px',
                  background: '#fff',
                  borderTop: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11.5,
                  color: '#64748B'
                }}>
                  <span style={{ fontWeight: 600 }}>
                    <i className="ti ti-shield-check" style={{ color: '#10B981', marginRight: 4 }} />
                    Original Customer Receipt
                  </span>
                  <span>Verified via FOMS SpeedPay</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Size Image Preview Modal */}
      {previewImage && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', padding: 40 }} onClick={() => setPreviewImage(null)}>
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%', display: 'flex', background: '#fff', padding: 8, borderRadius: 12 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} style={{ position: 'absolute', top: -16, right: -16, background: '#EF4444', border: 'none', color: '#fff', fontSize: 24, width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>&times;</button>
            <img src={previewImage} alt="Proof of Payment Preview" style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 40px)', objectFit: 'contain', borderRadius: 8 }} />
          </div>
        </div>
      )}

      {/* Duplicate Pre-Check Modal */}
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

export default SpeedPayValidation;
