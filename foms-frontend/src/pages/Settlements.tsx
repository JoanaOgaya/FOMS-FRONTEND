import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Buttons';
import { KpiCard } from '../components/shared/KpiCard';
import Dropdown from '../components/Dropdown';
import { useToast } from '../components/ToastContext';
import { CalendarPicker } from '../components/FormModals';
import { createPortal } from 'react-dom';
import { settlementsService } from '../services/settlementsService';
import { cashFlowService } from '../services/cashFlowService';
import { useQuery } from '../hooks/useQuery';
import { invalidateForMutation } from '../services/invalidation';
import { Settlement } from '../types/entities';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { formatCurrency } from '../utils/format';

const Settlements: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const {
    data: fetchedSettlements,
    isLoading: loading,
    refetch,
  } = useQuery('settlements:all', async () => {
    const res = await settlementsService.list({ pageSize: 100 });
    return res.items || [];
  });

  const settlements = fetchedSettlements ?? [];

  const [filterTab, setFilterTab] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRecent, setShowRecent] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const saveRecentSearch = (term: string) => {
    if (!term.trim()) return;
    setRecentSearches(prev => {
      return [term.trim(), ...prev.filter(t => t.toLowerCase() !== term.trim().toLowerCase())].slice(0, 5);
    });
  };

  const handleSearchBlur = () => {
    setTimeout(() => setShowRecent(false), 200);
    saveRecentSearch(searchQuery);
  };

  const [selectedRecord, setSelectedRecord] = useState<Settlement | null>(null);
  const [decision, setDecision] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [remarks, setRemarks] = useState('');

  // Stats
  const pendingCount = settlements.filter((s: Settlement) => s.status === 'For validation').length;
  const validatedCount = settlements.filter((s: Settlement) => s.status === 'Validated').length;
  const rejectedCount = settlements.filter((s: Settlement) => s.status === 'Rejected').length;

  const pendingLeftoverAmount = settlements.filter((s: Settlement) => s.status === 'For validation' && s.type === 'Leftover return').reduce((sum: number, s: Settlement) => sum + s.amount, 0);
  const leftoverEnvelopesCount = settlements.filter((s: Settlement) => s.status === 'For validation' && s.type === 'Leftover return').length;
  
  const pendingReimbAmount = settlements.filter((s: Settlement) => s.status === 'For validation' && s.type === 'Reimbursement').reduce((sum: number, s: Settlement) => sum + s.amount, 0);
  const reimbRequestsCount = settlements.filter((s: Settlement) => s.status === 'For validation' && s.type === 'Reimbursement').length;

  // Filter Data
  const filteredData = useMemo(() => {
    return settlements.filter((s: Settlement) => {
      // Tab filter
      if (filterTab === 'Pending' && s.status !== 'For validation') return false;
      if (filterTab === 'Validated' && s.status !== 'Validated') return false;
      if (filterTab === 'Rejected' && s.status !== 'Rejected') return false;
      
      // Type filter
      if (typeFilter && s.type !== typeFilter) return false;

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch = 
          s.id.toLowerCase().includes(q) ||
          s.courierName.toLowerCase().includes(q) ||
          s.tripRef.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Date filtering
      const submitDate = new Date(s.submittedAt);
      submitDate.setHours(0, 0, 0, 0); // Normalize to start of day

      if (dateFrom) {
        const fromD = new Date(dateFrom);
        fromD.setHours(0, 0, 0, 0);
        if (submitDate < fromD) return false;
      }
      
      if (dateTo) {
        const toD = new Date(dateTo);
        toD.setHours(23, 59, 59, 999);
        if (submitDate > toD) return false;
      }

      return true;
    });
  }, [settlements, filterTab, searchQuery, typeFilter, dateFrom, dateTo]);

  const handleReviewClick = (row: Settlement) => {
    setSelectedRecord(row);
    setDecision('');
    setRejectionReason('');
    setRemarks('');
  };

  const handleConfirmDecision = async () => {
    if (!decision || !selectedRecord || isSubmitting) {
      if (!decision) toast.error('Please select a decision first.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newStatus = decision === 'approve' ? 'Validated' : 'Rejected';
      await settlementsService.update(selectedRecord.id, { status: newStatus as any });

      // Add to cash flow if validated
      if (decision === 'approve') {
        const isLeftover = selectedRecord.type === 'Leftover return';
        await cashFlowService.create({
          type: isLeftover ? 'Inflow' : 'Outflow',
          amount: selectedRecord.amount,
          sourceReference: selectedRecord.id,
          date: new Date().toISOString(),
          recordedBy: user?.fullName || 'System',
        });
      }

      invalidateForMutation(decision === 'approve' ? 'approveSettlement' : 'rejectSettlement');
      toast.success(`Settlement ${selectedRecord.id} has been ${newStatus.toLowerCase()}.`);
      setSelectedRecord(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update settlement');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading settlements..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Stats Cards */}
      <div className="kpi-grid">
        <KpiCard 
          label="Pending Validation" 
          value={pendingCount} 
          icon="ti-clock-hour-4" 
          variant="warning" 
          periodText="waiting for you" 
        />
        <KpiCard 
          label="Leftover Cash" 
          value={formatCurrency(pendingLeftoverAmount)} 
          icon="ti-cash" 
          variant="success" 
          periodText={`${leftoverEnvelopesCount} envelopes recorded`} 
        />
        <KpiCard 
          label="Reimbursements" 
          value={formatCurrency(pendingReimbAmount)} 
          icon="ti-receipt-refund" 
          variant="info" 
          periodText={`${reimbRequestsCount} requests`} 
        />
      </div>

      {/* Table Section */}
      <Card style={{ padding: '24px' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '16px' }} />
            <input 
              type="text" 
              placeholder="Search by ID, courier, or trip ref.." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={(e) => {
                setShowRecent(true);
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.border = '1px solid #0D9488';
              }}
              onBlur={(e) => {
                handleSearchBlur();
                e.currentTarget.style.background = '#F1F5F9';
                e.currentTarget.style.border = '1px solid transparent';
              }}
              style={{ padding: '8px 16px 8px 40px', borderRadius: '28px', border: '1px solid transparent', fontSize: '13px', width: '100%', outline: 'none', background: '#F1F5F9', color: '#1E293B', transition: 'all 0.2s', boxSizing: 'border-box' }}
            />
            {showRecent && recentSearches.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 8, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', zIndex: 100, paddingBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', padding: '12px 16px 8px' }}>RECENT</div>
                {recentSearches.map((term, i) => (
                  <div key={i} onMouseDown={(e) => { e.preventDefault(); setSearchQuery(term); setShowRecent(false); }} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#F7F9FF'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 12, fontSize: 16, background: '#F1F5F9', color: '#64748B' }}>
                      <i className="ti ti-history" />
                    </div>
                    <span style={{ fontSize: 13, color: '#1E293B', fontWeight: 500, flex: 1 }}>{term}</span>
                    <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 12 }}>Search</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <select 
            value={filterTab} 
            onChange={(e) => setFilterTab(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', outline: 'none', background: '#F8FAFC', cursor: 'pointer', transition: 'border-color 0.2s, background-color 0.2s' }}
            onFocus={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#3B82F6'; }}
            onBlur={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
          >
            <option value="">Status</option>
            <option value="Pending">Pending ({pendingCount})</option>
            <option value="Validated">Validated ({validatedCount})</option>
            <option value="Rejected">Rejected ({rejectedCount})</option>
          </select>
          <select 
            value={typeFilter} 
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', outline: 'none', background: '#F8FAFC', cursor: 'pointer', transition: 'border-color 0.2s, background-color 0.2s' }}
            onFocus={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#3B82F6'; }}
            onBlur={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
          >
            <option value="">Filter by Type</option>
            <option value="Leftover return">Leftover return</option>
            <option value="Reimbursement">Reimbursement</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>From:</span>
              <div style={{ width: 140 }}>
                <CalendarPicker
                  label=""
                  value={dateFrom}
                  onChange={setDateFrom}
                  placeholder="Start date..."
                  variant="filter"
                  maxDate="2026-12-31"
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>To:</span>
              <div style={{ width: 140 }}>
                <CalendarPicker
                  label=""
                  value={dateTo}
                  onChange={setDateTo}
                  placeholder="End date..."
                  variant="filter"
                  minDate={dateFrom}
                  maxDate="2026-12-31"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Settlements Cards Grid */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 16px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748B' }}>
            Showing <strong style={{ color: '#0F172A' }}>{filteredData.length}</strong> settlement record{filteredData.length === 1 ? '' : 's'}
          </div>
        </div>

        {filteredData.length === 0 ? (
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
              No settlement records match the current filter or search criteria.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
            {filteredData.map((row: Settlement) => {
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
                        {isLeftover ? 'LEFTOVER AMOUNT' : 'REIMBURSEMENT AMOUNT'}
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

                  {/* Actions Footer */}
                  <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => handleReviewClick(row)}
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
                      <i className={isPending ? "ti ti-file-search" : "ti ti-eye"} />
                      {isPending ? 'Review Settlement' : 'View Details'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Review Modal */}
      {selectedRecord && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '24px' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                {selectedRecord.id} • {selectedRecord.type}
              </h2>
              <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#64748B' }}>
                Submitted by the Accountant. Review the details, then choose a decision.
              </p>

              {/* Box 1 */}
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

              {/* Box 2 */}
              {selectedRecord.type === 'Leftover return' && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Envelope no.</span>
                    <span style={{ color: '#1E293B', fontWeight: 700 }}>{selectedRecord.envelopeNo}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Cash counted by Accountant</span>
                    <span style={{ color: '#1E293B', fontWeight: 700 }}>{formatCurrency(selectedRecord.cashCounted ?? 0)}</span>
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

              <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>
                Recorded by {selectedRecord.recordedBy} • {new Date(selectedRecord.recordedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, {new Date(selectedRecord.recordedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>

              {selectedRecord.status === 'For validation' ? (
                <>
                  <div style={{ marginBottom: decision ? '16px' : '24px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>Decision</label>
                    <select 
                      value={decision}
                      onChange={(e) => setDecision(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', outline: 'none' }}
                    >
                      <option value="">Select decision...</option>
                      <option value="approve">✓ Validate</option>
                      <option value="reject">✕ Reject</option>
                    </select>
                  </div>

                  {decision === 'reject' && (
                    <>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>Reason for rejection</label>
                        <select 
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', outline: 'none' }}
                        >
                          <option value="">Select a reason...</option>
                          <option value="Cash short / over not explained">Cash short / over not explained</option>
                          <option value="Wrong computation (advance / expenses)">Wrong computation (advance / expenses)</option>
                          <option value="Envelope not received / wrong envelope no.">Envelope not received / wrong envelope no.</option>
                          <option value="Missing original receipts">Missing original receipts</option>
                          <option value="No prior supervisor approval">No prior supervisor approval</option>
                          <option value="Duplicate record">Duplicate record</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>Details for the Accountant</label>
                        <textarea 
                          placeholder="What should be corrected?"
                          value={remarks}
                          onChange={(e) => setRemarks(e.target.value)}
                          rows={3}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', outline: 'none', resize: 'none' }}
                        />
                      </div>
                    </>
                  )}

                  {decision === 'approve' && (
                    <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>Remarks (optional)</label>
                      <textarea 
                        placeholder="Sent to Asst. Finance Manager for approval"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        rows={2}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', outline: 'none', resize: 'none' }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div style={{ marginBottom: '24px', padding: '16px', background: selectedRecord.status === 'Validated' ? '#ECFDF5' : '#FEF2F2', borderRadius: '8px', border: `1px solid ${selectedRecord.status === 'Validated' ? '#A7F3D0' : '#FECACA'}` }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: selectedRecord.status === 'Validated' ? '#065F46' : '#991B1B' }}>
                    This settlement was already {selectedRecord.status.toLowerCase()}.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <Button title="Close" variant="secondary" onClick={() => setSelectedRecord(null)} />
                {selectedRecord.status === 'For validation' && (
                  <button 
                    onClick={handleConfirmDecision}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: '6px', 
                      fontSize: '13px', 
                      fontWeight: 700, 
                      border: 'none', 
                      cursor: 'pointer',
                      background: decision === 'reject' ? '#EF4444' : '#10B981',
                      color: 'white',
                      opacity: decision ? 1 : 0.5
                    }}
                    disabled={!decision || isSubmitting}
                  >
                    {isSubmitting ? 'Processing...' : decision === 'reject' ? 'Confirm reject' : decision === 'approve' ? 'Confirm validate' : 'Confirm'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '11px',
  fontWeight: 800,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const tdStyle: React.CSSProperties = {
  padding: '16px',
  fontSize: '13px',
  color: '#1E293B'
};

export default Settlements;
