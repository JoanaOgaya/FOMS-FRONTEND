import React, { useState, useMemo } from 'react';
import { useQuery } from '../hooks/useQuery';
import { cashFlowService } from '../services/cashFlowService';
import { paymentsService } from '../services/paymentsService';
import { liquidationsService } from '../services/liquidationsService';
import { clientsService } from '../services/clientsService';
import { auditLogsService } from '../services/auditLogsService';
import { Card } from '../components/Card';
import { KpiCard } from '../components/shared/KpiCard';
import { Button } from '../components/Buttons';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import RecordSettlementModal from '../components/RecordSettlementModal';
import { RecordCashOutflowModal } from '../components/RecordCashOutflowModal';
import { CalendarPicker } from '../components/FormModals';
import { formatCurrency, formatDateTime } from '../utils/format';
import { invalidateForMutation } from '../services/invalidation';
import type { CashFlowRecord, Payment, Liquidation, Client } from '../types/entities';

export default function CashFlowManagement() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: cashData, refetch: refetchCash, isLoading } = useQuery('cashflow:list', () => cashFlowService.list({ pageSize: 100 }));
  const { data: payData } = useQuery('cashflow:payments', () => paymentsService.list({ pageSize: 100 }));
  const { data: liqData } = useQuery('cashflow:liquidations', () => liquidationsService.list({ pageSize: 100 }));
  const { data: clientData } = useQuery('cashflow:clients', () => clientsService.list({ pageSize: 100 }));

  const cashFlowRecords: CashFlowRecord[] = cashData?.items || [];
  const payments: Payment[] = payData?.items || [];
  const liquidations: Liquidation[] = liqData?.items || [];
  const clients: Client[] = clientData?.items || [];

  const isAccountant = user?.role === 'ACCOUNTANT' || user?.role === 'HEAD_ACCOUNTANT';
  const isFinancialManager = user?.role === 'FINANCIAL_MANAGER';

  // Filters
  const [filterType, setFilterType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 9;

  const [isRecordSettlementModalOpen, setIsRecordSettlementModalOpen] = useState(false);
  const [isRecordOutflowModalOpen, setIsRecordOutflowModalOpen] = useState(false);
  const [selectedViewRecord, setSelectedViewRecord] = useState<any>(null);

  // Compute Unrecorded Transactions (For Accountant)
  const unrecordedPayments = useMemo(() => {
    return payments.filter(p => p.status === 'Validated' && !cashFlowRecords.find(c => c.sourceReference === p.id));
  }, [payments, cashFlowRecords]);

  const unrecordedLiquidations = useMemo(() => {
    return liquidations.filter(l => l.status === 'Validated' && !cashFlowRecords.find(c => c.sourceReference === l.id));
  }, [liquidations, cashFlowRecords]);

  // Compute Summaries and Enriched Records
  const filteredRecords = useMemo(() => {
    let filtered = cashFlowRecords;
    if (filterType !== 'All') {
      filtered = filtered.filter(c => c.type === filterType);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        (c.id || '').toLowerCase().includes(q) ||
        (c.sourceReference || '').toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q)
      );
    }

    filtered = filtered.filter(c => {
      const cDate = new Date(c.date);
      if (filterDateFrom && cDate < new Date(filterDateFrom)) return false;
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (cDate > to) return false;
      }
      return true;
    });

    return filtered.map(c => {
      let involvedParty = 'General Collection / Disbursement';
      let methodOrCategory = c.category || 'N/A';
      let paymentDate = c.date || new Date().toISOString();
      let referenceNumber = c.sourceReference || 'N/A';

      if (c.type === 'Inflow') {
        const payment = payments.find(p => p.id === c.sourceReference);
        if (payment) {
          const client = clients.find(cl => cl.id === payment.clientId);
          involvedParty = client ? client.name : 'Unknown Client';
          methodOrCategory = payment.paymentMethod || 'Bank Transfer';
          paymentDate = payment.recordedAt || c.date;
          referenceNumber = payment.referenceNumber || payment.orNumber || c.sourceReference;
        } else {
          involvedParty = c.sourceReference;
          methodOrCategory = c.category || 'Bank Transfer';
        }
      } else if (c.type === 'Outflow') {
        const liquidation = liquidations.find(l => l.id === c.sourceReference);
        if (liquidation) {
          involvedParty = liquidation.submittedBy || 'Operations Courier';
          methodOrCategory = liquidation.expenses?.map(e => e.type).join(', ') || 'Operating Expense';
          paymentDate = liquidation.submittedAt || c.date;
          referenceNumber = liquidation.reference || c.sourceReference;
        } else {
          involvedParty = c.sourceReference;
          methodOrCategory = c.category || 'Operating Expense';
        }
      }

      const displayRecordedBy = c.recordedBy || user?.fullName || 'System';

      return { ...c, involvedParty, methodOrCategory, paymentDate, referenceNumber, recordedBy: displayRecordedBy };
    });
  }, [cashFlowRecords, filterType, searchQuery, filterDateFrom, filterDateTo, payments, liquidations, clients, user]);

  const totalInflow = filteredRecords.filter(c => c.type === 'Inflow').reduce((sum, c) => sum + c.amount, 0);
  const totalOutflow = filteredRecords.filter(c => c.type === 'Outflow').reduce((sum, c) => sum + c.amount, 0);
  const netCashFlow = totalInflow - totalOutflow;

  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize);

  const handleRecordInflow = async (payment: Payment) => {
    try {
      const newRecord: Omit<CashFlowRecord, 'id'> = {
        type: 'Inflow',
        amount: payment.amount,
        sourceReference: payment.id,
        date: new Date().toISOString(),
        recordedBy: user?.fullName || 'User',
      };
      await cashFlowService.create(newRecord);
      await auditLogsService.create({
        action: 'RECORD_CASH_INFLOW',
        module: 'Cash Flow Management',
        recordId: payment.id,
        recordType: 'Cash Flow',
        details: `Recorded cash inflow of ${formatCurrency(payment.amount)} from payment ${payment.id}`,
        ipAddress: '127.0.0.1',
      });
      await invalidateForMutation('recordCashFlow');
      toast.success('Cash inflow successfully recorded.', 'Success');
    } catch {
      toast.error('Failed to record cash inflow.', 'Error');
    }
  };

  const handleRecordOutflow = async (liquidation: Liquidation) => {
    try {
      const outflowAmount = liquidation.amount ?? liquidation.totalAmount ?? 0;
      const newRecord: Omit<CashFlowRecord, 'id'> = {
        type: 'Outflow',
        amount: outflowAmount,
        sourceReference: liquidation.id,
        date: new Date().toISOString(),
        recordedBy: user?.fullName || 'User',
      };
      await cashFlowService.create(newRecord);
      await auditLogsService.create({
        action: 'RECORD_CASH_OUTFLOW',
        module: 'Cash Flow Management',
        recordId: liquidation.id,
        recordType: 'Cash Flow',
        details: `Recorded cash outflow of ${formatCurrency(outflowAmount)} from liquidation ${liquidation.id}`,
        ipAddress: '127.0.0.1',
      });
      await invalidateForMutation('recordCashFlow');
      toast.success('Cash outflow successfully recorded.', 'Success');
    } catch {
      toast.error('Failed to record cash outflow.', 'Error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
        <Button
          title="Record Cash Outflow"
          variant="danger"
          icon="ti-arrow-up-right"
          onClick={() => setIsRecordOutflowModalOpen(true)}
        />
        {isAccountant && (
          <Button
            title="Record Settlement"
            variant="primary"
            icon="ti-plus"
            onClick={() => setIsRecordSettlementModalOpen(true)}
          />
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="kpi-grid">
        <KpiCard label="Total Inflow" value={formatCurrency(totalInflow)} icon="ti-trending-up" variant="success" hideTrend />
        <KpiCard label="Total Outflow" value={formatCurrency(totalOutflow)} icon="ti-trending-down" variant="danger" hideTrend />
        <KpiCard label="Net Cash Flow" value={formatCurrency(netCashFlow)} icon="ti-currency-peso" variant={netCashFlow >= 0 ? 'teal' : 'warning'} hideTrend />
      </div>

      {/* Pending Inflow/Outflow section for Accountant */}
      {isAccountant && (unrecordedPayments.length > 0 || unrecordedLiquidations.length > 0) && (
        <Card style={{ padding: '20px 24px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 14 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 800, color: '#92400E' }}>
            Pending Transactions to Record
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {unrecordedPayments.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF', padding: '12px 16px', borderRadius: '10px', border: '1px solid #FEF3C7' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>Inflow: Validated Payment ({p.id})</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Amount: {formatCurrency(p.amount)} &bull; Method: {p.paymentMethod}</div>
                </div>
                <Button title="Record Inflow" variant="secondary" size="sm" icon="ti-arrow-down-left" onClick={() => handleRecordInflow(p)} />
              </div>
            ))}
            {unrecordedLiquidations.map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF', padding: '12px 16px', borderRadius: '10px', border: '1px solid #FEF3C7' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>Outflow: Validated Liquidation ({l.id})</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Amount: {formatCurrency(l.amount)} &bull; Submitted by: {l.submittedBy}</div>
                </div>
                <Button title="Record Outflow" variant="secondary" size="sm" icon="ti-arrow-up-right" onClick={() => handleRecordOutflow(l)} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filter and Search Bar */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
          {/* Type Toggle Tabs */}
          <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
            {['All', 'Inflow', 'Outflow'].map(t => (
              <button
                key={t}
                onClick={() => { setFilterType(t); setPage(1); }}
                style={{
                  border: 'none',
                  background: filterType === t ? '#FFF' : 'transparent',
                  color: filterType === t ? '#0F172A' : '#64748B',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  boxShadow: filterType === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '240px', flex: 1 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 16 }} />
            <input
              type="text"
              placeholder="Search by ID or source reference..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              style={{
                width: '100%',
                padding: '9px 14px 9px 38px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                outline: 'none',
                background: '#F8FAFC',
                color: '#1E293B',
                boxSizing: 'border-box'
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0D9488'; e.currentTarget.style.background = '#fff'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#F8FAFC'; }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <CalendarPicker label="From:" value={filterDateFrom} onChange={(d) => { setFilterDateFrom(d); setPage(1); }} />
            <CalendarPicker label="To:" value={filterDateTo} onChange={(d) => { setFilterDateTo(d); setPage(1); }} />
          </div>
        </div>

        {(filterType !== 'All' || searchQuery || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setFilterType('All'); setSearchQuery(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              background: '#fff',
              color: '#64748B',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 32, color: '#0D9488', marginBottom: 12 }} />
          <div style={{ fontWeight: 600 }}>Loading cash flow records...</div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredRecords.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F1F5F9', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>
            <i className="ti ti-cash-off" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>No cash flow records found</div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
            No transaction records match the current filter criteria.
          </p>
        </div>
      )}

      {/* Cards Grid */}
      {!isLoading && filteredRecords.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {paginatedRecords.map((row: any) => {
            const isInflow = row.type === 'Inflow';
            return (
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
                  gap: 14,
                  transition: 'transform 0.2s, box-shadow 0.2s'
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
                {/* Top Row: Record ID + Type Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A' }}>
                    {row.id}
                  </span>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: isInflow ? '#DCFCE7' : '#FEE2E2',
                    color: isInflow ? '#15803D' : '#B91C1C',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <i className={`ti ${isInflow ? 'ti-arrow-down-left' : 'ti-arrow-up-right'}`} />
                    {row.type}
                  </span>
                </div>

                {/* Source Reference & Party */}
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                    {row.sourceReference || 'Cash Transaction'}
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginTop: 4 }}>
                    {row.involvedParty}
                  </div>
                </div>

                {/* Amount Highlight Box */}
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: isInflow ? '#F0FDF4' : '#FEF2F2',
                  border: `1px solid ${isInflow ? '#BBF7D0' : '#FECACA'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isInflow ? '#166534' : '#991B1B' }}>Amount</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: isInflow ? '#166534' : '#991B1B' }}>
                    {isInflow ? '+' : '-'}{formatCurrency(row.amount)}
                  </span>
                </div>

                {/* Category & Date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748B' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, background: '#F1F5F9', color: '#475569', fontWeight: 600, fontSize: 11 }}>
                    {row.methodOrCategory}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-calendar" style={{ color: '#94A3B8' }} />
                    <span>{formatDateTime(row.date)}</span>
                  </div>
                </div>

                {/* Action Footer */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>
                    Recorded by: {row.recordedBy}
                  </span>
                  <Button
                    title="View"
                    variant="secondary"
                    size="sm"
                    icon="ti-eye"
                    onClick={() => setSelectedViewRecord(row)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && filteredRecords.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px', fontSize: 13, color: '#64748B' }}>
          <div>
            Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, filteredRecords.length)} of {filteredRecords.length} records
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: page <= 1 ? '#F8FAFC' : '#fff',
                color: page <= 1 ? '#CBD5E1' : '#334155',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 12
              }}
            >
              Previous
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontWeight: 700, color: '#0F172A' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: page >= totalPages ? '#F8FAFC' : '#fff',
                color: page >= totalPages ? '#CBD5E1' : '#334155',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 12
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Record Settlement Modal */}
      {isRecordSettlementModalOpen && (
        <RecordSettlementModal
          isOpen={isRecordSettlementModalOpen}
          onClose={() => setIsRecordSettlementModalOpen(false)}
        />
      )}

      {/* View Detail Modal */}
      {selectedViewRecord && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#FFF', borderRadius: '16px', maxWidth: '480px', width: '92%', padding: '26px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>Cash Flow Details</h3>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{selectedViewRecord.id}</div>
              </div>
              <button
                onClick={() => setSelectedViewRecord(null)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: 18,
                  color: '#64748B'
                }}
              >
                &times;
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Transaction Type</span>
                <span style={{ fontWeight: 700, color: selectedViewRecord.type === 'Inflow' ? '#10B981' : '#EF4444', fontSize: '0.875rem' }}>{selectedViewRecord.type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Amount</span>
                <span style={{ fontWeight: 800, color: selectedViewRecord.type === 'Inflow' ? '#10B981' : '#EF4444', fontSize: '1.05rem' }}>
                  {selectedViewRecord.type === 'Inflow' ? '+' : '-'}{formatCurrency(selectedViewRecord.amount)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Source Reference</span>
                <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>{selectedViewRecord.sourceReference}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Party</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{selectedViewRecord.involvedParty}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Category / Method</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{selectedViewRecord.methodOrCategory}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Date Recorded</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{formatDateTime(selectedViewRecord.date)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4 }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Recorded By</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{selectedViewRecord.recordedBy}</span>
              </div>
            </div>
            <div style={{ marginTop: '22px' }}>
              <Button title="Close" variant="secondary" onClick={() => setSelectedViewRecord(null)} style={{ width: '100%', justifyContent: 'center' }} />
            </div>
          </div>
        </div>
      )}

      {/* Record Cash Outflow Modal */}
      <RecordCashOutflowModal
        isOpen={isRecordOutflowModalOpen}
        onClose={() => setIsRecordOutflowModalOpen(false)}
        onSuccess={() => refetchCash()}
      />
    </div>
  );
}
