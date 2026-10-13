import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Card } from '../components/Card';
import { Button } from '../components/Buttons';
import { CustomDatePicker } from '../components/CustomDatePicker';
import { useToast } from '../components/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { waybillsService } from '../services/waybillsService';
import { invoicesService } from '../services/invoicesService';
import { clientsService } from '../services/clientsService';
import { ratesService } from '../services/ratesService';
import { auditLogsService } from '../services/auditLogsService';
import type { Waybill, Invoice, BillingRate, Client } from '../types/entities';
import { TableContainer } from '../components/TableContainer';
import { computeFreightCost } from '../utils/billing';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate } from '../utils/format';
import { useDuplicatePreCheck } from '../hooks/useDuplicatePreCheck';
import { DuplicatePreCheckModal } from '../components/ai/DuplicatePreCheckModal';
import { canCheckDuplicateInForm } from '../utils/roleAccess';

type Step = 1 | 2 | 3;

export const InvoiceCreation: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: waybillsData, refetch: refetchWaybills } = useQuery('invcreate:waybills', () => waybillsService.list({ pageSize: 200 }));
  const { data: invoicesData, refetch: refetchInvoices } = useQuery('invcreate:invoices', () => invoicesService.list({ pageSize: 200 }));
  const { data: clientsData } = useQuery('invcreate:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: ratesData } = useQuery('invcreate:rates', () => ratesService.list({ pageSize: 200 }));

  const waybills: Waybill[] = useMemo(() => waybillsData?.items || [], [waybillsData?.items]);
  const invoices: Invoice[] = useMemo(() => invoicesData?.items || [], [invoicesData?.items]);
  const clients: Client[] = useMemo(() => clientsData?.items || [], [clientsData?.items]);
  const billingRates: BillingRate[] = useMemo(() => ratesData?.items || [], [ratesData?.items]);

  const [searchParams] = useSearchParams();
  const editInvoiceId = searchParams.get('edit');
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedWaybills, setSelectedWaybills] = useState<string[]>([]);
  const [billingPeriod, setBillingPeriod] = useState('');
  
  const {
    modalState: dupModalState,
    runPreCheck,
    handleModalCancel,
    handleModalRetry,
    handleProceedWithRemarks,
    handleProceedWithManualReview,
  } = useDuplicatePreCheck();

  // To handle the details view on click
  const [selectedWaybillForDetails, setSelectedWaybillForDetails] = useState<string | null>(null);
  const [showBillingRatesModal, setShowBillingRatesModal] = useState(false);

  const invoiceClient = useMemo(() => clients.find((c: Client) => c.id === selectedClientId), [clients, selectedClientId]);

  // Client billing rates directly fetched from database via ratesService
  const clientRates = useMemo<BillingRate[]>(() => {
    if (!selectedClientId) return [];
    return billingRates.filter((r: BillingRate) => {
      const matchesClient = r.clientId === selectedClientId ||
        (invoiceClient && (r.clientId === invoiceClient.id || (r as any).clientName === invoiceClient.name)) ||
        r.clientId === 'ALL';
      return matchesClient && (r.status === 'Active' || (r as any).isActive);
    });
  }, [billingRates, selectedClientId, invoiceClient]);

  const ncrRate = useMemo(() => clientRates.find(r => r.region?.toUpperCase() === 'NCR'), [clientRates]);
  const luzonRate = useMemo(() => clientRates.find(r => r.region?.toUpperCase() === 'LUZON'), [clientRates]);
  const visayasRate = useMemo(() => clientRates.find(r => r.region?.toUpperCase() === 'VISAYAS'), [clientRates]);
  const mindanaoRate = useMemo(() => clientRates.find(r => r.region?.toUpperCase() === 'MINDANAO'), [clientRates]);
  const odaRate = useMemo(() => clientRates.find(r => r.region?.toUpperCase() === 'ODA'), [clientRates]);

  const primaryRate = ncrRate || luzonRate || visayasRate || mindanaoRate || clientRates[0];
  const rateConfig = useMemo(() => {
    return {
      minWeight: primaryRate?.minimumWeight ?? 0,
      ncrBase: ncrRate?.minimumRate ?? 0,
      ncrExcess: ncrRate?.excessRate ?? 0,
      luzonBase: luzonRate?.minimumRate ?? 0,
      luzonExcess: luzonRate?.excessRate ?? 0,
      visayasBase: visayasRate?.minimumRate ?? 0,
      visayasExcess: visayasRate?.excessRate ?? 0,
      mindanaoBase: mindanaoRate?.minimumRate ?? 0,
      mindanaoExcess: mindanaoRate?.excessRate ?? 0,
      odaFee: odaRate?.minimumRate ?? (clientRates.length > 0 ? 500 : 0),
      valuationRate: primaryRate?.valuationRate !== undefined ? Number(primaryRate.valuationRate) * 100 : 0,
      fuelSurchargeRate: primaryRate?.fuelSurchargeRate !== undefined ? Number(primaryRate.fuelSurchargeRate) * 100 : 0,
      vatRate: invoiceClient?.vatRate !== undefined && invoiceClient?.vatRate !== null
        ? Number(invoiceClient.vatRate) * 100
        : (primaryRate?.vatRate !== undefined ? Number(primaryRate.vatRate) * 100 : 12)
    };
  }, [primaryRate, ncrRate, luzonRate, visayasRate, mindanaoRate, odaRate, invoiceClient, clientRates.length]);

  const todayStr = new Date().toISOString().split('T')[0];
  const defaultDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [issueDate, setIssueDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (issueDate) {
      const d = new Date(issueDate);
      d.setDate(d.getDate() + 30);
      const nextDue = d.toISOString().split('T')[0];
      setDueDate(prev => (prev === nextDue ? prev : nextDue));
    }
  }, [issueDate]);

  // Pre-load logic for Edit
  useEffect(() => {
    if (editInvoiceId) {
      const invoice = invoices.find((i: Invoice) => i.id === editInvoiceId || i.invoiceNumber === editInvoiceId);
      if (invoice && invoice.status === 'Draft') {
        if (invoice.clientId) setSelectedClientId(invoice.clientId);
        setSelectedWaybills(invoice.waybillIds || []);
        if (invoice.billingPeriod) setBillingPeriod(invoice.billingPeriod);
        if (invoice.createdAt) setIssueDate(new Date(invoice.createdAt).toISOString().split('T')[0]);
        if (invoice.dueDate) setDueDate(new Date(invoice.dueDate).toISOString().split('T')[0]);
        setNotes(invoice.notes || '');
        setStep(2);
      }
    }
  }, [editInvoiceId, invoices]);

  // Step 1: Client Selection
  const availableWaybills = waybills.filter((w: Waybill) => {
    const isUnbilled = !w.invoiceId || w.invoiceId === editInvoiceId;
    return isUnbilled && (w.status === 'Validated' || w.status === 'Validated (CTC)');
  });

  const clientsWithPending = useMemo(() => {
    const counts = new Map<string, number>();
    availableWaybills.forEach((w: Waybill) => {
      counts.set(w.clientCode, (counts.get(w.clientCode) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([clientId, count]) => {
      const client = clients.find((c: Client) => c.id === clientId);
      return {
        id: clientId,
        clientName: client?.name || clientId,
        pendingCount: count,
        schedule: client?.billingSchedule || 'Monthly'
      };
    });
  }, [availableWaybills, clients]);

  const clientColumns = [
    { key: 'clientName', label: 'CLIENT NAME', sortable: true, render: (row: any) => <span style={{ fontWeight: 700, color: '#0F172A' }}>{row.clientName}</span> },
    { key: 'schedule', label: 'BILLING SCHEDULE' },
    { key: 'pendingCount', label: 'UNBILLED WAYBILLS' }
  ];

  // Step 2: Waybills for Client
  const clientWaybills = useMemo(() => {
    return availableWaybills.filter((w: Waybill) => w.clientCode === selectedClientId).map((wb: Waybill) => {
      let breakdown: any = null;
      try {
        breakdown = computeFreightCost(wb, clientRates);
      } catch (e) {
      }
      return {
        ...wb,
        area: breakdown?.area || '-',
        chargeableWt: breakdown?.chargeableWeight || 0,
        weightBasis: breakdown?.weightBasis || '',
        baseRate: breakdown?.grandTotal || 0,
        breakdown
      };
    });
  }, [availableWaybills, selectedClientId, clientRates]);

  const filteredWaybills = useMemo(() => {
    if (!searchQuery) return clientWaybills;
    return clientWaybills.filter((w: any) => w.waybillNumber.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [clientWaybills, searchQuery]);

  const derivedBillingSchedule = invoiceClient?.billingSchedule ?? 'Monthly';

  // Derived periods for Step 2
  const generatePeriodForDate = (dateStr: string, schedule: string) => {
    const d = new Date(dateStr);
    let start = new Date(d);
    let end = new Date(d);
    if (schedule === 'Weekly') {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
    } else if (schedule === 'Semi-monthly') {
      if (start.getDate() <= 15) {
        start.setDate(1);
        end.setDate(15);
      } else {
        start.setDate(16);
        end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      }
    } else {
      start.setDate(1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    }

    let label = "";
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      label = `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${end.getDate()}, ${end.getFullYear()}`;
    } else {
      label = `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    }
    return { label, start, end };
  };

  const [periodOptions, setPeriodOptions] = useState<{ label: string, start: Date, end: Date }[]>([]);
  const [selectedPeriodInfo, setSelectedPeriodInfo] = useState<{ label: string, start: Date, end: Date } | null>(null);

  useEffect(() => {
    if (selectedWaybills.length > 0) {
      const uniquePeriods = new Map<string, { label: string, start: Date, end: Date }>();
      selectedWaybills.forEach(id => {
        const wb = waybills.find((w: Waybill) => w.id === id);
        if (wb && wb.deliveryDate) {
          const p = generatePeriodForDate(wb.deliveryDate, derivedBillingSchedule);
          uniquePeriods.set(p.label, p);
        }
      });
      const options = Array.from(uniquePeriods.values());
      options.sort((a, b) => a.start.getTime() - b.start.getTime());
      setPeriodOptions(options);

      if (options.length > 0) {
        if (!options.some(o => o.label === billingPeriod)) {
          setBillingPeriod(options[0].label);
          setSelectedPeriodInfo(options[0]);
          setIssueDate(options[0].end.toISOString().split('T')[0]);
        }
      }
    } else {
      setPeriodOptions(prev => (prev.length === 0 ? prev : []));
      setBillingPeriod(prev => (prev === '' ? prev : ''));
      setSelectedPeriodInfo(prev => (prev === null ? prev : null));
    }
  }, [selectedWaybills, derivedBillingSchedule, waybills]);

  const isDateInvalid = new Date(dueDate) < new Date(issueDate);
  const isBillingPeriodInvalid = !billingPeriod;

  // Compute Full Invoice
  const computeInvoice = () => {
    let totalFreightCost = 0;
    let totalValuation = 0;
    let totalODA = 0;
    let totalSubtotal = 0;
    let totalVAT = 0;
    let totalFuelSurcharge = 0;
    let totalGrand = 0;
    let validIds: string[] = [];
    let lineDetails: any[] = [];

    if (selectedPeriodInfo) {
      selectedWaybills.forEach(wbId => {
        const wb = waybills.find((w: Waybill) => w.id === wbId);
        if (!wb) return;
        const p = generatePeriodForDate(wb.deliveryDate, derivedBillingSchedule);
        if (p.label !== selectedPeriodInfo.label) return;

        validIds.push(wbId);
        try {
          const breakdown = computeFreightCost(wb, clientRates);
          
          totalFreightCost   += breakdown.freightCost;
          totalValuation     += breakdown.valuation;
          totalODA           += breakdown.odaCharge;
          totalSubtotal      += breakdown.subtotal;
          totalVAT           += breakdown.vat;
          totalFuelSurcharge += breakdown.fuelSurcharge;
          totalGrand         += breakdown.grandTotal;

          lineDetails.push({ wbId, freightData: { ...breakdown, calculatedAmount: breakdown.grandTotal } });
        } catch (err) {
        }
      });
    }

    return {
      base: totalFreightCost,
      vat: totalVAT,
      surcharge: totalFuelSurcharge,
      total: totalGrand,
      totalFreightCost,
      totalValuation,
      totalODA,
      totalSubtotal,
      totalVAT,
      totalFuelSurcharge,
      totalGrand,
      validIds,
      lineDetails,
    };
  };

  const calc = computeInvoice();
  const selectedWbDetail = clientWaybills.find((w: any) => w.id === selectedWaybillForDetails);

  if (submitted) {
    return (
      <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-circle-check" style={{ fontSize: 36, color: '#10B981' }} />
        </div>
        <h2 style={{ margin: 0, color: '#0F172A', fontSize: '1.4rem' }}>Invoice Submitted for Review</h2>
        <p style={{ margin: 0, color: '#64748B', textAlign: 'center', maxWidth: 400 }}>
          Your invoice has been created and is now <strong>Pending Approval</strong> by the Head Accountant.
        </p>
        <Button
          title="Create Another Invoice"
          variant="primary"
          style={{ marginTop: 8 }}
          onClick={() => { setSubmitted(false); setStep(1); setSelectedWaybills([]); setBillingPeriod(''); setNotes(''); setSelectedClientId(null); }}
        />
      </Card>
    );
  }

  const isAllSelected = selectedWaybills.length === filteredWaybills.length && filteredWaybills.length > 0;
  const isIndeterminate = selectedWaybills.length > 0 && selectedWaybills.length < filteredWaybills.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: 'calc(100vh - 120px)' }}>
      
      {/* Progress Steps */}
        <Card noPadding style={{ padding: '16px 32px', flexShrink: 0, marginBottom: 16 }}>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ position: 'absolute', top: '16px', left: '50px', right: '50px', height: '2px', background: '#E2E8F0', zIndex: 0 }} />
            <div style={{ position: 'absolute', top: '16px', left: '50px', height: '2px', background: '#059669', zIndex: 1, width: `calc(${((step - 1) / 2) * 100}% - ${((step - 1) / 2) * 100}px)`, transition: 'width 0.3s ease' }} />

            {([{ n: 1, label: 'Select Account', icon: 'ti-users' }, { n: 2, label: 'Waybills & Rates', icon: 'ti-calculator' }, { n: 3, label: 'Confirm & Submit', icon: 'ti-send' }] as const).map(({ n, label, icon }) => {
              const isCompleted = step > n;
              const isActive = step === n;

              return (
                <div
                  key={n}
                  onClick={() => {
                    if (n === 1) setStep(1);
                    else if (n === 2 && selectedClientId) setStep(2);
                    else if (n === 3 && selectedWaybills.length > 0 && !isBillingPeriodInvalid && !isDateInvalid) setStep(3);
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    cursor: (n === 1 || selectedClientId) ? 'pointer' : 'not-allowed',
                    position: 'relative', zIndex: 2, width: '120px'
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isCompleted || isActive ? '#059669' : '#F8FAFC',
                    color: isCompleted || isActive ? '#fff' : '#94A3B8',
                    border: `2px solid ${isCompleted || isActive ? '#059669' : '#E2E8F0'}`,
                    fontWeight: 700, fontSize: '1rem', transition: 'all 0.2s',
                    boxShadow: isActive ? '0 0 0 4px #D1FAE5' : 'none'
                  }}>
                    <i className={`ti ${isCompleted ? 'ti-check' : icon}`} />
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: isActive ? 700 : 600,
                    color: isCompleted || isActive ? '#059669' : '#64748B',
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

      {/* Step 1: Select Client */}
      {step === 1 && (
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TableContainer style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24, flex: 1 }}>
            <DataTable
              title="Select Client Account"
              data={clientsWithPending}
              columns={clientColumns}
              rowKey="id"
              searchPlaceholder="Search client..."
              searchFields={['clientName']}
              defaultPageSize={10}
              emptyMessage="No clients have unbilled validated waybills."
              filters={[
                {
                  key: 'schedule',
                  label: 'Billing Cycle',
                  options: [
                    { label: 'Monthly', value: 'Monthly' },
                    { label: 'Semi-monthly', value: 'Semi-monthly' },
                    { label: 'Weekly', value: 'Weekly' }
                  ]
                }
              ]}
              actions={[
                {
                  label: 'Select Client',
                  icon: 'ti-arrow-right',
                  onClick: (row: any) => {
                    setSelectedClientId(row.id);
                    setStep(2);
                    
                    const clientWBs = availableWaybills.filter((w: Waybill) => w.clientCode === row.id);
                    const validWBs = clientWBs.filter((w: Waybill) => w.status === 'Validated');
                    setSelectedWaybills(validWBs.map((w: Waybill) => w.id));
                    
                    setSelectedWaybillForDetails(null);
                    setSearchQuery('');
                  }
                }
              ]}
            />
          </TableContainer>
        </div>
      )}

      {/* Step 2: Custom Layout matching wireframe design precisely */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          
          <div style={{ display: 'flex', gap: 24, flex: 1, alignItems: 'flex-start' }}>
            {/* Custom Left Table Container */}
            {/* Custom Left Table Container replaced by DataTable */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 24 }}>
              <DataTable
                title={`Select Waybills for ${invoiceClient?.name || ''}`}
                subtitle="Only Validated waybills can be billed. Click a row to see its computation."
                searchPlaceholder="Search waybill no..."
                searchFields={['waybillNumber', 'area', 'deliveryDate']}
                rowKey="id"
                data={clientWaybills}
                selectable
                hideBulkActionBar
                selectedKeys={selectedWaybills}
                onSelectionChange={(keys) => setSelectedWaybills(keys as string[])}
                isRowSelectable={(w: any) => w.status === 'Validated'}
                onRowClick={(w: any) => setSelectedWaybillForDetails(selectedWbDetail?.id === w.id ? null : w.id)}
                customFilters={
                  <button
                    type="button"
                    onClick={() => setShowBillingRatesModal(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      height: 38,
                      padding: '0 14px',
                      background: '#fff',
                      color: '#0F172A',
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F8FAFC';
                      e.currentTarget.style.borderColor = '#94A3B8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.borderColor = '#CBD5E1';
                    }}
                    title="View agreed billing rates"
                  >
                    <i className="ti ti-receipt-tax" style={{ fontSize: '1.05rem', color: '#4F46E5' }} />
                    <span>Billing Rates</span>
                    <span style={{ fontSize: '0.65rem', border: '1px solid #E2E8F0', color: '#64748B', padding: '1px 6px', borderRadius: 4, fontWeight: 700, letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <i className="ti ti-lock" style={{ fontSize: '0.65rem' }} /> READ-ONLY
                    </span>
                  </button>
                }
                columns={[
                  { key: 'waybillNumber', label: 'WAYBILL NO.', sortable: true, render: (row: any) => <span style={{ borderBottom: '1px dotted #CBD5E1', cursor: 'pointer', color: '#0F172A', fontWeight: 600 }}>{row.waybillNumber}</span> },
                  { key: 'deliveryDate', label: 'DELIVERY DATE', sortable: true, render: (row: any) => new Date(row.deliveryDate).toLocaleDateString('en-US') },
                  { key: 'area', label: 'AREA', sortable: true, render: (row: any) => row.area === 'NCR' ? 'NCR/Metro Manila' : row.area },
                  { key: 'weight', label: 'CHARGEABLE WT.', render: (row: any) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#0F172A', fontWeight: 500 }}>{row.chargeableWt?.toFixed(2) || '0.00'} kg</span>
                      <span style={{ fontSize: '0.65rem', border: '1px solid #E2E8F0', color: '#64748B', padding: '1px 6px', borderRadius: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                        {row.weightBasis === 'Volume Weight' ? 'VOLUME' : 'ACTUAL'}
                      </span>
                    </div>
                  )},
                  { key: 'status', label: 'DOC STATUS', render: (row: any) => <StatusBadge status={row.status} /> },
                  { key: 'amount', label: 'AMOUNT', align: 'right', render: (row: any) => (
                    <span style={{ color: '#0F172A', fontWeight: 700 }}>
                      ₱{(row.baseRate || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}
                    </span>
                  )}
                ]}
              />
              <div style={{ padding: '12px 20px', background: '#fff', fontSize: '0.75rem', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, marginTop: 12 }}>
                Amount = freight + valuation + ODA + 12% VAT + fuel surcharge, computed per waybill.
              </div>
            </div>

            {/* Right Panel: PATAYO Billing Summary */}
            <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              
              {/* QA-004: Billing Summary Card (PATAYO - Vertically stacked itemized breakdown) */}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-calculator" style={{ fontSize: 18, color: '#059669' }} />
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>Billing Summary</h4>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', background: '#F1F5F9', padding: '3px 8px', borderRadius: 12 }}>
                    {selectedWaybills.length} Selected
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Base Freight Charges</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalFreightCost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Valuation Fee ({rateConfig.valuationRate}%)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalValuation.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Out of Delivery Area (ODA)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalODA.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Subtotal row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px 12px', borderRadius: 6, margin: '2px 0' }}>
                    <span style={{ color: '#0F172A', fontSize: '0.88rem', fontWeight: 700 }}>Subtotal (Net Amount)</span>
                    <span style={{ color: '#0F172A', fontSize: '0.92rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalSubtotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Value-Added Tax (12% VAT)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalVAT.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Fuel Surcharge ({rateConfig.fuelSurchargeRate}%)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalFuelSurcharge.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Grand Total prominent banner */}
                  <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: '0.8rem', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grand Total</span>
                      <span style={{ fontSize: '0.7rem', color: '#059669' }}>Total Amount Due</span>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1.35rem', color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalGrand.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedWaybills.length === 0) {
                      toast.error('Please select at least one waybill.', 'Validation Error');
                      return;
                    }
                    setStep(3);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: selectedWaybills.length === 0 ? '#94A3B8' : '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    cursor: selectedWaybills.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: selectedWaybills.length === 0 ? 'none' : '0 2px 4px rgba(5, 150, 105, 0.2)'
                  }}
                >
                  <span>Next: Confirm & Submit</span>
                  <i className="ti ti-arrow-right" style={{ fontSize: '1rem' }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Include Billing Period Config Here */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#EEF2FF', color: '#4F46E5', width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-calendar" style={{ fontSize: 20 }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Billing Timeline</h3>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>Billing Period</label>
                <div style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontWeight: 500, fontSize: '0.9rem' }}>
                  {billingPeriod || 'N/A'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>Issue Date</label>
                <div style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontWeight: 500, fontSize: '0.9rem' }}>
                  {issueDate ? new Date(issueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>Due Date (30 Days)</label>
                <div style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontWeight: 500, fontSize: '0.9rem' }}>
                  {dueDate ? new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
                </div>
              </div>
            </div>

            {calc.validIds.length < selectedWaybills.length && (
              <p style={{ margin: '16px 0 0', fontSize: '0.8rem', color: '#EF4444' }}>
                <i className="ti ti-alert-circle" /> {selectedWaybills.length - calc.validIds.length} out-of-period record(s) excluded from calculation.
              </p>
            )}
          </Card>

          <Card style={{ padding: 24 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>Invoice summary · {invoiceClient?.name}</h4>
            <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#64748B' }}>Review each waybill line before submitting. Taxes and surcharges are computed per line.</p>
            
            <div style={{ overflowX: 'auto', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingBottom: 12, color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>WAYBILL NO.</th>
                    <th style={{ textAlign: 'left', paddingBottom: 12, color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>AREA</th>
                    <th style={{ textAlign: 'left', paddingBottom: 12, color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>CHARGEABLE</th>
                    <th style={{ textAlign: 'right', paddingBottom: 12, color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>FREIGHT</th>
                    <th style={{ textAlign: 'right', paddingBottom: 12, color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>VALUATION</th>
                    <th style={{ textAlign: 'right', paddingBottom: 12, color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>ODA</th>
                    <th style={{ textAlign: 'right', paddingBottom: 12, color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>VAT</th>
                    <th style={{ textAlign: 'right', paddingBottom: 12, color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>FUEL</th>
                    <th style={{ textAlign: 'right', paddingBottom: 12, color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.validIds.map((id) => {
                    const detail = clientWaybills.find((w: any) => w.id === id);
                    if (!detail || !detail.breakdown) return null;
                    const bd = detail.breakdown;
                    return (
                      <tr key={id}>
                        <td style={{ padding: '12px 0', color: '#0F172A', fontWeight: 600, borderBottom: '1px solid #F1F5F9' }}>{detail.waybillNumber}</td>
                        <td style={{ padding: '12px 0', color: '#475569', borderBottom: '1px solid #F1F5F9' }}>{bd.area}</td>
                        <td style={{ padding: '12px 0', color: '#475569', borderBottom: '1px solid #F1F5F9' }}>{detail.chargeableWt.toFixed(2)} kg</td>
                        <td style={{ padding: '12px 0', color: '#0F172A', fontWeight: 500, textAlign: 'right', borderBottom: '1px solid #F1F5F9' }}>₱{bd.freightCost.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td style={{ padding: '12px 0', color: '#0F172A', fontWeight: 500, textAlign: 'right', borderBottom: '1px solid #F1F5F9' }}>₱{bd.valuation.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td style={{ padding: '12px 0', color: '#0F172A', fontWeight: 500, textAlign: 'right', borderBottom: '1px solid #F1F5F9' }}>₱{bd.odaCharge.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td style={{ padding: '12px 0', color: '#0F172A', fontWeight: 500, textAlign: 'right', borderBottom: '1px solid #F1F5F9' }}>₱{bd.vat.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td style={{ padding: '12px 0', color: '#0F172A', fontWeight: 500, textAlign: 'right', borderBottom: '1px solid #F1F5F9' }}>₱{bd.fuelSurcharge.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td style={{ padding: '12px 0', color: '#059669', fontWeight: 700, textAlign: 'right', borderBottom: '1px solid #F1F5F9' }}>₱{bd.grandTotal.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: 32, alignItems: 'flex-start', marginTop: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', display: 'block' }}>Remarks (optional)</label>
                <textarea 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  placeholder="Notes, references, or special instructions for this invoice..."
                  style={{ width: '100%', padding: '14px', borderRadius: 8, border: '1px solid #E2E8F0', minHeight: '140px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', fontSize: '0.9rem', color: '#1E293B' }}
                />
              </div>

              {/* QA-004: Billing Summary with Section Title, clear headings, proper spacing, and traceable peso values */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <h4 style={{ margin: '0 0 2px', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="ti ti-calculator" style={{ fontSize: 18, color: '#059669' }} />
                      Billing Summary
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Traceable computation breakdown</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', background: '#E2E8F0', padding: '3px 10px', borderRadius: 12 }}>
                    {calc.validIds.length} Waybill(s)
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Base Freight Charges</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalFreightCost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Valuation Fee ({rateConfig.valuationRate}%)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalValuation.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Out of Delivery Area (ODA)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalODA.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Subtotal row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '10px 14px', borderRadius: 6, margin: '2px 0' }}>
                    <span style={{ color: '#0F172A', fontSize: '0.9rem', fontWeight: 700 }}>Subtotal (Net Amount)</span>
                    <span style={{ color: '#0F172A', fontSize: '0.95rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalSubtotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Value-Added Tax (12% VAT)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalVAT.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 500 }}>Fuel Surcharge ({rateConfig.fuelSurchargeRate}%)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalFuelSurcharge.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Grand total prominent banner */}
                  <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: '0.85rem', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grand Total</span>
                      <span style={{ fontSize: '0.75rem', color: '#059669' }}>Total Amount Due</span>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1.45rem', color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
                      ₱{calc.totalGrand.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                  <Button title="Back" variant="secondary" onClick={() => setStep(2)} />
                  <button
                    disabled={isBillingPeriodInvalid || isDateInvalid}
                    onClick={async () => {
                      if (editInvoiceId) {
                        const existing = invoices.find((i: Invoice) => i.id === editInvoiceId || i.invoiceNumber === editInvoiceId);
                        if (existing) {
                          await invoicesService.update(existing.id, {
                            waybillIds: calc.validIds,
                            amount: calc.base,
                            vatAmount: calc.vat,
                            surchargeAmount: calc.surcharge,
                            totalAmount: calc.total,
                            billingSchedule: derivedBillingSchedule,
                            billingPeriod,
                            status: 'Pending Approval',
                            createdAt: new Date(issueDate).toISOString(),
                            dueDate: new Date(dueDate).toISOString(),
                            notes,
                            appliedRates: clientRates,
                          });
                          await Promise.all(calc.validIds.map(id => waybillsService.update(id, { status: 'Billed' })));
                          refetchInvoices();
                          refetchWaybills();
                          setSubmitted(true);
                          return;
                        }
                      }

                      const invNum = `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`;
                      if (canCheckDuplicateInForm(user?.role, 'invoice')) {
                        const check = await runPreCheck({
                          entityType: 'invoice',
                          fieldName: 'invoiceNumber',
                          fieldValue: invNum,
                        });
                        if (!check.canProceed) return;
                      }

                      await invoicesService.create({
                        invoiceNumber: invNum,
                        clientId: invoiceClient?.id ?? '',
                        waybillIds: calc.validIds,
                        amount: calc.base,
                        vatAmount: calc.vat,
                        surchargeAmount: calc.surcharge,
                        totalAmount: calc.total,
                        billingSchedule: derivedBillingSchedule,
                        billingPeriod,
                        status: 'Pending Approval',
                        createdBy: user?.fullName || 'User',
                        createdAt: new Date(issueDate).toISOString(),
                        dueDate: new Date(dueDate).toISOString(),
                        notes,
                        appliedRates: clientRates,
                      });
                      await Promise.all(calc.validIds.map(id => waybillsService.update(id, { status: 'Billed' })));
                      refetchInvoices();
                      refetchWaybills();
                      setSubmitted(true);
                      toast.success(`Invoice ${invNum} submitted for approval.`, 'Success');
                    }}
                    style={{
                      background: (isBillingPeriodInvalid || isDateInvalid) ? '#94A3B8' : '#059669',
                      color: '#fff',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: (isBillingPeriodInvalid || isDateInvalid) ? 'not-allowed' : 'pointer',
                      flex: 1
                    }}
                  >
                    Submit Invoice
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
      {/* SLIDE-OVER MODAL FOR WAYBILL DETAILS */}
      {selectedWbDetail && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} 
          onClick={() => setSelectedWaybillForDetails(null)}
        >
          <div 
            style={{ width: 750, maxWidth: '95%', background: '#fff', maxHeight: '90vh', borderRadius: 12, overflowY: 'auto', padding: 32, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} 
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>{selectedWbDetail.waybillNumber}</h4>
                <StatusBadge status={selectedWbDetail.status} />
              </div>
              <button onClick={() => setSelectedWaybillForDetails(null)} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, color: '#64748B', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-x" style={{ fontSize: '1.1rem' }} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>WAYBILL DETAILS</span>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Sender</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500, textAlign: 'right' }}>{selectedWbDetail.senderName || invoiceClient?.name}{selectedWbDetail.senderContact ? ` • ${selectedWbDetail.senderContact}` : ''}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Receiver</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500, textAlign: 'right' }}>{selectedWbDetail.receiverName}{selectedWbDetail.receiverContact ? ` • ${selectedWbDetail.receiverContact}` : ''}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Delivery address</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{selectedWbDetail.receiverAddress}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Service</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.deliveryType || 'Delivery'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Courier</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.assignedCourier || '-'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Delivery date</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{new Date(selectedWbDetail.deliveryDate).toLocaleDateString('en-US')}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Items</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.itemQuantity} box{(selectedWbDetail as any).itemDimensions ? ` • ${(selectedWbDetail as any).itemDimensions.length}x${(selectedWbDetail as any).itemDimensions.width}x${(selectedWbDetail as any).itemDimensions.height} cm` : ''}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Declared value</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.declaredValue ? `₱${selectedWbDetail.declaredValue.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Remarks</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.specialInstructions || '-'}</span></div>
            </div>

            {selectedWbDetail.breakdown && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #E2E8F0', paddingTop: 24 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>COMPUTATION - {(selectedWbDetail.area === 'NCR' ? 'NCR / METRO MANILA' : selectedWbDetail.area).toUpperCase()}</span>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Actual weight</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.breakdown.actualWeight.toFixed(2)} kg</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Volume weight</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.breakdown.volumeWeight.toFixed(2)} kg</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Chargeable (higher)</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 600 }}>{selectedWbDetail.chargeableWt.toFixed(2)} kg - {selectedWbDetail.weightBasis === 'Volume Weight' ? 'volume' : 'actual'}</span></div>
                
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.85rem', color: '#64748B' }}>Freight</span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: '0.85rem', color: '#0F172A', fontWeight: 600 }}>₱{selectedWbDetail.breakdown.freightCost.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
                      {selectedWbDetail.breakdown.excessKgs > 0 && (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#94A3B8' }}>
                          ₱{selectedWbDetail.breakdown.minimumRate.toFixed(2)} + ({selectedWbDetail.chargeableWt.toFixed(2)} - {rateConfig.minWeight}) x ₱{selectedWbDetail.breakdown.excessRate.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Valuation ({rateConfig.valuationRate}%)</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.breakdown.valuation ? `₱${selectedWbDetail.breakdown.valuation.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>ODA</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.breakdown.odaCharge ? `₱${selectedWbDetail.breakdown.odaCharge.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}</span></div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px dashed #E2E8F0' }}><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 700 }}>Subtotal</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 700 }}>{selectedWbDetail.breakdown.subtotal ? `₱${selectedWbDetail.breakdown.subtotal.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}</span></div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>VAT ({rateConfig.vatRate}%)</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.breakdown.vat ? `₱${selectedWbDetail.breakdown.vat.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.85rem', color: '#64748B' }}>Fuel surcharge ({rateConfig.fuelSurchargeRate}% of freight)</span><span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 500 }}>{selectedWbDetail.breakdown.fuelSurcharge ? `₱${selectedWbDetail.breakdown.fuelSurcharge.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}</span></div>
                </div>

                <div style={{ height: 2, background: '#0F172A', margin: '16px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0F172A' }}>Grand total</span>
                  <span style={{ fontWeight: 800, fontSize: '1.4rem', color: '#059669' }}>{selectedWbDetail.breakdown.grandTotal ? `₱${selectedWbDetail.breakdown.grandTotal.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Billing Rates Popup Modal */}
      {showBillingRatesModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20
          }}
          onClick={() => setShowBillingRatesModal(false)}
        >
          <div
            style={{
              width: 380,
              maxWidth: '95%',
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 20px 40px -8px rgba(0,0,0,0.2), 0 8px 16px -4px rgba(0,0,0,0.1)',
              border: '1px solid #E2E8F0',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>Billing Rates</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.65rem', border: '1px solid #E2E8F0', color: '#64748B', padding: '3px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-lock" /> READ-ONLY
                </span>
                <button
                  type="button"
                  onClick={() => setShowBillingRatesModal(false)}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 6,
                    color: '#64748B',
                    cursor: 'pointer',
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                  title="Close"
                >
                  <i className="ti ti-x" style={{ fontSize: '1rem' }} />
                </button>
              </div>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#64748B', lineHeight: 1.4 }}>
              Agreed rates for <strong style={{ color: '#0F172A' }}>{invoiceClient?.name || 'Client'}</strong>, applied automatically.
            </p>

            {clientRates.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', margin: '16px 0' }}>
                <i className="ti ti-database-off" style={{ fontSize: 32, color: '#94A3B8', display: 'block', marginBottom: 8 }} />
                <span style={{ fontSize: '0.88rem', color: '#64748B', fontWeight: 600 }}>No agreed billing rates found in the database for {invoiceClient?.name || 'this client'}.</span>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#94A3B8' }}>Please configure rates in Rate Configuration first.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>Minimum weight</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A' }}>{rateConfig.minWeight} kg</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>NCR / Metro Manila</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>Base (≤ {rateConfig.minWeight}kg)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{rateConfig.ncrBase.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>Excess / kg</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{rateConfig.ncrExcess.toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>Luzon</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>Base (≤ {rateConfig.minWeight}kg)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{rateConfig.luzonBase.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>Excess / kg</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{rateConfig.luzonExcess.toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>Visayas / Mindanao</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>Base (≤ {rateConfig.minWeight}kg)</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{rateConfig.visayasBase.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>Excess / kg</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{rateConfig.visayasExcess.toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>ODA fee</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{rateConfig.odaFee.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>Valuation</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>{rateConfig.valuationRate}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>VAT</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>{rateConfig.vatRate}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>Fuel surcharge</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>{rateConfig.fuelSurchargeRate}%</span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setShowBillingRatesModal(false)}
                style={{
                  width: '100%',
                  padding: '9px',
                  background: '#0F172A',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
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
export default InvoiceCreation;
