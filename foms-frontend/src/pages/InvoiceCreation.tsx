import React, { useState, useEffect, useMemo, useRef } from 'react';
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
      minWeight: primaryRate?.minimumWeight ?? 5,
      ncrBase: ncrRate?.minimumRate ?? 110,
      ncrExcess: ncrRate?.excessRate ?? 20,
      luzonBase: luzonRate?.minimumRate ?? 160,
      luzonExcess: luzonRate?.excessRate ?? 28,
      visayasBase: visayasRate?.minimumRate ?? 200,
      visayasExcess: visayasRate?.excessRate ?? 38,
      mindanaoBase: mindanaoRate?.minimumRate ?? 240,
      mindanaoExcess: mindanaoRate?.excessRate ?? 48,
      odaFee: odaRate?.minimumRate ?? 500,
      valuationRate: primaryRate?.valuationRate !== undefined ? Number(primaryRate.valuationRate) * 100 : 1,
      fuelSurchargeRate: primaryRate?.fuelSurchargeRate !== undefined ? Number(primaryRate.fuelSurchargeRate) * 100 : 5,
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
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

  const [clientViewMode, setClientViewMode] = useState<'cards' | 'table'>('cards');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [billingCycleFilter, setBillingCycleFilter] = useState('ALL');

  const filteredClientsWithPending = useMemo(() => {
    return clientsWithPending.filter(c => {
      const matchesSearch = !clientSearchQuery.trim() || c.clientName.toLowerCase().includes(clientSearchQuery.toLowerCase());
      const matchesCycle = billingCycleFilter === 'ALL' || c.schedule === billingCycleFilter;
      return matchesSearch && matchesCycle;
    });
  }, [clientsWithPending, clientSearchQuery, billingCycleFilter]);

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

  const selectAllRef = useRef<HTMLInputElement>(null);

  const filteredWaybills = useMemo(() => {
    if (!searchQuery) return clientWaybills;
    const q = searchQuery.toLowerCase();
    return clientWaybills.filter((w: any) =>
      w.waybillNumber?.toLowerCase().includes(q) ||
      w.area?.toLowerCase().includes(q) ||
      (w.deliveryDate && new Date(w.deliveryDate).toLocaleDateString('en-US').toLowerCase().includes(q))
    );
  }, [clientWaybills, searchQuery]);

  const validatedWaybills = useMemo(() => {
    return clientWaybills.filter((w: Waybill) => w.status === 'Validated' || w.status === 'Validated (CTC)');
  }, [clientWaybills]);

  const allValidatedSelected = validatedWaybills.length > 0 && validatedWaybills.every(w => selectedWaybills.includes(w.id));
  const someValidatedSelected = validatedWaybills.some(w => selectedWaybills.includes(w.id)) && !allValidatedSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someValidatedSelected;
    }
  }, [someValidatedSelected]);

  const toggleSelectAll = () => {
    if (allValidatedSelected) {
      setSelectedWaybills(prev => prev.filter(id => !validatedWaybills.some(w => w.id === id)));
    } else {
      const newSelected = Array.from(new Set([...selectedWaybills, ...validatedWaybills.map(w => w.id)]));
      setSelectedWaybills(newSelected);
    }
  };

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
        <h2 style={{ margin: 0, color: '#0F172A', fontSize: '1.4rem' }}>Invoice Saved Successfully</h2>
        <p style={{ margin: 0, color: '#64748B', textAlign: 'center', maxWidth: 420 }}>
          Your invoice has been generated and saved to the <strong>Invoice List</strong> with status <strong>Pending Approval</strong>.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/invoicing-desk')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              background: '#0D9488',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            <i className="ti ti-file-invoice" /> Go to Invoice List
          </button>
          <button
            type="button"
            onClick={() => { setSubmitted(false); setStep(1); setSelectedWaybills([]); setBillingPeriod(''); setNotes(''); setSelectedClientId(null); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              background: '#F1F5F9',
              color: '#475569',
              border: '1px solid #CBD5E1',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            <i className="ti ti-plus" /> Create Another Invoice
          </button>
        </div>
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
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header Bar with View Toggle */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '16px 24px',
            }}
          >
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                Select Client Account
              </h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                Choose an account to generate billing invoice from unbilled validated waybills.
              </p>
            </div>

            {/* View Mode Toggle: Cards / Table */}
            <div style={{ display: 'flex', background: '#F1F5F9', padding: '4px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <button
                type="button"
                onClick={() => setClientViewMode('cards')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: clientViewMode === 'cards' ? '#0D9488' : 'transparent',
                  color: clientViewMode === 'cards' ? '#FFFFFF' : '#64748B',
                  transition: 'all 0.2s ease',
                }}
              >
                <i className="ti ti-layout-grid" style={{ fontSize: '16px' }} />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setClientViewMode('table')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: clientViewMode === 'table' ? '#0D9488' : 'transparent',
                  color: clientViewMode === 'table' ? '#FFFFFF' : '#64748B',
                  transition: 'all 0.2s ease',
                }}
              >
                <i className="ti ti-table" style={{ fontSize: '16px' }} />
                Table
              </button>
            </div>
          </div>

          {clientViewMode === 'cards' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Filter bar for Cards View */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
                  {/* Search input */}
                  <div style={{ position: 'relative', minWidth: '260px', flex: 1, maxWidth: '400px' }}>
                    <i
                      className="ti ti-search"
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#94A3B8',
                        fontSize: '16px',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Search client..."
                      value={clientSearchQuery}
                      onChange={e => setClientSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 14px 8px 36px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Billing Cycle select */}
                  <select
                    value={billingCycleFilter}
                    onChange={e => setBillingCycleFilter(e.target.value)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      color: '#0F172A',
                      background: '#FFFFFF',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="ALL">Billing Cycle (All)</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Semi-monthly">Semi-monthly</option>
                    <option value="Weekly">Weekly</option>
                  </select>
                </div>

                <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
                  Showing {filteredClientsWithPending.length} client{filteredClientsWithPending.length === 1 ? '' : 's'}
                </div>
              </div>

              {/* Cards Grid */}
              {filteredClientsWithPending.length === 0 ? (
                <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
                  <i className="ti ti-users-minus" style={{ fontSize: '36px', display: 'block', marginBottom: '8px', color: '#CBD5E1' }} />
                  No clients have unbilled validated waybills matching your filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                  {filteredClientsWithPending.map(c => {
                    const clientObj = clients.find(cl => cl.id === c.id);
                    const scheduleBadge =
                      c.schedule === 'Weekly' ? { bg: '#E0F2FE', color: '#0369A1' } :
                      c.schedule === 'Semi-monthly' ? { bg: '#ECFDF5', color: '#047857' } :
                      { bg: '#F3E8FF', color: '#7E22CE' };

                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedClientId(c.id);
                          setStep(2);
                          setSelectedWaybills([]);
                          setSelectedWaybillForDetails(null);
                          setSearchQuery('');
                        }}
                        style={{
                          background: '#FFFFFF',
                          borderRadius: '16px',
                          border: '1.5px solid #E2E8F0',
                          padding: '24px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#0D9488';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(13, 148, 136, 0.1)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = '#E2E8F0';
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                        }}
                      >
                        {/* Top Row: Client Code & Billing Cycle */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0D9488', background: '#F0FDFA', border: '1px solid #CCFBF1', padding: '3px 10px', borderRadius: '6px', letterSpacing: '0.05em' }}>
                            {clientObj?.clientCode || c.id}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', background: scheduleBadge.bg, color: scheduleBadge.color }}>
                            {c.schedule}
                          </span>
                        </div>

                        {/* Client Name & Contact */}
                        <div>
                          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                            {c.clientName}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ti ti-user" style={{ fontSize: '13px' }} />
                            {clientObj?.contactPerson || 'Official Client Account'}
                          </div>
                        </div>

                        {/* Unbilled Waybills Metric Box */}
                        <div
                          style={{
                            background: '#F8FAFC',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                            padding: '14px 18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                              Unbilled Waybills
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>
                              {c.pendingCount}
                            </div>
                          </div>
                          <div style={{ width: 40, height: 40, borderRadius: '10px', background: '#ECFDF5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="ti ti-truck-delivery" style={{ fontSize: '20px' }} />
                          </div>
                        </div>

                        {/* Select Button */}
                        <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
                          <button
                            type="button"
                            style={{
                              width: '100%',
                              padding: '10px 0',
                              background: '#0D9488',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '8px',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              transition: 'background 0.2s ease',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#0F766E')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#0D9488')}
                          >
                            Select Client
                            <i className="ti ti-arrow-right" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <TableContainer style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24, flex: 1 }}>
              <DataTable
                title=""
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
                      setSelectedWaybills([]);
                      setSelectedWaybillForDetails(null);
                      setSearchQuery('');
                    }
                  }
                ]}
              />
            </TableContainer>
          )}
        </div>
      )}

      {/* Step 2: Custom Layout matching wireframe design precisely */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          
          <div style={{ display: 'flex', gap: 24, flex: 1, alignItems: 'flex-start' }}>
            {/* Custom Left Table Container */}
            {/* Custom Left Container: Modern Waybill Selection Cards (matching Accounts Receivable design) */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              {/* Header Title & Subtitle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                    Select Waybills for {invoiceClient?.name || ''}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                    Only Validated waybills can be billed. Click a waybill number to see its computation.
                  </p>
                </div>

                {/* View toggle & Billing rates */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 38,
                      padding: '0 12px',
                      background: '#fff',
                      color: '#475569',
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
                  >
                    <i className="ti ti-arrow-left" style={{ fontSize: '0.95rem' }} />
                    <span>Change Client</span>
                  </button>

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
                </div>
              </div>

              {/* Controls Bar: Search + Select All + Count */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                  <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '1rem' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search waybill no, area, date..."
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      outline: 'none',
                      color: '#0F172A',
                      transition: 'border-color 0.15s ease',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#CBD5E1'; }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2 }}
                    >
                      <i className="ti ti-x" style={{ fontSize: '0.85rem' }} />
                    </button>
                  )}
                </div>

                {/* Select All Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: validatedWaybills.length === 0 ? 'not-allowed' : 'pointer',
                      userSelect: 'none',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      padding: '7px 12px',
                      borderRadius: 8,
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#0F172A',
                    }}
                  >
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allValidatedSelected}
                      disabled={validatedWaybills.length === 0}
                      onChange={toggleSelectAll}
                      style={{ width: 16, height: 16, accentColor: '#059669', cursor: 'pointer' }}
                    />
                    <span>Select All Validated ({validatedWaybills.length})</span>
                  </label>

                  <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
                    {selectedWaybills.length} of {clientWaybills.length} selected
                  </span>
                </div>
              </div>

              {/* CARD VIEW MODE */}
              <div>
                  {filteredWaybills.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 16px', background: '#F8FAFC', borderRadius: 12, border: '1px dashed #CBD5E1' }}>
                      <i className="ti ti-search" style={{ fontSize: 36, color: '#94A3B8', display: 'block', marginBottom: 12 }} />
                      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#64748B' }}>
                        No waybills found matching your search.
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
                      {filteredWaybills.map((row: any) => {
                        const isSelected = selectedWaybills.includes(row.id);
                        const isSelectable = row.status === 'Validated';

                        return (
                          <div
                            key={row.id}
                            style={{
                              background: isSelected ? '#F0FDF4' : '#FFFFFF',
                              border: isSelected ? '2px solid #059669' : '1px solid #E2E8F0',
                              borderRadius: 12,
                              padding: '18px 20px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 12,
                              boxShadow: isSelected ? '0 2px 8px rgba(5, 150, 105, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                              transition: 'all 0.15s ease',
                              cursor: isSelectable ? 'pointer' : 'default',
                              position: 'relative',
                            }}
                            onClick={() => {
                              if (isSelectable) {
                                setSelectedWaybills(prev =>
                                  prev.includes(row.id) ? prev.filter(id => id !== row.id) : [...prev, row.id]
                                );
                              }
                            }}
                          >
                            {/* Card Top Row: Checkbox + Area & Status badges */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: isSelectable ? 'pointer' : 'default', margin: 0 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!isSelectable}
                                  onChange={() => {
                                    setSelectedWaybills(prev =>
                                      prev.includes(row.id) ? prev.filter(id => id !== row.id) : [...prev, row.id]
                                    );
                                  }}
                                  style={{
                                    width: 18,
                                    height: 18,
                                    accentColor: '#059669',
                                    cursor: isSelectable ? 'pointer' : 'not-allowed',
                                  }}
                                />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isSelected ? '#047857' : '#64748B' }}>
                                  {isSelected ? 'Selected' : 'Select'}
                                </span>
                              </label>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: '#F1F5F9',
                                  color: '#475569',
                                  letterSpacing: '0.04em',
                                }}>
                                  {row.area}
                                </span>
                                <StatusBadge status={row.status} />
                              </div>
                            </div>

                            {/* Card Heading: Waybill Number button + Delivery date */}
                            <div>
                              <button
                                type="button"
                                className="dt-waybill-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedWaybillForDetails(selectedWbDetail?.id === row.id ? null : row.id);
                                }}
                                title={`View computation for ${row.waybillNumber}`}
                                style={{
                                  fontSize: '1.1rem',
                                  fontWeight: 800,
                                  color: '#0F172A',
                                  display: 'inline-block',
                                }}
                              >
                                {row.waybillNumber}
                              </button>
                              <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <i className="ti ti-calendar" style={{ fontSize: '0.85rem' }} />
                                Delivered {new Date(row.deliveryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            </div>

                            {/* Card Metrics Row: Chargeable Wt & Total Amount */}
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: 16,
                              paddingTop: 10,
                              borderTop: '1px solid #F1F5F9',
                              marginTop: 2,
                            }}>
                              <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                  Chargeable Wt.
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                                    {row.chargeableWt?.toFixed(2) || '0.00'} kg
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '0.62rem',
                                      border: '1px solid #E2E8F0',
                                      color: '#64748B',
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    {row.weightBasis === 'Volume Weight' ? 'VOL' : 'ACT'}
                                  </span>
                                </div>
                              </div>

                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                  Amount
                                </div>
                                <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#059669', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                                  ₱{(row.baseRate || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                            </div>

                            {/* Card Footer: Selection hint & View computation button */}
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              paddingTop: 8,
                              borderTop: '1px dashed #E2E8F0',
                              marginTop: 2,
                            }}>
                              <span style={{ fontSize: '0.72rem', color: isSelected ? '#047857' : '#94A3B8', fontWeight: 600 }}>
                                {isSelected ? '✓ Included in invoice' : 'Click to select'}
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedWaybillForDetails(selectedWbDetail?.id === row.id ? null : row.id);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  color: '#0D9488',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span>View Computation</span>
                                <i className="ti ti-chevron-right" style={{ fontSize: '0.75rem' }} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              {/* Informative Footer */}
              <div style={{ padding: '12px 18px', background: '#F8FAFC', fontSize: '0.75rem', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span>Amount = freight + valuation + ODA + 12% VAT + fuel surcharge, computed per waybill.</span>
                <span style={{ fontWeight: 600 }}>Showing {filteredWaybills.length} of {clientWaybills.length} waybill(s)</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24, alignItems: 'flex-start' }}>
          <Card style={{ padding: 24 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>Invoice summary · {invoiceClient?.name}</h4>
            <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#64748B' }}>Review each waybill line before submitting. Taxes and surcharges are computed per line.</p>

            {calc.validIds.length < selectedWaybills.length && (
              <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#EF4444' }}>
                <i className="ti ti-alert-circle" /> {selectedWaybills.length - calc.validIds.length} out-of-period record(s) excluded from calculation.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              {calc.validIds.map((id, index) => {
                const detail = clientWaybills.find((w: any) => w.id === id);
                if (!detail || !detail.breakdown) return null;
                const bd = detail.breakdown;
                return (
                  <div
                    key={id}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: 12,
                      padding: 20,
                      background: '#FFFFFF',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <span
                        style={{
                          background: '#E0F2FE',
                          color: '#0284C7',
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        Waybill {index + 1}
                      </span>
                      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                        {detail.waybillNumber}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 16, columnGap: 20 }}>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 500, marginBottom: 4 }}>Area</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>{bd.area}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 500, marginBottom: 4 }}>Chargeable</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>{detail.chargeableWt.toFixed(2)} kg</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 500, marginBottom: 4 }}>Freight</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>₱{bd.freightCost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 500, marginBottom: 4 }}>Valuation</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>₱{bd.valuation.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>

                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 500, marginBottom: 4 }}>ODA</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>₱{bd.odaCharge.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 500, marginBottom: 4 }}>VAT</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>₱{bd.vat.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 500, marginBottom: 4 }}>Fuel</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>₱{bd.fuelSurcharge.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 14px' }}>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#059669', fontWeight: 600, marginBottom: 2 }}>Total</span>
                        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#059669' }}>₱{bd.grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', display: 'block' }}>Remarks (optional)</label>
              <textarea 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                placeholder="Notes, references, or special instructions for this invoice..."
                style={{ width: '100%', padding: '14px', borderRadius: 8, border: '1px solid #E2E8F0', minHeight: '140px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', fontSize: '0.9rem', color: '#1E293B' }}
              />
            </div>
          </Card>

          {/* Billing Summary Panel on the right */}
          <Card style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {/* Primary: Submit for Approval */}
              <button
                type="button"
                disabled={isSubmitting || isBillingPeriodInvalid || isDateInvalid}
                onClick={async () => {
                  if (isSubmitting) return;
                  if (isBillingPeriodInvalid) {
                    toast.error('Billing period is required.', 'Validation Error');
                    return;
                  }
                  if (isDateInvalid) {
                    toast.error('Due date cannot be earlier than issue date.', 'Validation Error');
                    return;
                  }

                  setIsSubmitting(true);
                  try {
                    if (editInvoiceId) {
                      const existing = invoices.find((i: Invoice) => i.id === editInvoiceId || i.invoiceNumber === editInvoiceId);
                      if (existing) {
                        await invoicesService.update(existing.id, {
                          waybillIds: calc.validIds,
                          amount: calc.base,
                          freightCharges: calc.base,
                          subtotal: calc.totalSubtotal,
                          vatAmount: calc.vat,
                          surchargeAmount: calc.surcharge,
                          totalAmount: calc.total,
                          billingSchedule: derivedBillingSchedule,
                          billingPeriod,
                          status: 'Pending Approval',
                          createdAt: new Date(issueDate).toISOString(),
                          billingDate: new Date(issueDate).toISOString().split('T')[0],
                          dueDate: new Date(dueDate).toISOString().split('T')[0],
                          notes,
                          appliedRates: clientRates,
                        });
                        await Promise.all(calc.validIds.map(id => waybillsService.update(id, { status: 'Billed', isBilled: true })));
                        refetchInvoices();
                        refetchWaybills();
                        setSubmitted(true);
                        toast.success('Invoice updated successfully.', 'Success');
                        return;
                      }
                    }

                    const year = new Date().getFullYear();
                    const matchingNums = invoices
                      .map(inv => {
                        const num = inv.invoiceNumber || inv.id || '';
                        const match = num.match(new RegExp(`^INV-${year}-(\\d+)$`));
                        return match ? parseInt(match[1], 10) : 0;
                      })
                      .filter(n => !isNaN(n));
                    const nextSeq = Math.max(0, ...matchingNums) + 1;
                    const invNum = `INV-${year}-${String(nextSeq).padStart(3, '0')}`;

                    await invoicesService.create({
                      invoiceNumber: invNum,
                      clientId: invoiceClient?.clientCode || invoiceClient?.id || selectedClientId || '',
                      clientName: invoiceClient?.name || '',
                      waybillIds: calc.validIds,
                      amount: calc.base,
                      freightCharges: calc.base,
                      subtotal: calc.totalSubtotal,
                      vatAmount: calc.vat,
                      surchargeAmount: calc.surcharge,
                      totalAmount: calc.total,
                      billingSchedule: derivedBillingSchedule,
                      billingPeriod,
                      status: 'Pending Approval',
                      createdBy: user?.fullName || 'User',
                      createdAt: new Date(issueDate).toISOString(),
                      billingDate: new Date(issueDate).toISOString().split('T')[0],
                      dueDate: new Date(dueDate).toISOString().split('T')[0],
                      notes,
                      appliedRates: clientRates,
                    });
                    await Promise.all(calc.validIds.map(id => waybillsService.update(id, { status: 'Billed', isBilled: true, invoiceNo: invNum })));
                    refetchInvoices();
                    refetchWaybills();
                    setSubmitted(true);
                    toast.success(`Invoice ${invNum} submitted for approval.`, 'Success');
                  } catch (err: any) {
                    console.error('Invoice creation error:', err);
                    const msg = err?.response?.data?.message || err?.message || 'Failed to submit invoice. Please try again.';
                    toast.error(msg, 'Submission Error');
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                style={{
                  width: '100%',
                  background: (isSubmitting || isSavingDraft || isBillingPeriodInvalid || isDateInvalid) ? '#94A3B8' : '#059669',
                  color: '#fff',
                  border: 'none',
                  padding: '13px 20px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: (isSubmitting || isSavingDraft || isBillingPeriodInvalid || isDateInvalid) ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: (isSubmitting || isSavingDraft || isBillingPeriodInvalid || isDateInvalid) ? 'none' : '0 2px 6px rgba(5, 150, 105, 0.28)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  if (!isSubmitting && !isSavingDraft && !isBillingPeriodInvalid && !isDateInvalid) {
                    e.currentTarget.style.background = '#047857';
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(5, 150, 105, 0.35)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSubmitting && !isSavingDraft && !isBillingPeriodInvalid && !isDateInvalid) {
                    e.currentTarget.style.background = '#059669';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(5, 150, 105, 0.28)';
                  }
                }}
              >
                {isSubmitting ? (
                  <>
                    <i className="ti ti-loader-2 ti-spin" style={{ fontSize: '1.1rem' }} />
                    <span>Submitting Invoice...</span>
                  </>
                ) : (
                  <>
                    <i className="ti ti-send" style={{ fontSize: '1.05rem' }} />
                    <span>Submit Invoice</span>
                  </>
                )}
              </button>

              {/* Secondary Actions: Back & Save as Draft */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1.5px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#F1F5F9';
                    e.currentTarget.style.borderColor = '#94A3B8';
                    e.currentTarget.style.color = '#1E293B';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#CBD5E1';
                    e.currentTarget.style.color = '#475569';
                  }}
                >
                  <i className="ti ti-arrow-left" style={{ fontSize: '0.95rem' }} />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || isSavingDraft || isBillingPeriodInvalid || isDateInvalid}
                  onClick={async () => {
                    if (isSubmitting || isSavingDraft) return;
                    if (isBillingPeriodInvalid) {
                      toast.error('Billing period is required.', 'Validation Error');
                      return;
                    }
                    if (isDateInvalid) {
                      toast.error('Due date cannot be earlier than issue date.', 'Validation Error');
                      return;
                    }

                    setIsSavingDraft(true);
                    try {
                      const year = new Date().getFullYear();
                      const matchingNums = invoices
                        .map(inv => {
                          const num = inv.invoiceNumber || inv.id || '';
                          const match = num.match(new RegExp(`^INV-${year}-(\\d+)$`));
                          return match ? parseInt(match[1], 10) : 0;
                        })
                        .filter(n => !isNaN(n));
                      const nextSeq = Math.max(0, ...matchingNums) + 1;
                      const invNum = `INV-${year}-${String(nextSeq).padStart(3, '0')}`;

                      await invoicesService.create({
                        invoiceNumber: invNum,
                        clientId: invoiceClient?.clientCode || invoiceClient?.id || selectedClientId || '',
                        clientName: invoiceClient?.name || '',
                        waybillIds: calc.validIds,
                        amount: calc.base,
                        freightCharges: calc.base,
                        subtotal: calc.totalSubtotal,
                        vatAmount: calc.vat,
                        surchargeAmount: calc.surcharge,
                        totalAmount: calc.total,
                        billingSchedule: derivedBillingSchedule,
                        billingPeriod,
                        status: 'Draft',
                        createdBy: user?.fullName || 'User',
                        createdAt: new Date(issueDate).toISOString(),
                        billingDate: new Date(issueDate).toISOString().split('T')[0],
                        dueDate: new Date(dueDate).toISOString().split('T')[0],
                        notes,
                        appliedRates: clientRates,
                      });
                      refetchInvoices();
                      refetchWaybills();
                      setSubmitted(true);
                      toast.success(`Invoice ${invNum} saved as Draft.`, 'Success');
                    } catch (err: any) {
                      console.error('Invoice creation error:', err);
                      const msg = err?.response?.data?.message || err?.message || 'Failed to save invoice draft.';
                      toast.error(msg, 'Submission Error');
                    } finally {
                      setIsSavingDraft(false);
                    }
                  }}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1.5px solid #CBD5E1',
                    background: '#F8FAFC',
                    color: '#0F766E',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: (isSubmitting || isSavingDraft || isBillingPeriodInvalid || isDateInvalid) ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isSubmitting && !isSavingDraft) {
                      e.currentTarget.style.background = '#F0FDFA';
                      e.currentTarget.style.borderColor = '#0D9488';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSubmitting && !isSavingDraft) {
                      e.currentTarget.style.background = '#F8FAFC';
                      e.currentTarget.style.borderColor = '#CBD5E1';
                    }
                  }}
                >
                  {isSavingDraft ? (
                    <>
                      <i className="ti ti-loader-2 ti-spin" style={{ fontSize: '0.95rem' }} />
                      <span>Saving Draft...</span>
                    </>
                  ) : (
                    <>
                      <i className="ti ti-device-floppy" style={{ fontSize: '0.95rem' }} />
                      <span>Save as Draft</span>
                    </>
                  )}
                </button>
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
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748B' }}>Chargeable (higher)</span>
                  <span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 600 }}>
                    {(selectedWbDetail.chargeableWt ?? 0) < 5
                      ? '5.00 kg (minimum applied)'
                      : `${selectedWbDetail.chargeableWt.toFixed(2)} kg - ${selectedWbDetail.weightBasis === 'Volume Weight' ? 'volume' : 'actual'}`}
                  </span>
                </div>
                
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
                  id="close-billing-rates-btn"
                  data-testid="close-billing-rates-btn"
                  aria-label="Close"
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
                id="close-billing-rates-bottom"
                data-testid="close-billing-rates-bottom"
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


    </div>
  );
};
export default InvoiceCreation;
