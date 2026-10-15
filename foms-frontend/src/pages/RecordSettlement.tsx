import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import RecordSettlementModal from '../components/RecordSettlementModal';
import { CalendarPicker } from '../components/FormModals';
import { useQuery } from '../hooks/useQuery';
import { settlementsService } from '../services/settlementsService';
import type { Settlement } from '../types/entities';
import { formatCurrency } from '../utils/format';

export default function RecordSettlement() {
  const { data: settlementsData, refetch } = useQuery('settlements', () => settlementsService.list({ pageSize: 100 }));
  const settlements: Settlement[] = settlementsData?.items || [];
  const { user } = useAuth();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<Settlement | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Filter records for current user / accountant view + search & filters
  const filteredRecords = useMemo(() => {
    return settlements.filter((s: Settlement) => {
      const isManager = ['FINANCIAL_MANAGER', 'HEAD_ACCOUNTANT', 'ADMIN'].includes(user?.role || '');
      const matchUser = isManager || (user?.fullName ? (s.recordedBy || '').includes(user.fullName) || (s.recordedBy || '').includes('Accountant') : true);
      if (!matchUser) return false;
      
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = 
          (s.id || '').toLowerCase().includes(q) ||
          (s.courierName || '').toLowerCase().includes(q) ||
          (s.tripRef || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      if (statusFilter && s.status !== statusFilter) return false;
      if (typeFilter && s.type !== typeFilter) return false;

      if (filterDateFrom || filterDateTo) {
        const itemDate = new Date(s.submittedAt);
        itemDate.setHours(0, 0, 0, 0);
        
        if (filterDateFrom) {
          const fromDate = new Date(filterDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (itemDate < fromDate) return false;
        }
        if (filterDateTo) {
          const toDate = new Date(filterDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (itemDate > toDate) return false;
        }
      }
      
      return true;
    });
  }, [settlements, user, searchQuery, statusFilter, typeFilter, filterDateFrom, filterDateTo]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card style={{ padding: '24px' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: 280 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: 16 }} />
              <input 
                type="text" 
                placeholder="Search by ID, courier, or trip ref..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: '9px 16px 9px 40px', borderRadius: 28, border: '1px solid #E2E8F0', fontSize: 13, width: '100%', outline: 'none', background: '#F8FAFC', color: '#1E293B', boxSizing: 'border-box' }}
                onFocus={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#0D9488'; }}
                onBlur={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#F8FAFC', cursor: 'pointer' }}
            >
              <option value="">All Statuses</option>
              <option value="For validation">For validation</option>
              <option value="Validated">Validated</option>
              <option value="Rejected">Rejected</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#F8FAFC', cursor: 'pointer' }}
            >
              <option value="">All Types</option>
              <option value="Leftover return">Leftover return</option>
              <option value="Expense liquidation">Expense liquidation</option>
              <option value="Reimbursement">Reimbursement</option>
            </select>

            {/* Date Pickers */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          </div>

          {/* Record Settlement Button */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              background: '#0D9488',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 4px rgba(13,148,136,0.25)',
              transition: 'background 0.2s ease',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#0F766E'}
            onMouseLeave={e => e.currentTarget.style.background = '#0D9488'}
          >
            <i className="ti ti-plus" style={{ fontSize: 15 }} />
            Record Settlement
          </button>
        </div>

        {/* Count Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748B' }}>
            Showing <strong style={{ color: '#0F172A' }}>{filteredRecords.length}</strong> settlement record{filteredRecords.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Cards Grid or Empty */}
        {filteredRecords.length === 0 ? (
          <div style={{
            background: '#F8FAFC',
            borderRadius: 12,
            border: '1px solid #E2E8F0',
            padding: '48px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 24 }}>
              <i className="ti ti-receipt-off" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>No settlements found</div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
              No settlement records match your filters or recorded history.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
            {filteredRecords.map((row: Settlement) => {
              const isLeftover = row.type === 'Leftover return';
              const isPending = row.status === 'For validation';
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
                  {/* Top Row: Type Badge + Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: isLeftover ? '#ECFDF5' : '#FFFBEB',
                      color: isLeftover ? '#065F46' : '#92400E',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <i className={`ti ${isLeftover ? 'ti-cash-banknote' : 'ti-receipt-2'}`} />
                      {row.type}
                    </span>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: isPending ? '#FFFBEB' : row.status === 'Validated' ? '#ECFDF5' : '#FEF2F2',
                      color: isPending ? '#B45309' : row.status === 'Validated' ? '#047857' : '#991B1B'
                    }}>
                      {row.status}
                    </span>
                  </div>

                  {/* Courier Name & Trip Ref */}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#0F172A', lineHeight: 1.3 }}>
                      {row.courierName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: 4 }}>
                        {row.tripRef}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>
                        ID: #{row.id}
                      </span>
                    </div>
                  </div>

                  {/* Amount Highlight Box */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: isLeftover ? '#F0FDF4' : '#EFF6FF',
                    border: `1px solid ${isLeftover ? '#BBF7D0' : '#BFDBFE'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: isLeftover ? '#166534' : '#1E40AF', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        {isLeftover ? 'LEFTOVER AMOUNT' : 'SETTLEMENT AMOUNT'}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: isLeftover ? '#15803D' : '#2563EB', marginTop: 2 }}>
                        {formatCurrency(row.amount)}
                      </div>
                    </div>
                    {Boolean(row.discrepancy && row.discrepancy !== 0) && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: '#FEF2F2',
                          color: '#DC2626',
                          border: '1px solid #FECACA',
                          fontSize: 10.5,
                          fontWeight: 700
                        }}>
                          Discrepancy: {formatCurrency(row.discrepancy)}
                        </span>
                      </div>
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
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>CASH ADVANCE</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginTop: 2 }}>
                        {formatCurrency(row.cashAdvance)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>SUBMITTED AT</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginTop: 2 }}>
                        {new Date(row.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, {new Date(row.submittedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedRecord(row)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: '#0F172A',
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
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#1E293B'}
                      onMouseLeave={e => e.currentTarget.style.background = '#0F172A'}
                    >
                      <i className="ti ti-eye" />
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                  <span style={{ color: '#1E293B', fontWeight: 700 }}>{formatCurrency(selectedRecord.cashAdvance)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '13px' }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>Total expenses</span>
                  <span style={{ color: '#1E293B', fontWeight: 700 }}>− {formatCurrency(selectedRecord.totalExpenses)}</span>
                </div>
                
                <div style={{ height: '1px', background: '#E2E8F0', margin: '0 -16px 12px' }}></div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: '#0F172A', fontWeight: 800 }}>Expected {selectedRecord.type === 'Leftover return' ? 'leftover' : 'reimbursement'}</span>
                  <span style={{ color: '#0F172A', fontWeight: 800 }}>{formatCurrency(selectedRecord.amount)}</span>
                </div>
              </div>

              {selectedRecord.type === 'Leftover return' && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Envelope no.</span>
                    <span style={{ color: '#1E293B', fontWeight: 700 }}>{selectedRecord.envelopeNo || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Cash counted by you</span>
                    <span style={{ color: '#1E293B', fontWeight: 700 }}>{formatCurrency(selectedRecord.cashCounted)}</span>
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
