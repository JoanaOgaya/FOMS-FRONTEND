import React, { useState, useMemo } from 'react';
import { useQuery } from '../hooks/useQuery';
import { cashFlowService } from '../services/cashFlowService';
import { paymentsService } from '../services/paymentsService';
import { liquidationsService } from '../services/liquidationsService';
import { clientsService } from '../services/clientsService';
import { auditLogsService } from '../services/auditLogsService';
import { DataTable } from '../components/DataTable';
import { TableContainer } from '../components/TableContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Buttons';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import RecordSettlementModal from '../components/RecordSettlementModal';
import { CalendarPicker } from '../components/FormModals';
import { formatCurrency, formatDateTime } from '../utils/format';
import type { CashFlowRecord, Payment, Liquidation, Client } from '../types/entities';

export default function CashFlowManagement() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: cashData, refetch: refetchCash } = useQuery('cashflow:list', () => cashFlowService.list({ pageSize: 100 }));
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
  const [filterDateRange, setFilterDateRange] = useState('All');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [isRecordSettlementModalOpen, setIsRecordSettlementModalOpen] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [selectedViewRecord, setSelectedViewRecord] = useState<any>(null);

  // Compute Unrecorded Transactions (For Accountant)
  const unrecordedPayments = useMemo(() => {
    return payments.filter(p => p.status === 'Validated' && !cashFlowRecords.find(c => c.sourceReference === p.id));
  }, [payments, cashFlowRecords]);

  const unrecordedLiquidations = useMemo(() => {
    return liquidations.filter(l => l.status === 'Validated' && !cashFlowRecords.find(c => c.sourceReference === l.id));
  }, [liquidations, cashFlowRecords]);

  // Compute Summaries
  const filteredRecords = useMemo(() => {
    let filtered = cashFlowRecords;
    if (filterType !== 'All') {
      filtered = filtered.filter(c => c.type === filterType);
    }
    if (filterDateRange === 'Today') {
      const today = new Date().toDateString();
      filtered = filtered.filter(c => new Date(c.date).toDateString() === today);
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
      let involvedParty = 'Unknown';
      let methodOrCategory = 'N/A';
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
          methodOrCategory = 'Bank Transfer';
        }
      } else if (c.type === 'Outflow') {
        const liquidation = liquidations.find(l => l.id === c.sourceReference);
        if (liquidation) {
          involvedParty = liquidation.submittedBy || 'Unknown Employee';
          methodOrCategory = liquidation.expenses?.map(e => e.type).join(', ') || 'Operating Expense';
          paymentDate = liquidation.submittedAt || c.date;
          referenceNumber = liquidation.reference || c.sourceReference;
        } else {
          involvedParty = c.sourceReference;
          methodOrCategory = 'Operating Expense';
        }
      }
      
      const displayRecordedBy = c.recordedBy || user?.fullName || 'System';
      
      return { ...c, involvedParty, methodOrCategory, paymentDate, referenceNumber, recordedBy: displayRecordedBy };
    });
  }, [cashFlowRecords, filterType, filterDateRange, filterDateFrom, filterDateTo, payments, liquidations, clients, user]);

  const totalInflow = filteredRecords.filter(c => c.type === 'Inflow').reduce((sum, c) => sum + c.amount, 0);
  const totalOutflow = filteredRecords.filter(c => c.type === 'Outflow').reduce((sum, c) => sum + c.amount, 0);
  const netCashFlow = totalInflow - totalOutflow;

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
      refetchCash();
      toast.success('Cash inflow successfully recorded.', 'Success');
    } catch {
      toast.error('Failed to record cash inflow.', 'Error');
    }
  };

  const handleRecordOutflow = async (liquidation: Liquidation) => {
    try {
      const newRecord: Omit<CashFlowRecord, 'id'> = {
        type: 'Outflow',
        amount: liquidation.amount ?? liquidation.totalAmount ?? 0,
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
        details: `Recorded cash outflow of ${formatCurrency(liquidation.amount ?? liquidation.totalAmount ?? 0)} from liquidation ${liquidation.id}`,
        ipAddress: '127.0.0.1',
      });
      refetchCash();
      toast.success('Cash outflow successfully recorded.', 'Success');
    } catch {
      toast.error('Failed to record cash outflow.', 'Error');
    }
  };

  const columns = [
    { key: 'id', label: 'RECORD ID', sortable: true },
    {
      key: 'type',
      label: 'TYPE',
      sortable: true,
      render: (row: any) => (
        <span style={{
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 700,
          background: row.type === 'Inflow' ? '#DCFCE7' : '#FEE2E2',
          color: row.type === 'Inflow' ? '#15803D' : '#B91C1C'
        }}>
          {row.type}
        </span>
      )
    },
    { key: 'sourceReference', label: 'SOURCE REF.', sortable: true },
    {
      key: 'date',
      label: 'DATE RECORDED',
      sortable: true,
      render: (row: any) => formatDateTime(row.date)
    },
    {
      key: 'amount',
      label: 'AMOUNT',
      sortable: true,
      render: (row: any) => (
        <span style={{
          fontWeight: 700,
          color: row.type === 'Inflow' ? '#10B981' : '#EF4444'
        }}>
          {row.type === 'Inflow' ? '+' : '-'}{formatCurrency(row.amount)}
        </span>
      )
    },
    { key: 'recordedBy', label: 'RECORDED BY' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header and Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0F172A' }}>Cash Flow Management</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#64748B' }}>Monitor all real-time cash inflows and outflows</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {isAccountant && (
            <Button
              title="Record Settlement"
              variant="primary"
              icon="ti-plus"
              onClick={() => setIsRecordSettlementModalOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <Card style={{ padding: '20px', borderLeft: '4px solid #10B981' }}>
          <div style={{ fontSize: '0.875rem', color: '#64748B', fontWeight: 600 }}>TOTAL INFLOW</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10B981', marginTop: '8px' }}>
            {formatCurrency(totalInflow)}
          </div>
        </Card>
        <Card style={{ padding: '20px', borderLeft: '4px solid #EF4444' }}>
          <div style={{ fontSize: '0.875rem', color: '#64748B', fontWeight: 600 }}>TOTAL OUTFLOW</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#EF4444', marginTop: '8px' }}>
            {formatCurrency(totalOutflow)}
          </div>
        </Card>
        <Card style={{ padding: '20px', borderLeft: `4px solid ${netCashFlow >= 0 ? '#0D9488' : '#F59E0B'}` }}>
          <div style={{ fontSize: '0.875rem', color: '#64748B', fontWeight: 600 }}>NET CASH FLOW</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: netCashFlow >= 0 ? '#0D9488' : '#F59E0B', marginTop: '8px' }}>
            {formatCurrency(netCashFlow)}
          </div>
        </Card>
      </div>

      {/* Actionable Unrecorded Section (For Accountant) */}
      {isAccountant && (unrecordedPayments.length > 0 || unrecordedLiquidations.length > 0) && (
        <Card style={{ padding: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Pending Inflow/Outflow to Record</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {unrecordedPayments.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>Inflow: Validated Payment ({p.id})</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Amount: {formatCurrency(p.amount)} &bull; Method: {p.paymentMethod}</div>
                </div>
                <Button title="Record Inflow" variant="secondary" icon="ti-arrow-down-left" onClick={() => handleRecordInflow(p)} />
              </div>
            ))}
            {unrecordedLiquidations.map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>Outflow: Validated Liquidation ({l.id})</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Amount: {formatCurrency(l.amount)} &bull; Submitted by: {l.submittedBy}</div>
                </div>
                <Button title="Record Outflow" variant="secondary" icon="ti-arrow-up-right" onClick={() => handleRecordOutflow(l)} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters and Table */}
      <Card>
        <div style={{ padding: '20px 20px 0 20px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
              {['All', 'Inflow', 'Outflow'].map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  style={{
                    border: 'none',
                    background: filterType === t ? '#FFF' : 'transparent',
                    color: filterType === t ? '#0F172A' : '#64748B',
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: filterType === t ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <CalendarPicker label="From:" value={filterDateFrom} onChange={setFilterDateFrom} />
            <CalendarPicker label="To:" value={filterDateTo} onChange={setFilterDateTo} />
          </div>
        </div>

        <TableContainer>
          <DataTable
            title=""
            data={filteredRecords}
            columns={columns}
            rowKey="id"
            actions={[
              {
                label: 'View',
                icon: 'ti-eye',
                onClick: (row: any) => setSelectedViewRecord(row)
              }
            ]}
          />
        </TableContainer>
      </Card>

      {/* Record Settlement Modal */}
      {isRecordSettlementModalOpen && (
        <RecordSettlementModal
          isOpen={isRecordSettlementModalOpen}
          onClose={() => setIsRecordSettlementModalOpen(false)}
        />
      )}

      {/* View Detail Modal */}
      {selectedViewRecord && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#FFF', borderRadius: '12px', maxWidth: '500px', width: '100%', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>Cash Flow Details</h3>
              <button onClick={() => setSelectedViewRecord(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748B' }}>&times;</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Record ID:</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{selectedViewRecord.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Type:</span>
                <span style={{ fontWeight: 600, color: selectedViewRecord.type === 'Inflow' ? '#10B981' : '#EF4444', fontSize: '0.875rem' }}>{selectedViewRecord.type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Amount:</span>
                <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>{formatCurrency(selectedViewRecord.amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Source Reference:</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{selectedViewRecord.sourceReference}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Party:</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{selectedViewRecord.involvedParty}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Category:</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{selectedViewRecord.methodOrCategory}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Date:</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{formatDateTime(selectedViewRecord.date)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontSize: '0.875rem' }}>Recorded By:</span>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{selectedViewRecord.recordedBy}</span>
              </div>
            </div>
            <div style={{ marginTop: '24px' }}>
              <Button title="Close" variant="secondary" onClick={() => setSelectedViewRecord(null)} style={{ width: '100%', justifyContent: 'center' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
