import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { waybillsService } from '../services/waybillsService';
import { ratesService } from '../services/ratesService';
import { clientsService } from '../services/clientsService';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/Buttons';
import { Card } from '../components/Card';
import { computeFreightCost } from '../utils/billing';
import { formatCurrency, formatDate } from '../utils/format';
import { invalidateForMutation } from '../services/invalidation';
import type { BillingRecord, Waybill, BillingRate, Client } from '../types/entities';

export const BillingValidation: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: waybillsData, refetch: refetchWaybills } = useQuery('billing:waybills', () => waybillsService.list({ pageSize: 100 }));
  const { data: ratesData } = useQuery('billing:rates', () => ratesService.list({ pageSize: 100 }));
  const { data: clientsData } = useQuery('billing:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: recordsData, refetch: refetchRecords } = useQuery('billing:records', () => ratesService.records.list({ pageSize: 100 }));

  const waybills: Waybill[] = waybillsData?.items || [];
  const billingRates: BillingRate[] = ratesData?.items || [];
  const clients: Client[] = clientsData?.items || [];
  const billingRecords: BillingRecord[] = useMemo(() => recordsData?.items || [], [recordsData]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  // Filters for Head / Manager view
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 9;

  const isHead = user?.role === 'HEAD_ACCOUNTANT' || user?.role === 'FINANCIAL_MANAGER';

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
        errorCount++;
      }
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

    if (successCount > 0) toast.success(`Submitted ${successCount} billing records for review.`, 'Success');
    if (errorCount > 0) toast.error(`Failed to compute ${errorCount} records. Check billing rates.`, 'Error');
    
    setSelectedIds([]);
  };

  const handleApprove = async (recordId: string) => {
    try {
      await ratesService.records.act(recordId, 'approve');
      await invalidateForMutation('approveInvoice');
      toast.success('Billing record approved.', 'Success');
    } catch {
      toast.error('Failed to approve billing record.');
    }
  };

  const handleReject = async (recordId: string) => {
    try {
      await ratesService.records.act(recordId, 'reject');
      await invalidateForMutation('rejectInvoice');
      toast.info('Billing record returned for revision.', 'Returned');
    } catch {
      toast.error('Failed to return billing record.');
    }
  };

  // Enriched billing records with waybill & client names
  const enrichedRecords = useMemo(() => {
    return billingRecords.map(br => {
      const wb = waybills.find(w => w.id === br.waybillId);
      const client = clients.find(c => c.id === br.clientId || c.clientCode === br.clientId);
      return {
        ...br,
        waybillNumber: wb?.waybillNumber || (br as any).waybillNumber || `WB-00${br.waybillId}`,
        clientName: client?.name || (br as any).clientName || br.clientId,
        destinationArea: wb?.destinationArea || 'NCR',
      };
    });
  }, [billingRecords, waybills, clients]);

  // Unique clients for filter
  const uniqueClients = useMemo(() => {
    return Array.from(new Set(enrichedRecords.map(r => r.clientName))).filter(Boolean);
  }, [enrichedRecords]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return enrichedRecords.filter(r => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (r.waybillNumber || '').toLowerCase().includes(q) ||
          (r.clientName || '').toLowerCase().includes(q) ||
          (r.status || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (clientFilter && r.clientName !== clientFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [enrichedRecords, searchQuery, clientFilter, statusFilter]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize);

  const resetFilters = () => {
    setSearchQuery('');
    setClientFilter('');
    setStatusFilter('');
    setPage(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Accountant View: Unbilled Waybills ── */}
      {!isHead && (
        <Card>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Unbilled Waybills</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
                  Select validated waybills to compute freight charges and submit for manager review.
                </p>
              </div>
              <Button title="Compute & Submit" variant="primary" icon="ti-calculator" onClick={handleSubmitBilling} disabled={selectedIds.length === 0} />
            </div>

            {availableWaybills.length === 0 ? (
              <div style={{ background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0', padding: '48px 20px', textAlign: 'center', color: '#94A3B8' }}>
                <i className="ti ti-file-check" style={{ fontSize: 36, display: 'block', marginBottom: 8, color: '#CBD5E1' }} />
                No unbilled waybills available
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {availableWaybills.map(wb => {
                  const client = clients.find(c => c.id === wb.clientCode);
                  let amount = 0;
                  try {
                    amount = computeFreightCost(wb, billingRates).grandTotal;
                  } catch {}
                  const isSelected = selectedIds.includes(wb.id);
                  return (
                    <div
                      key={wb.id}
                      onClick={() => {
                        setSelectedIds(prev => isSelected ? prev.filter(id => id !== wb.id) : [...prev, wb.id]);
                      }}
                      style={{
                        background: isSelected ? '#F0FDFA' : '#fff',
                        border: isSelected ? '2px solid #0D9488' : '1px solid #E2E8F0',
                        borderRadius: 14,
                        padding: 18,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ width: 16, height: 16, accentColor: '#0D9488', cursor: 'pointer' }}
                          />
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A', fontSize: 13 }}>
                            {wb.waybillNumber}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#EFF6FF', color: '#2563EB' }}>
                          Validated
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                        {client?.name || wb.clientCode}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 12px', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Estimated Freight</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#0D9488' }}>
                          {formatCurrency(amount)}
                        </span>
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

            {/* Client Filter */}
            <div style={{ position: 'relative', minWidth: 160 }}>
              <select
                value={clientFilter}
                onChange={e => { setClientFilter(e.target.value); setPage(1); }}
                style={{
                  width: '100%',
                  padding: '9px 30px 9px 12px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  fontSize: 13,
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none'
                }}
              >
                <option value="">All Clients</option>
                {uniqueClients.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', fontSize: 12 }} />
            </div>

            {/* Status Filter */}
            <div style={{ position: 'relative', minWidth: 150 }}>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                style={{
                  width: '100%',
                  padding: '9px 30px 9px 12px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  fontSize: 13,
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none'
                }}
              >
                <option value="">Billing Status</option>
                <option value="Pending Review">Pending Review</option>
                <option value="Approved">Approved</option>
                <option value="Returned">Returned</option>
              </select>
              <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', fontSize: 12 }} />
            </div>

            {(searchQuery || clientFilter || statusFilter) && (
              <button
                onClick={resetFilters}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#fff',
                  color: '#64748B',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Empty State */}
          {filteredRecords.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F1F5F9', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>
                <i className="ti ti-receipt-off" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>No billing records found</div>
              <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                No records match your search or filter criteria.
              </p>
            </div>
          )}

          {/* Cards Grid */}
          {filteredRecords.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
              {paginatedRecords.map((row) => (
                <div
                  key={row.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 22,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    position: 'relative'
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
                  {/* Top Row: Waybill No. + Status Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="ti ti-file-text" style={{ color: '#0D9488', fontSize: 16 }} />
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A', fontSize: 14 }}>
                        {row.waybillNumber}
                      </span>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>

                  {/* Client Info */}
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                      {row.clientName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>
                        Area: <strong>{row.destinationArea}</strong>
                      </span>
                      {row.actualWeight ? (
                        <span style={{ fontSize: 12, color: '#64748B' }}>
                          &bull; Weight: <strong>{row.actualWeight} kg</strong>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Computed Amount Highlight Box */}
                  <div style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    background: '#F0FDF4',
                    border: '1px solid #DCFCE7',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Computed Amount
                      </span>
                      <span style={{ fontSize: 11, color: '#15803D' }}>
                        Base freight + VAT & surcharges
                      </span>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#166534' }}>
                      {formatCurrency(row.grandTotal)}
                    </span>
                  </div>

                  {/* Computed by & Date info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <i className="ti ti-user-check" style={{ color: '#0D9488' }} />
                      <span>By: {row.computedBy || 'User'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <i className="ti ti-calendar" style={{ color: '#0D9488' }} />
                      <span>{row.computedAt ? formatDate(row.computedAt) : 'Recent'}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      onClick={() => setSelectedRecord(row)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid #E2E8F0',
                        background: '#fff',
                        color: '#475569',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <i className="ti ti-eye" style={{ fontSize: 13 }} />
                      Breakdown
                    </button>

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
              ))}
            </div>
          )}

          {/* Pagination Footer */}
          {filteredRecords.length > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #E2E8F0',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ fontSize: 13, color: '#64748B' }}>
                Showing {Math.min((page - 1) * pageSize + 1, filteredRecords.length)}–{Math.min(page * pageSize, filteredRecords.length)} of {filteredRecords.length} records
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    background: page <= 1 ? '#F8FAFC' : '#fff',
                    color: page <= 1 ? '#94A3B8' : '#0F172A',
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: 13
                  }}
                >
                  Previous
                </button>

                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', padding: '0 8px' }}>
                  Page {page} of {totalPages}
                </span>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    background: page >= totalPages ? '#F8FAFC' : '#fff',
                    color: page >= totalPages ? '#94A3B8' : '#0F172A',
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: 13
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      {/* ── Detail Breakdown Modal ── */}
      {selectedRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setSelectedRecord(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 520,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #F1F5F9', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                  Billing Breakdown
                </h3>
                <span style={{ fontSize: 13, color: '#64748B' }}>
                  {selectedRecord.waybillNumber} &bull; {selectedRecord.clientName}
                </span>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, color: '#64748B', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
                <span style={{ color: '#64748B' }}>Destination Area</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedRecord.destinationArea}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
                <span style={{ color: '#64748B' }}>Actual Weight / Chargeable Weight</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>
                  {selectedRecord.actualWeight || 0} kg / {selectedRecord.chargeableWeight || 0} kg
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
                <span style={{ color: '#64748B' }}>Base Freight Cost</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(selectedRecord.freightCost || 0)}</span>
              </div>
              {selectedRecord.valuation > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
                  <span style={{ color: '#64748B' }}>Valuation Charge</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(selectedRecord.valuation)}</span>
                </div>
              )}
              {selectedRecord.odaCharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
                  <span style={{ color: '#64748B' }}>ODA (Outside Delivery Area) Charge</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(selectedRecord.odaCharge)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
                <span style={{ color: '#64748B' }}>Subtotal</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(selectedRecord.subtotal || selectedRecord.freightCost || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
                <span style={{ color: '#64748B' }}>VAT</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(selectedRecord.vat || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
                <span style={{ color: '#64748B' }}>Fuel Surcharge</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(selectedRecord.fuelSurcharge || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: '#F0FDF4', border: '1px solid #DCFCE7', marginTop: 4 }}>
                <span style={{ fontWeight: 800, color: '#166534', fontSize: '0.95rem' }}>Grand Total</span>
                <span style={{ fontWeight: 800, color: '#166534', fontSize: '1.15rem' }}>
                  {formatCurrency(selectedRecord.grandTotal || 0)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <Button title="Close" variant="secondary" size="sm" onClick={() => setSelectedRecord(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingValidation;
