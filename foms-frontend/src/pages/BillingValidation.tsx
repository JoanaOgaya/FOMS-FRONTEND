import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { waybillsService } from '../services/waybillsService';
import { ratesService } from '../services/ratesService';
import { clientsService } from '../services/clientsService';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/Buttons';
import { Card } from '../components/Card';
import { TableContainer } from '../components/TableContainer';
import { computeFreightCost, detectArea, type FreightBreakdown } from '../utils/billing';
import { formatCurrency, formatDate } from '../utils/format';
import type { BillingRecord, Waybill, BillingRate, Client } from '../types/entities';

type BillingTab = 'unbilled' | 'pending' | 'approved' | 'returned';

export const BillingValidation: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: waybillsData, refetch: refetchWaybills } = useQuery('billing:waybills', () => waybillsService.list({ pageSize: 100 }));
  const { data: ratesData } = useQuery('billing:rates', () => ratesService.list({ pageSize: 100 }));
  const { data: clientsData } = useQuery('billing:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: recordsData, refetch: refetchRecords } = useQuery('billing:records', () => ratesService.records.list({ pageSize: 100 }));

  const waybills: Waybill[] = waybillsData?.items || [];
  const billingRates: BillingRate[] = ratesData?.items || [];
  const clients: Client[] = clientsData?.items || [];

  const isFinancialManager = user?.role === 'FINANCIAL_MANAGER';
  const canCompute = !isFinancialManager;
  const isHead = user?.role === 'HEAD_ACCOUNTANT' || user?.role === 'FINANCIAL_MANAGER';

  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<BillingTab>(canCompute ? 'unbilled' : 'pending');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardClientFilter, setCardClientFilter] = useState('');

  // Modals
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchRemarks, setBatchRemarks] = useState('');
  const [breakdownRecord, setBreakdownWaybill] = useState<{ waybillNumber: string; clientName: string; breakdown: FreightBreakdown } | null>(null);

  // Return modal for Finance Manager
  const [rejectingRecordId, setRejectingRecordId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (isFinancialManager && activeTab === 'unbilled') {
      setActiveTab('pending');
    }
  }, [isFinancialManager, activeTab]);

  useEffect(() => {
    if (recordsData?.items) {
      setBillingRecords(recordsData.items);
    }
  }, [recordsData?.items]);

  // Helper to get applicable active rates for a client
  const getRatesForClient = (clientCode: string): BillingRate[] => {
    const specific = billingRates.filter(r => r.clientId === clientCode && r.status === 'Active');
    if (specific.length > 0) return specific;
    const all = billingRates.filter(r => r.clientId === 'ALL' && r.status === 'Active');
    if (all.length > 0) return all;
    return billingRates.filter(r => r.status === 'Active');
  };

  // 1. Available Unbilled Waybills (Validated POD, not yet in billing records)
  const availableWaybills = useMemo(() => {
    return waybills.filter(wb => 
      wb.status === 'Validated' && 
      !billingRecords.some(br => br.waybillId === wb.id)
    );
  }, [waybills, billingRecords]);

  // Precomputed unbilled waybills
  const calculatedWaybills = useMemo(() => {
    return availableWaybills.map(wb => {
      const client = clients.find(c => c.id === wb.clientCode);
      const clientRates = getRatesForClient(wb.clientCode);
      let breakdown: FreightBreakdown;
      try {
        breakdown = computeFreightCost(wb, clientRates);
  // 1. Validated Waybills WITHOUT Billing Records (For Accountant to Submit)
  const availableWaybills = waybills.filter(wb => 
    !wb.isBilled &&
    (wb.status === 'Validated' || wb.podStatus === 'Validated' || (wb.deliveryStatus === 'Delivered' && !wb.isBilled)) && 
    !billingRecords.some(br => String(br.waybillId) === String(wb.id) || String(br.waybillId) === String(wb.waybillNumber))
  );

  const handleSubmitBilling = async () => {
    if (selectedIds.length === 0) return;
    
    let successCount = 0;
    let errorCount = 0;
    const newRecords: BillingRecord[] = [];

    for (const wbId of selectedIds) {
      const wb = waybills.find(w => String(w.id) === String(wbId));
      if (!wb) continue;
      
      try {
        const clientRates = billingRates.filter(r => 
          (r.clientId === wb.clientCode || r.clientId === wb.clientId ||
           (wb.clientCode === 'CA-001' && r.clientId === 'LZD-001') ||
           (wb.clientCode === 'CA-002' && r.clientId === 'SHP-001') ||
           (wb.clientCode === 'CA-003' && r.clientId === 'TKT-001') ||
           (wb.clientCode === 'LZD-001' && r.clientId === 'CA-001') ||
           (wb.clientCode === 'SHP-001' && r.clientId === 'CA-002')) && 
          r.status === 'Active'
        );
        const activeRates = clientRates.length > 0 ? clientRates : billingRates.filter(r => r.status === 'Active');
        const freightData = computeFreightCost(wb, activeRates);
        const rateUsed = activeRates.find(r => r.region.toUpperCase() === (wb.destinationArea || wb.deliveryArea || 'NCR').toUpperCase()) || activeRates[0];
        
        if (rateUsed) {
          const newRecord: BillingRecord = {
            id: `BR-${Date.now()}-${wbId}`,
            waybillId: wb.id,
            clientId: wb.clientCode || wb.clientId || 'CA-001',
            rateId: rateUsed.id,
            volumeWeight: freightData.volumeWeight,
            actualWeight: freightData.actualWeight,
            chargeableWeight: freightData.chargeableWeight,
            freightCost: freightData.freightCost,
            valuation: freightData.valuation,
            odaCharge: freightData.odaCharge,
            subtotal: freightData.subtotal,
            vat: freightData.vat,
            fuelSurcharge: freightData.fuelSurcharge,
            grandTotal: freightData.grandTotal,
            status: 'Pending Review',
            computedBy: user?.fullName || 'User',
            computedAt: new Date().toISOString(),
          };
          newRecords.push(newRecord);
          successCount++;
        }
      } catch {
        breakdown = {
          area: detectArea(wb),
          actualWeight: Number(wb.itemWeight) || 0,
          volumeWeight: 0,
          chargeableWeight: Number(wb.itemWeight) || 0,
          weightBasis: 'Actual Weight',
          minimumRate: 100,
          excessRate: 25,
          excessKgs: 0,
          freightCost: 100,
          declaredValue: wb.declaredValue || 0,
          valuation: (wb.declaredValue || 0) * 0.01,
          odaCharge: 0,
          subtotal: 100,
          vat: 12,
          fuelSurcharge: 15,
          grandTotal: 127,
          calculatedAmount: 127,
        };
      }
      return {
        ...wb,
        clientName: client?.name || wb.clientCode,
        breakdown,
        estimatedAmount: breakdown.grandTotal,
        detectedArea: breakdown.area,
      };
    });
  }, [availableWaybills, clients, billingRates]);

  // 2. Partitioned Billing Records
  const pendingRecords = useMemo(() => billingRecords.filter(br => br.status === 'Pending Review'), [billingRecords]);
  const approvedRecords = useMemo(() => billingRecords.filter(br => br.status === 'Approved'), [billingRecords]);
  const returnedRecords = useMemo(() => billingRecords.filter(br => br.status === 'Returned'), [billingRecords]);

  // Selected Waybills Batch Calculation
  const selectedCalculatedWaybills = useMemo(() => {
    return calculatedWaybills.filter(wb => selectedIds.includes(wb.id));
  }, [calculatedWaybills, selectedIds]);

  const batchTotals = useMemo(() => {
    return selectedCalculatedWaybills.reduce(
      (acc, curr) => ({
        count: acc.count + 1,
        totalChargeableWeight: acc.totalChargeableWeight + curr.breakdown.chargeableWeight,
        totalFreightCost: acc.totalFreightCost + curr.breakdown.freightCost,
        totalValuation: acc.totalValuation + curr.breakdown.valuation,
        totalVat: acc.totalVat + curr.breakdown.vat,
        totalFuelSurcharge: acc.totalFuelSurcharge + curr.breakdown.fuelSurcharge,
        grandTotal: acc.grandTotal + curr.breakdown.grandTotal,
      }),
      { count: 0, totalChargeableWeight: 0, totalFreightCost: 0, totalValuation: 0, totalVat: 0, totalFuelSurcharge: 0, grandTotal: 0 }
    );
  }, [selectedCalculatedWaybills]);

  // Client filter options for DataTable
  const clientFilterOptions = useMemo(() => {
    return clients.map(c => ({ label: c.name, value: c.name }));
  }, [clients]);

  // Filtered lists for cards view
  const filteredCalculatedWaybills = useMemo(() => {
    return calculatedWaybills.filter(wb => {
      const q = cardSearchQuery.toLowerCase();
      const matchSearch = !q || wb.waybillNumber.toLowerCase().includes(q) || (wb.clientName && wb.clientName.toLowerCase().includes(q));
      const matchClient = !cardClientFilter || wb.clientName === cardClientFilter;
      return matchSearch && matchClient;
    });
  }, [calculatedWaybills, cardSearchQuery, cardClientFilter]);

  const mappedPending = useMemo(() => {
    return pendingRecords.map(br => {
      const wb = waybills.find(w => w.id === br.waybillId);
      const client = clients.find(c => c.id === br.clientId);
      return {
        ...br,
        waybillNumber: wb?.waybillNumber || br.waybillId,
        clientName: client?.name || br.clientId,
        date: br.computedAt,
      };
    }).filter(row => {
      const q = cardSearchQuery.toLowerCase();
      return !q || row.waybillNumber.toLowerCase().includes(q) || row.clientName.toLowerCase().includes(q);
    });
  }, [pendingRecords, waybills, clients, cardSearchQuery]);

  const mappedApproved = useMemo(() => {
    return approvedRecords.map(br => {
      const wb = waybills.find(w => w.id === br.waybillId);
      const client = clients.find(c => c.id === br.clientId);
      return {
        ...br,
        waybillNumber: wb?.waybillNumber || br.waybillId,
        clientName: client?.name || br.clientId,
      };
    }).filter(row => {
      const q = cardSearchQuery.toLowerCase();
      return !q || row.waybillNumber.toLowerCase().includes(q) || row.clientName.toLowerCase().includes(q);
    });
  }, [approvedRecords, waybills, clients, cardSearchQuery]);

  const mappedReturned = useMemo(() => {
    return returnedRecords.map(br => {
      const wb = waybills.find(w => w.id === br.waybillId);
      const client = clients.find(c => c.id === br.clientId);
      return {
        ...br,
        waybillNumber: wb?.waybillNumber || br.waybillId,
        clientName: client?.name || br.clientId,
      };
    }).filter(row => {
      const q = cardSearchQuery.toLowerCase();
      return !q || row.waybillNumber.toLowerCase().includes(q) || row.clientName.toLowerCase().includes(q);
    });
  }, [returnedRecords, waybills, clients, cardSearchQuery]);

  // Endorse to Finance Manager
  const handleConfirmEndorseToManager = () => {
    if (selectedCalculatedWaybills.length === 0) return;

    const newRecords: BillingRecord[] = selectedCalculatedWaybills.map(wb => {
      const clientRates = getRatesForClient(wb.clientCode);
      const rateUsed = clientRates.find(r => r.region.toUpperCase() === wb.breakdown.area.toUpperCase()) || clientRates[0];

      return {
        id: `BR-${Date.now()}-${wb.id}`,
        waybillId: wb.id,
        clientId: wb.clientCode,
        rateId: rateUsed?.id || 'STANDARD-RATE',
        volumeWeight: wb.breakdown.volumeWeight,
        actualWeight: wb.breakdown.actualWeight,
        chargeableWeight: wb.breakdown.chargeableWeight,
        freightCost: wb.breakdown.freightCost,
        valuation: wb.breakdown.valuation,
        odaCharge: wb.breakdown.odaCharge,
        subtotal: wb.breakdown.subtotal,
        vat: wb.breakdown.vat,
        fuelSurcharge: wb.breakdown.fuelSurcharge,
        grandTotal: wb.breakdown.grandTotal,
        status: 'Pending Review',
        remarks: batchRemarks || 'Endorsed for managerial billing review',
        computedBy: user?.fullName || 'Accountant',
        computedAt: new Date().toISOString(),
      };
    });

    setBillingRecords(prev => [...prev, ...newRecords]);
    toast.success(`Successfully endorsed ${newRecords.length} waybill(s) (${formatCurrency(batchTotals.grandTotal)}) to Finance Manager.`, 'Success');
    }

    if (newRecords.length > 0) {
      try {
        for (const nr of newRecords) {
          await ratesService.records.create(nr);
        }
        await invalidateForMutation('submitInvoice');
        refetchRecords?.();
        refetchWaybills?.();
      } catch (err) {
        console.error('Submit error:', err);
      }
    }

    setSelectedIds([]);
    setShowBatchModal(false);
    setBatchRemarks('');
    setActiveTab('pending');
  };

  // Manager Approve
  const handleApprove = async (recordId: string) => {
    try {
      await ratesService.records.act(recordId, 'approve');
    } catch {
      // optimistic fallback
    }
    setBillingRecords(prev => prev.map(r => r.id === recordId ? {
      ...r,
      status: 'Approved',
      reviewedBy: user?.fullName || 'Finance Manager',
      reviewedAt: new Date().toISOString()
    } : r));
    toast.success('Billing record approved.', 'Success');
  };

  // Manager Return / Reject
  const handleConfirmReject = async () => {
    if (!rejectingRecordId) return;
    try {
      await ratesService.records.act(rejectingRecordId, 'return', { remarks: rejectReason || 'Returned by Finance Manager for revision.' });
    } catch {
      // optimistic fallback
    }
    setBillingRecords(prev => prev.map(r => r.id === rejectingRecordId ? {
      ...r,
      status: 'Returned',
      remarks: rejectReason || 'Returned by Finance Manager for revision.',
      reviewedBy: user?.fullName || 'Finance Manager',
      reviewedAt: new Date().toISOString()
    } : r));
    toast.info('Billing record returned for revision.', 'Returned');
    setRejectingRecordId(null);
    setRejectReason('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      
      {/* ── Main FOMS Card ── */}
      <Card>
        <div style={{ padding: '24px' }}>
          
          {/* Card Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {activeTab === 'unbilled' ? 'Unbilled Waybills' :
                 activeTab === 'pending' ? 'Pending Finance Manager Review' :
                 activeTab === 'approved' ? 'Approved Billing Records' : 'Returned Records'}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                {activeTab === 'unbilled' ? 'Select delivered waybills to compute freight charges and endorse to the Finance Manager.' :
                 activeTab === 'pending' ? 'Billing records currently undergoing managerial review and rate verification.' :
                 activeTab === 'approved' ? 'Approved records ready to be compiled into Sales Invoices.' :
                 'Records returned by the Finance Manager for weight or rate revision.'}
              </p>
            </div>

            {/* Header Action Button & View Mode Switcher */}
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

              {canCompute && activeTab === 'unbilled' && (
                <Button
                  title={selectedIds.length > 0 ? `Compute & Submit (${selectedIds.length})` : 'Compute & Submit'}
                  variant="primary"
                  icon="ti-calculator"
                  onClick={() => setShowBatchModal(true)}
                  disabled={selectedIds.length === 0}
                />
              )}
              {activeTab === 'approved' && (
                <Button
                  title="Create Sales Invoice"
                  variant="primary"
                  icon="ti-file-invoice"
                  onClick={() => navigate('/invoicing-desk')}
                />
              )}
            </div>
          </div>

          {/* FOMS Tab Switcher Buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {canCompute && (
              <Button
                title={`Unbilled Waybills (${availableWaybills.length})`}
                variant={activeTab === 'unbilled' ? 'primary' : 'secondary'}
                size="sm"
                icon="ti-packages"
                onClick={() => setActiveTab('unbilled')}
              />
            )}
            <Button
              title={`Pending Review (${pendingRecords.length})`}
              variant={activeTab === 'pending' ? 'primary' : 'secondary'}
              size="sm"
              icon="ti-clock"
              onClick={() => setActiveTab('pending')}
            />
            <Button
              title={`Validated Records (${approvedRecords.length})`}
              variant={activeTab === 'approved' ? 'primary' : 'secondary'}
              size="sm"
              icon="ti-check"
              onClick={() => setActiveTab('approved')}
            />
            {returnedRecords.length > 0 && (
              <Button
                title={`Returned (${returnedRecords.length})`}
                variant={activeTab === 'returned' ? 'primary' : 'secondary'}
                size="sm"
                icon="ti-alert-circle"
                onClick={() => setActiveTab('returned')}
              />
            )}
          </div>

          {/* Cards View Search & Filter Bar */}
          {viewMode === 'cards' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <div style={{ position: 'relative', width: '300px' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#0D9488', fontSize: '16px' }} />
                <input
                  type="text"
                  placeholder="Search by waybill or client..."
                  value={cardSearchQuery}
                  onChange={(e) => setCardSearchQuery(e.target.value)}
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

              {canCompute && activeTab === 'unbilled' && (
                <>
                  <select
                    value={cardClientFilter}
                    onChange={(e) => setCardClientFilter(e.target.value)}
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
                    <option value="">All Clients</option>
                    {clientFilterOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedIds.length === filteredCalculatedWaybills.length) {
                        setSelectedIds([]);
                      } else {
                        setSelectedIds(filteredCalculatedWaybills.map(w => w.id));
                      }
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      background: '#F8FAFC',
                      color: '#334155',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className={selectedIds.length === filteredCalculatedWaybills.length && filteredCalculatedWaybills.length > 0 ? "ti ti-checkbox" : "ti ti-square"} />
                    {selectedIds.length === filteredCalculatedWaybills.length && filteredCalculatedWaybills.length > 0 ? "Deselect All" : "Select All"}
                  </button>
                </>
              )}

              {(cardSearchQuery || cardClientFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setCardSearchQuery('');
                    setCardClientFilter('');
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
          )}

          {/* ── TAB 1: UNBILLED WAYBILLS ── */}
          {canCompute && activeTab === 'unbilled' && (
            viewMode === 'cards' ? (
              filteredCalculatedWaybills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 20px', color: '#94A3B8' }}>
                  <i className="ti ti-packages" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#CBD5E1' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#334155' }}>No unbilled waybills available</div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>No validated delivery waybills matching criteria.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                  {filteredCalculatedWaybills.map((row: any) => {
                    const isSelected = selectedIds.includes(row.id);
                    return (
                      <div
                        key={row.id}
                        onClick={() => {
                          setSelectedIds(prev => prev.includes(row.id) ? prev.filter(x => x !== row.id) : [...prev, row.id]);
                        }}
                        style={{
                          background: '#FFFFFF',
                          border: isSelected ? '2px solid #0D9488' : '1px solid #E2E8F0',
                          borderRadius: '16px',
                          padding: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '14px',
                          boxShadow: isSelected ? '0 8px 16px -4px rgba(13, 148, 136, 0.15)' : '0 2px 4px rgba(0, 0, 0, 0.02)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.boxShadow = '0 12px 24px -6px rgba(0, 0, 0, 0.08)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.02)';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0D9488' }}
                            />
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                              {row.waybillNumber}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0D9488', background: '#F0FDFA', border: '1px solid #CCFBF1', padding: '2px 8px', borderRadius: '6px' }}>
                            {row.detectedArea}
                          </span>
                        </div>

                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                            {row.clientName}
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                            <i className="ti ti-calendar" style={{ fontSize: '13px' }} />
                            Delivered: {formatDate(row.deliveryDate)}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#F8FAFC', borderRadius: '12px', padding: '12px 14px', border: '1px solid #F1F5F9' }}>
                          <div>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>WEIGHT BASIS</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                              {row.breakdown.chargeableWeight.toFixed(2)} kg
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>({row.breakdown.weightBasis})</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>EST. FREIGHT</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                              {formatCurrency(row.estimatedAmount)}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBreakdownWaybill({
                                waybillNumber: row.waybillNumber,
                                clientName: row.clientName,
                                breakdown: row.breakdown,
                              });
                            }}
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
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#0D9488';
                              e.currentTarget.style.color = '#0D9488';
                              e.currentTarget.style.background = '#F0FDFA';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#E2E8F0';
                              e.currentTarget.style.color = '#334155';
                              e.currentTarget.style.background = '#FFFFFF';
                            }}
                          >
                            <i className="ti ti-calculator" style={{ fontSize: '14px' }} />
                            View Breakdown
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
                  title=""
                  data={calculatedWaybills}
                  columns={[
                    {
                      key: 'waybillNumber',
                      label: 'WAYBILL NO.',
                      sortable: true,
                      render: (row: any) => (
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>
                          {row.waybillNumber}
                        </span>
                      ),
                    },
                    { key: 'clientName', label: 'CLIENT', sortable: true },
                    {
                      key: 'deliveryDate',
                      label: 'DELIVERY DATE',
                      sortable: true,
                      render: (row: any) => formatDate(row.deliveryDate),
                    },
                    {
                      key: 'chargeableWeight',
                      label: 'CHARGEABLE WEIGHT',
                      render: (row: any) => (
                        <span>{row.breakdown.chargeableWeight.toFixed(2)} kg ({row.breakdown.weightBasis})</span>
                      ),
                    },
                    {
                      key: 'estimatedAmount',
                      label: 'ESTIMATED FREIGHT',
                      sortable: true,
                      render: (row: any) => (
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>
                          {formatCurrency(row.estimatedAmount)}
                        </span>
                      ),
                    },
                  ]}
                  actions={[
                    {
                      label: 'View Breakdown',
                      icon: 'ti-calculator',
                      onClick: (row: any) => setBreakdownWaybill({
                        waybillNumber: row.waybillNumber,
                        clientName: row.clientName,
                        breakdown: row.breakdown,
                      }),
                    },
                  ]}
                  rowKey="id"
                  selectable={true}
                  selectedKeys={selectedIds}
                  onSelectionChange={(keys) => setSelectedIds(keys.map(String))}
                  searchPlaceholder="Search waybills..."
                  searchFields={['waybillNumber', 'clientName']}
                  filters={[
                    {
                      key: 'clientName',
                      label: 'All Clients',
                      options: clientFilterOptions,
                    },
                  ]}
                  emptyMessage="No unbilled waybills available."
                />
              </TableContainer>
            )
          )}

          {/* ── TAB 2: PENDING FINANCE MANAGER REVIEW ── */}
          {activeTab === 'pending' && (
            viewMode === 'cards' ? (
              mappedPending.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 20px', color: '#94A3B8' }}>
                  <i className="ti ti-clock" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#CBD5E1' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#334155' }}>No pending records</div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>No billing records currently awaiting Finance Manager review.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                  {mappedPending.map((row: any) => (
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
                        gap: '14px',
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                          {row.waybillNumber}
                        </span>
                        <StatusBadge status={row.status} />
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>
                        Delivery Date: {formatDate(wb.deliveryDate)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Billing Records Card Grid (Connected to Database) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              {isHead ? 'Billing Review & Approval Queue' : 'Billing Records'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
              {isHead
                ? 'Review computed freight records submitted by the Accountant before approving for invoicing.'
                : 'Track computed freight records stored in the database and their validation review statuses.'}
            </p>
          </div>
        </div>
          {/* Filter Bar */}
          <div style={{
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #E2E8F0',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            {/* Search Input */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              padding: '8px 12px',
              flex: '1 1 240px',
              minWidth: 200
            }}>
              <i className="ti ti-search" style={{ color: '#94A3B8', fontSize: 14 }} />
              <input
                type="text"
                placeholder="Search records..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  width: '100%',
                  fontSize: 13,
                  color: '#0F172A'
                }}
              />
            </div>

                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                          {row.clientName}
                        </h4>
                        <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                          Submitted by {row.computedBy} • {formatDate(row.date)}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#F8FAFC', borderRadius: '12px', padding: '12px 14px', border: '1px solid #F1F5F9' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>CHARGEABLE WT</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                            {row.chargeableWeight?.toFixed(2) || '—'} kg
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>COMPUTED AMOUNT</div>
                          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                            {formatCurrency(row.grandTotal)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const wb = waybills.find(w => w.id === row.waybillId);
                            setBreakdownWaybill({
                              waybillNumber: row.waybillNumber,
                              clientName: row.clientName,
                              breakdown: {
                                area: wb ? detectArea(wb) : 'NCR',
                                actualWeight: row.actualWeight,
                                volumeWeight: row.volumeWeight,
                                chargeableWeight: row.chargeableWeight,
                                weightBasis: row.volumeWeight >= row.actualWeight ? 'Volume Weight' : 'Actual Weight',
                                minimumRate: 100,
                                excessRate: 25,
                                excessKgs: 0,
                                freightCost: row.freightCost,
                                declaredValue: 0,
                                valuation: row.valuation,
                                odaCharge: row.odaCharge,
                                subtotal: row.subtotal,
                                vat: row.vat,
                                fuelSurcharge: row.fuelSurcharge,
                                grandTotal: row.grandTotal,
                                calculatedAmount: row.grandTotal,
                              },
                            });
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            background: '#FFFFFF',
                            color: '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="ti ti-calculator" /> Breakdown
                        </button>
                        {isHead && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApprove(row.id)}
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
                              onClick={() => setRejectingRecordId(row.id)}
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
                              <i className="ti ti-arrow-back-up" /> Return
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <TableContainer>
                <DataTable
                  title=""
                  data={pendingRecords.map(br => {
                    const wb = waybills.find(w => w.id === br.waybillId);
                    const client = clients.find(c => c.id === br.clientId);
                    return {
                      ...br,
                      waybillNumber: wb?.waybillNumber || br.waybillId,
                      clientName: client?.name || br.clientId,
                      date: br.computedAt,
                    };
                  })}
                  columns={[
                    {
                      key: 'waybillNumber',
                      label: 'WAYBILL NO.',
                      sortable: true,
                      render: (row: any) => (
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>
                          {row.waybillNumber}
                        </span>
                      ),
                    },
                    { key: 'clientName', label: 'CLIENT', sortable: true },
                    {
                      key: 'chargeableWeight',
                      label: 'CHARGEABLE WEIGHT',
                      render: (row: any) => <span>{row.chargeableWeight?.toFixed(2) || '—'} kg</span>,
                    },
                    {
                      key: 'grandTotal',
                      label: 'COMPUTED AMOUNT',
                      sortable: true,
                      render: (row: any) => (
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>
                          {formatCurrency(row.grandTotal)}
                        </span>
                      ),
                    },
                    {
                      key: 'computedBy',
                      label: 'SUBMITTED BY',
                      render: (row: any) => (
                        <div>
                          <div>{row.computedBy}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{formatDate(row.date)}</div>
                        </div>
                      ),
                    },
                    {
                      key: 'status',
                      label: 'STATUS',
                      render: (row: any) => <StatusBadge status={row.status} />,
                    },
                  ]}
                  actions={isHead ? [
                    { label: 'Approve', icon: 'ti-check', onClick: (row: any) => handleApprove(row.id) },
                    { label: 'Return for Revision', icon: 'ti-arrow-back-up', onClick: (row: any) => setRejectingRecordId(row.id) },
                  ] : [
                    {
                      label: 'View Breakdown',
                      icon: 'ti-calculator',
                      onClick: (row: any) => {
                        const wb = waybills.find(w => w.id === row.waybillId);
                        setBreakdownWaybill({
                          waybillNumber: row.waybillNumber,
                          clientName: row.clientName,
                          breakdown: {
                            area: wb ? detectArea(wb) : 'NCR',
                            actualWeight: row.actualWeight,
                            volumeWeight: row.volumeWeight,
                            chargeableWeight: row.chargeableWeight,
                            weightBasis: row.volumeWeight >= row.actualWeight ? 'Volume Weight' : 'Actual Weight',
                            minimumRate: 100,
                            excessRate: 25,
                            excessKgs: 0,
                            freightCost: row.freightCost,
                            declaredValue: 0,
                            valuation: row.valuation,
                            odaCharge: row.odaCharge,
                            subtotal: row.subtotal,
                            vat: row.vat,
                            fuelSurcharge: row.fuelSurcharge,
                            grandTotal: row.grandTotal,
                            calculatedAmount: row.grandTotal,
                          },
                        });
                      },
                    },
                  ]}
                  rowKey="id"
                  searchPlaceholder="Search pending records..."
                  searchFields={['waybillNumber', 'clientName']}
                  emptyMessage="No billing records currently awaiting Finance Manager review."
                />
              </TableContainer>
            )
          )}

          {/* ── TAB 3: APPROVED RECORDS ── */}
          {activeTab === 'approved' && (
            viewMode === 'cards' ? (
              mappedApproved.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 20px', color: '#94A3B8' }}>
                  <i className="ti ti-check" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#CBD5E1' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#334155' }}>No approved records</div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>No billing records have been approved yet.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                  {mappedApproved.map((row: any) => (
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
                        gap: '14px',
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                          {row.waybillNumber}
                        </span>
                        <StatusBadge status={row.status} />
                      </div>

                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                          {row.clientName}
                        </h4>
                        <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                          Approved by {row.reviewedBy || 'Finance Manager'} • {formatDate(row.reviewedAt)}
                        </div>
                      </div>

                      <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '12px 14px', border: '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>APPROVED AMOUNT</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                          {formatCurrency(row.grandTotal)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => navigate('/invoicing-desk')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            borderRadius: '8px',
                            border: 'none',
                            background: '#0D9488',
                            color: '#FFFFFF',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="ti ti-file-invoice" /> Create Invoice
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <TableContainer>
                <DataTable
                  title=""
                  data={approvedRecords.map(br => {
                    const wb = waybills.find(w => w.id === br.waybillId);
                    const client = clients.find(c => c.id === br.clientId);
                    return {
                      ...br,
                      waybillNumber: wb?.waybillNumber || br.waybillId,
                      clientName: client?.name || br.clientId,
                    };
                  })}
                  columns={[
                    {
                      key: 'waybillNumber',
                      label: 'WAYBILL NO.',
                      sortable: true,
                      render: (row: any) => (
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>
                          {row.waybillNumber}
                        </span>
                      ),
                    },
                    { key: 'clientName', label: 'CLIENT', sortable: true },
                    {
                      key: 'grandTotal',
                      label: 'APPROVED AMOUNT',
                      sortable: true,
                      render: (row: any) => (
                        <span style={{ fontWeight: 700, color: '#059669' }}>
                          {formatCurrency(row.grandTotal)}
                        </span>
                      ),
                    },
                    {
                      key: 'reviewedBy',
                      label: 'APPROVED BY',
                      render: (row: any) => (
                        <div>
                          <div>{row.reviewedBy || 'Finance Manager'}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{formatDate(row.reviewedAt)}</div>
                        </div>
                      ),
                    },
                    {
                      key: 'status',
                      label: 'STATUS',
                      render: (row: any) => <StatusBadge status={row.status} />,
                    },
                  ]}
                  actions={[
                    {
                      label: 'Create Invoice',
                      icon: 'ti-file-invoice',
                      onClick: () => navigate('/invoicing-desk'),
                    },
                  ]}
                  rowKey="id"
                  searchPlaceholder="Search approved records..."
                  searchFields={['waybillNumber', 'clientName']}
                  emptyMessage="No approved records yet."
                />
              </TableContainer>
            )
          )}

          {/* ── TAB 4: RETURNED RECORDS ── */}
          {activeTab === 'returned' && (
            viewMode === 'cards' ? (
              mappedReturned.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 20px', color: '#94A3B8' }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#CBD5E1' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#334155' }}>No returned records</div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>No records have been returned for revision.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                  {mappedReturned.map((row: any) => (
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
                        gap: '14px',
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                          {row.waybillNumber}
                        </span>
                        <StatusBadge status={row.status} />
                      </div>

                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                          {row.clientName}
                        </h4>
                        <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                          Returned by {row.reviewedBy || 'Finance Manager'}
                        </div>
                      </div>

                      <div style={{ background: '#FEF2F2', borderRadius: '12px', padding: '12px 14px', border: '1px solid #FEE2E2' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#DC2626', letterSpacing: '0.04em' }}>RETURN REASON</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#991B1B', marginTop: '2px' }}>
                          {row.remarks || 'Returned for revision.'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setBillingRecords(prev => prev.filter(r => r.id !== row.id));
                            setSelectedIds([row.waybillId]);
                            setActiveTab('unbilled');
                            toast.info(`Waybill ${row.waybillNumber} returned to unbilled queue for adjustment.`, 'Ready to Edit');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            borderRadius: '8px',
                            border: 'none',
                            background: '#0D9488',
                            color: '#FFFFFF',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="ti ti-refresh" /> Re-audit & Submit
                        </button>
                      </div>
                    </div>
                  ))}
                    {isHead ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {row.status !== 'Returned' && (
                          <button
                            onClick={() => handleReject(row.id)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #FECACA',
                              background: '#FEF2F2',
                              color: '#DC2626',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <i className="ti ti-x" style={{ fontSize: 13 }} />
                            Reject
                          </button>
                        )}
                        {row.status !== 'Approved' && (
                          <button
                            onClick={() => handleApprove(row.id)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 8,
                              border: 'none',
                              background: '#0D9488',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              boxShadow: '0 2px 4px rgba(13,148,136,0.2)'
                            }}
                          >
                            <i className="ti ti-check" style={{ fontSize: 13 }} />
                            Approve
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: row.status === 'Approved' ? '#DCFCE7' : row.status === 'Returned' ? '#FEE2E2' : '#FEF3C7',
                          color: row.status === 'Approved' ? '#166534' : row.status === 'Returned' ? '#991B1B' : '#92400E',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <i className={row.status === 'Approved' ? 'ti ti-check' : row.status === 'Returned' ? 'ti ti-rotate' : 'ti ti-clock'} />
                          {row.status || 'Pending Review'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            ) : (
              <TableContainer>
                <DataTable
                  title=""
                  data={returnedRecords.map(br => {
                    const wb = waybills.find(w => w.id === br.waybillId);
                    const client = clients.find(c => c.id === br.clientId);
                    return {
                      ...br,
                      waybillNumber: wb?.waybillNumber || br.waybillId,
                      clientName: client?.name || br.clientId,
                    };
                  })}
                  columns={[
                    { key: 'waybillNumber', label: 'WAYBILL NO.', sortable: true },
                    { key: 'clientName', label: 'CLIENT', sortable: true },
                    {
                      key: 'remarks',
                      label: 'RETURN REASON',
                      render: (row: any) => (
                        <span style={{ color: '#DC2626', fontWeight: 500 }}>
                          {row.remarks || 'Returned for revision.'}
                        </span>
                      ),
                    },
                    {
                      key: 'reviewedBy',
                      label: 'RETURNED BY',
                      render: (row: any) => <span>{row.reviewedBy || 'Finance Manager'}</span>,
                    },
                    {
                      key: 'status',
                      label: 'STATUS',
                      render: (row: any) => <StatusBadge status={row.status} />,
                    },
                  ]}
                  actions={[
                    {
                      label: 'Re-audit & Submit',
                      icon: 'ti-refresh',
                      onClick: (row: any) => {
                        setBillingRecords(prev => prev.filter(r => r.id !== row.id));
                        setSelectedIds([row.waybillId]);
                        setActiveTab('unbilled');
                        toast.info(`Waybill ${row.waybillNumber} returned to unbilled queue for adjustment.`, 'Ready to Edit');
                      },
                    },
                  ]}
                  rowKey="id"
                  searchPlaceholder="Search returned records..."
                  searchFields={['waybillNumber', 'clientName']}
                  emptyMessage="No returned records."
                />
              </TableContainer>
            )
          )}

        </div>
      </Card>

      {/* ── FOMS STANDARD MODAL: BATCH REVIEW & ENDORSEMENT ── */}
      {showBatchModal && (
        <div className="dt-overlay" onClick={() => setShowBatchModal(false)}>
          <div
            className="dt-dialog"
            style={{ maxWidth: '580px', textAlign: 'left', padding: '28px 32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>
                Endorse Billing Batch to Finance Manager
              </h3>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94A3B8', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: '13.5px', color: '#64748B' }}>
              Please review the batch computation summary before submitting to the Finance Manager for approval:
            </p>

            {/* Batch Financial Breakdown Card */}
            <div style={{ background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: '#475569' }}>Selected Waybills:</span>
                <strong>{batchTotals.count} items</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: '#475569' }}>Total Chargeable Weight:</span>
                <strong>{batchTotals.totalChargeableWeight.toFixed(2)} kg</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: '#475569' }}>Base Freight Subtotal:</span>
                <span>{formatCurrency(batchTotals.totalFreightCost)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: '#475569' }}>15% Fuel Surcharge:</span>
                <span>{formatCurrency(batchTotals.totalFuelSurcharge)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: '#475569' }}>12% VAT:</span>
                <span>{formatCurrency(batchTotals.totalVat)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '15px',
                fontWeight: 700,
                color: '#0F172A',
                borderTop: '1px solid #E2E8F0',
                paddingTop: 10,
                marginTop: 4,
              }}>
                <span>Total Amount to Endorse:</span>
                <span style={{ color: '#0D9488' }}>{formatCurrency(batchTotals.grandTotal)}</span>
              </div>
            </div>

            {/* Accountant Remarks Field */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Accountant Remarks for Finance Manager (Optional):
              </label>
              <textarea
                rows={2}
                value={batchRemarks}
                onChange={(e) => setBatchRemarks(e.target.value)}
                placeholder="e.g. Weekly client delivery batch. Rates and weights audited."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {/* Dialog Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button title="Cancel" variant="secondary" onClick={() => setShowBatchModal(false)} />
              <Button title="Confirm & Submit to Manager" variant="primary" icon="ti-send" onClick={handleConfirmEndorseToManager} />
            </div>
          </div>
        </div>

      {/* ── FOMS STANDARD MODAL: RATE BREAKDOWN ── */}
      {breakdownRecord && (
        <div className="dt-overlay" onClick={() => setBreakdownWaybill(null)}>
          <div
            className="dt-dialog"
            style={{ maxWidth: '480px', textAlign: 'left', padding: '24px 28px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0F172A' }}>
                  Rate Computation Audit
                </h3>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: 2 }}>
                  {breakdownRecord.waybillNumber} &bull; {breakdownRecord.clientName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBreakdownWaybill(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94A3B8', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Actual Weight:</span>
                <strong>{breakdownRecord.breakdown.actualWeight.toFixed(2)} kg</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Volumetric Weight (L×W×H/3500):</span>
                <strong>{breakdownRecord.breakdown.volumeWeight.toFixed(2)} kg</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0F766E', fontWeight: 600 }}>
                <span>Chargeable Weight Applied:</span>
                <span>{breakdownRecord.breakdown.chargeableWeight.toFixed(2)} kg ({breakdownRecord.breakdown.weightBasis})</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '13px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Base Minimum Rate:</span>
                <span>{formatCurrency(breakdownRecord.breakdown.minimumRate)}</span>
              </div>
              {breakdownRecord.breakdown.excessKgs > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                  <span>Excess Weight ({breakdownRecord.breakdown.excessKgs.toFixed(2)} kg):</span>
                  <span>{formatCurrency(breakdownRecord.breakdown.excessKgs * breakdownRecord.breakdown.excessRate)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>1% Valuation:</span>
                <span>{formatCurrency(breakdownRecord.breakdown.valuation)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>15% Fuel Surcharge:</span>
                <span>{formatCurrency(breakdownRecord.breakdown.fuelSurcharge)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>12% VAT:</span>
                <span>{formatCurrency(breakdownRecord.breakdown.vat)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14.5px',
                fontWeight: 700,
                borderTop: '1px solid #E2E8F0',
                paddingTop: 8,
              }}>
                <span>Total Freight:</span>
                <span style={{ color: '#0D9488' }}>{formatCurrency(breakdownRecord.breakdown.grandTotal)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button title="Close" variant="secondary" onClick={() => setBreakdownWaybill(null)} />
            </div>
          </div>
        </div>
      )}

      {/* ── FOMS STANDARD MODAL: MANAGER RETURN FOR REVISION ── */}
      {rejectingRecordId && (
        <div className="dt-overlay" onClick={() => setRejectingRecordId(null)}>
          <div
            className="dt-dialog"
            style={{ maxWidth: '440px', textAlign: 'left', padding: '24px 28px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: '#DC2626' }}>
              Return Billing Record for Revision
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748B' }}>
              Specify the revision reason so the accountant can adjust the calculation:
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Re-measure dimensions; rate applied differs from contract."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #FCA5A5',
                fontFamily: 'inherit',
                fontSize: '13px',
                boxSizing: 'border-box',
                outline: 'none',
                marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button title="Cancel" variant="secondary" onClick={() => setRejectingRecordId(null)} />
              <Button title="Confirm Return" variant="danger" onClick={handleConfirmReject} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BillingValidation;
