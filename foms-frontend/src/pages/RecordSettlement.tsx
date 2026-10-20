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

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredRecords = useMemo(() => {
    return myRecords.filter((s: Settlement) => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || s.id.toLowerCase().includes(q) || s.courierName.toLowerCase().includes(q) || s.tripRef.toLowerCase().includes(q);
      const matchStatus = !statusFilter || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [myRecords, searchQuery, statusFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card style={{ padding: '24px' }}>
        {/* Header with Title, View Mode Switcher, and Record Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Record Settlement</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
              Track cash advances, liquidation submissions, and trip settlements
            </p>
          </div>

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

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                background: '#0D9488',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              }}
            >
              <i className="ti ti-plus" /> + Record Settlement
            </button>
          </div>
        </div>

        {viewMode === 'cards' ? (
          <div>
            {/* Filter Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#0D9488', fontSize: '16px' }} />
                <input
                  type="text"
                  placeholder="Search by ID, courier, or trip..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
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
                <option value="">All Statuses</option>
                <option value="For validation">For validation</option>
                <option value="Validated">Validated</option>
                <option value="Rejected">Rejected</option>
              </select>

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

              {(searchQuery || statusFilter || filterDateFrom || filterDateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    setFilterDateFrom('');
                    setFilterDateTo('');
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

            {/* Cards Grid */}
            {filteredRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 20px', color: '#94A3B8' }}>
                <i className="ti ti-receipt-off" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#CBD5E1' }} />
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#334155' }}>No settlement records found</div>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>No settlement submissions match your filter criteria.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {filteredRecords.map((row: Settlement) => (
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
                      gap: '16px',
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
                    {/* Top: Record ID & Type & Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', background: '#F1F5F9', padding: '3px 10px', borderRadius: '6px' }}>
                          #{row.id}
                        </span>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: row.type === 'Leftover return' ? '#ECFDF5' : '#FFFBEB',
                          color: row.type === 'Leftover return' ? '#065F46' : '#92400E'
                        }}>
                          {row.type}
                        </span>
                      </div>
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
                    </div>

                    {/* Courier and Trip */}
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                        {row.courierName}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>
                        <i className="ti ti-truck" style={{ fontSize: '14px' }} />
                        <span>{row.tripRef}</span>
                        <span>•</span>
                        <span>{new Date(row.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, {new Date(row.submittedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Amount Details Box */}
                    <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '12px 14px', border: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>SETTLEMENT AMOUNT</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: row.type === 'Leftover return' ? '#10B981' : '#3B82F6', marginTop: '2px' }}>
                          ₱{(Number(row.amount) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B' }}>EXPENSES</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginTop: '2px' }}>
                          ₱{(Number(row.totalExpenses) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    {/* Card Bottom: View Details Action */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(row)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 16px',
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
                        <i className="ti ti-eye" style={{ fontSize: '14px' }} />
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <DataTable
            title=""
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
            defaultPageSize={10}
          />
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
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box' }}
          onClick={() => setSelectedRecord(null)}
        >
          <div
            style={{ background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                  {selectedRecord.id} • {selectedRecord.type}
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#F1F5F9',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#64748B',
                    fontSize: '18px',
                  }}
                >
                  &times;
                </button>
              </div>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748B' }}>
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
