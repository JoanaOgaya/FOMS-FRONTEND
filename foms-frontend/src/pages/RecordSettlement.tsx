import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { DataTable } from '../components/DataTable';
import { Card } from '../components/Card';
import RecordSettlementModal from '../components/RecordSettlementModal';
import Dropdown from '../components/Dropdown';
import { CalendarPicker } from '../components/FormModals';
import { useQuery } from '../hooks/useQuery';
import { settlementsService } from '../services/settlementsService';
import type { Settlement } from '../types/entities';

export default function RecordSettlement() {
  const { data: settlementsData, refetch } = useQuery('settlements', () => settlementsService.list({ pageSize: 100 }));
  const settlements: Settlement[] = settlementsData?.items || [];
  const { user } = useAuth();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<Settlement | null>(null);
  
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Filter records for current user / accountant view
  const myRecords = useMemo(() => {
    return settlements.filter((s: Settlement) => {
      const isManager = ['FINANCIAL_MANAGER', 'HEAD_ACCOUNTANT', 'ADMIN'].includes(user?.role || '');
      const matchUser = isManager || (user?.fullName ? (s.recordedBy || '').includes(user.fullName) || (s.recordedBy || '').includes('Accountant') : true);
      
      let matchDate = true;
      if (filterDateFrom || filterDateTo) {
        const itemDate = new Date(s.submittedAt);
        itemDate.setHours(0, 0, 0, 0);
        
        if (filterDateFrom) {
          const fromDate = new Date(filterDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (itemDate < fromDate) matchDate = false;
        }
        if (filterDateTo) {
          const toDate = new Date(filterDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (itemDate > toDate) matchDate = false;
        }
      }
      
      return matchUser && matchDate;
    });
  }, [settlements, user, filterDateFrom, filterDateTo]);

  const columns = [
    { key: 'id', label: 'RECORD ID', sortable: true },
    {
      key: 'type',
      label: 'TYPE',
      sortable: true,
      render: (row: Settlement) => (
        <span style={{ 
          padding: '4px 10px', 
          borderRadius: '20px', 
          fontSize: '11px', 
          fontWeight: 700,
          background: row.type === 'Leftover return' ? '#ECFDF5' : '#FFFBEB',
          color: row.type === 'Leftover return' ? '#065F46' : '#92400E'
        }}>
          {row.type}
        </span>
      )
    },
    {
      key: 'courierName',
      label: 'COURIER / TRIP',
      render: (row: Settlement) => (
        <>
          <div style={{ fontWeight: 600, color: '#1E293B', marginBottom: '2px' }}>{row.courierName}</div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>{row.tripRef}</div>
        </>
      )
    },
    {
      key: 'submittedAt',
      label: 'SUBMITTED',
      sortable: true,
      render: (row: Settlement) => (
        <div style={{ fontWeight: 600, color: '#1E293B' }}>
          {new Date(row.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          , {new Date(row.submittedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )
    },
    {
      key: 'amount',
      label: 'AMOUNT',
      sortable: true,
      render: (row: Settlement) => (
        <div style={{ fontWeight: 800, color: row.type === 'Leftover return' ? '#10B981' : '#3B82F6' }}>
          ₱{row.amount.toLocaleString('en-PH', {minimumFractionDigits: 2})}
        </div>
      )
    },
    {
      key: 'status',
      label: 'STATUS',
      sortable: true,
      render: (row: Settlement) => (
        <span style={{ 
          padding: '4px 10px', 
          borderRadius: '20px', 
          fontSize: '11px', 
          fontWeight: 700,
          background: row.status === 'For validation' ? '#FFFBEB' : row.status === 'Validated' ? '#ECFDF5' : '#FEF2F2',
          color: row.status === 'For validation' ? '#B45309' : row.status === 'Validated' ? '#047857' : '#991B1B'
        }}>
          {row.status}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'ACTION',
      render: (row: Settlement) => (
        <Dropdown
          align="right"
          items={[
            {
              key: 'view',
              label: 'View Details',
              icon: 'ti-eye',
              onClick: () => setSelectedRecord(row)
            }
          ]}
        />
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card style={{ padding: '24px' }}>
        <DataTable
          data={myRecords}
          columns={columns}
          rowKey="id"
          searchPlaceholder="Search by ID, courier, or trip ref..."
          searchFields={['id', 'courierName', 'tripRef']}
          filters={[
            {
              key: 'status',
              label: 'Status',
              options: [
                { label: 'All Statuses', value: '' },
                { label: 'For validation', value: 'For validation' },
                { label: 'Validated', value: 'Validated' },
                { label: 'Rejected', value: 'Rejected' }
              ],
              filterFn: (row: Settlement, value: string) => value === '' || row.status === value
            }
          ]}
          customFilters={
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <CalendarPicker
                label="From:"
                placeholder="Start date..."
                value={filterDateFrom}
                onChange={date => setFilterDateFrom(date)}
                variant="toolbar"
              />
              <CalendarPicker
                label="To:"
                placeholder="End date..."
                value={filterDateTo}
                onChange={date => setFilterDateTo(date)}
                minDate={filterDateFrom}
                variant="toolbar"
              />
            </div>
          }
          createButtons={[
            {
              label: 'Record Settlement',
              icon: 'ti-plus',
              variant: 'primary',
              onClick: () => setIsModalOpen(true)
            }
          ]}
          defaultPageSize={10}
        />
      </Card>

      <RecordSettlementModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          refetch();
        }}
      />

      {/* View Details Modal */}
      {selectedRecord && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '24px' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                {selectedRecord.id} • {selectedRecord.type}
              </h2>
              <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#64748B' }}>
                View details of your submitted settlement.
              </p>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>{selectedRecord.courierName}</span>
                  <span style={{ color: '#1E293B', fontWeight: 700 }}>{selectedRecord.tripRef}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>Cash advance</span>
                  <span style={{ color: '#1E293B', fontWeight: 700 }}>₱{selectedRecord.cashAdvance.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '13px' }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>Total expenses</span>
                  <span style={{ color: '#1E293B', fontWeight: 700 }}>− ₱{selectedRecord.totalExpenses.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
                </div>
                
                <div style={{ height: '1px', background: '#E2E8F0', margin: '0 -16px 12px' }}></div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: '#0F172A', fontWeight: 800 }}>Expected {selectedRecord.type === 'Leftover return' ? 'leftover' : 'reimbursement'}</span>
                  <span style={{ color: '#0F172A', fontWeight: 800 }}>₱{selectedRecord.amount.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
                </div>
              </div>

              {selectedRecord.type === 'Leftover return' && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Envelope no.</span>
                    <span style={{ color: '#1E293B', fontWeight: 700 }}>{selectedRecord.envelopeNo}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Cash counted by you</span>
                    <span style={{ color: '#1E293B', fontWeight: 700 }}>₱{selectedRecord.cashCounted?.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Matches expected leftover</span>
                    <span style={{ color: '#10B981', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ti ti-check" /> Yes
                    </span>
                  </div>
                </div>
              )}

              {selectedRecord.type === 'Reimbursement' && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Supervisor Approval</span>
                    <span style={{ color: '#1E293B', fontWeight: 700 }}>Checked</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Original Receipts Submitted</span>
                    <span style={{ color: '#10B981', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ti ti-check" /> Yes
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button 
                  onClick={() => setSelectedRecord(null)}
                  style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, border: '1px solid #E2E8F0', background: 'white', color: '#64748B', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
