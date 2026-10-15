import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { arService } from '../services/arService';
import { http } from '../services/apiClient';
import { collectionService } from '../services/ai/collection.service';
import { KpiCard } from '../components/shared/KpiCard';
import { DataTable } from '../components/DataTable';
import { TableContainer } from '../components/TableContainer';
import { ForbiddenPage } from '../components/shared/ForbiddenPage';
import { RiskBadge } from '../components/ai/RiskBadge';
import { PriorityBadge } from '../components/ai/PriorityBadge';
import { AiDisclaimer } from '../components/ai/AiDisclaimer';
import { canViewReceivableRisk, canActOnRecord } from '../utils/roleAccess';

const getDaysOverdue = (dueDate: string) => {
  if (!dueDate || dueDate === 'N/A') return 0;
  const diff = (new Date().getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(diff));
};

const formatPeso = (n: number) => `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const getEmployeeNameByRole = (role: string, defaultName: string) => {
  return defaultName || role || 'User';
};

const SharedKPIs = ({ arRecords }: { arRecords: any[] }) => {
  const activeArRecords = arRecords.filter(r => r.outstandingBalance > 0);
  const totalAr = activeArRecords.reduce((s, r) => s + r.outstandingBalance, 0);

  const agingTotals = {
    '0-30 days': 0,
    '31-60 days': 0,
    '61-90 days': 0,
    '90+ days': 0,
  };
  
  const mapBracket = (bracket: string) => bracket === 'Current' ? '0-30 days' : bracket;

  activeArRecords.forEach(r => {
    if (r.outstandingBalance > 0) {
       const mapped = mapBracket(r.agingBracket);
       if (mapped in agingTotals) {
         agingTotals[mapped as keyof typeof agingTotals] += r.outstandingBalance;
       }
    }
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
      <KpiCard label="Total AR" value={formatPeso(totalAr)} icon="ti-wallet" variant="info" />
      <KpiCard label="0-30 days" value={formatPeso(agingTotals['0-30 days'])} icon="ti-alert-circle" variant="warning" />
      <KpiCard label="31-60 days" value={formatPeso(agingTotals['31-60 days'])} icon="ti-alert-triangle" variant="warning" />
      <KpiCard label="61-90 days" value={formatPeso(agingTotals['61-90 days'])} icon="ti-alert-triangle" variant="danger" />
      <KpiCard label="90+ days" value={formatPeso(agingTotals['90+ days'])} icon="ti-skull" variant="danger" />
    </div>
  );
};

const CustomSearchFilter = ({ searchQuery, setSearchQuery, priorityFilter, setPriorityFilter, isMisty }: any) => {
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(['Shopee and', 'Lazada Account']);

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: isMisty ? 0 : 12 }}>
      <div style={{ position: 'relative', width: '280px' }}>
        <i className="ti ti-search" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#0D9488', zIndex: 2, fontSize: 18 }}></i>
        <input 
          type="text" 
          placeholder="Search clients..." 
          value={searchQuery}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '10px 16px 10px 42px', border: '1px solid #0D9488', borderRadius: '9999px', fontSize: '0.9rem', outline: 'none', color: '#111827' }}
        />
        {isFocused && (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', zIndex: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', borderBottom: '1px solid #F1F5F9' }}>
              RECENT
            </div>
            {recentSearches.map((term, idx) => (
              <div 
                key={idx}
                onClick={() => { setSearchQuery(term); setIsFocused(false); }}
                style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s', color: '#111827', fontSize: '14px' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-history" style={{ color: '#64748B', fontSize: 16 }}></i>
                  </div>
                  <span style={{ fontWeight: 600 }}>{term}</span>
                </div>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>Search</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <select 
        value={priorityFilter}
        onChange={e => setPriorityFilter(e.target.value)}
        style={{ padding: '10px 16px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: '#fff', cursor: 'pointer', color: '#111827' }}
      >
        <option value="All">Status</option>
        <option value="High Priority">High Priority</option>
        <option value="Medium Priority">Medium Priority</option>
        <option value="Low Priority">Low Priority</option>
      </select>
    </div>
  );
};

// ============================================================================
// MANAGER VIEW (Logged Decisions / Ready for Manager Approval)
// ============================================================================
const ManagerView = ({ token, user, arRecords }: any) => {
  const { toast } = useToast() as any;
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  const [decision, setDecision] = useState('Accept & Close');
  const [actionTaken, setActionTaken] = useState('');
  const [remarks, setRemarks] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const fetchData = async () => {
    setLoading(true);
    try {
      const json: any = await http.get('/ai/collection/recommendations', { status: 'all' });
      const logged = Array.isArray(json) 
        ? json.filter((r: any) => 
            r.review_status && 
            r.review_status !== 'Pending Review' && 
            r.review_status !== 'Reject Priority Assignment'
          ) 
        : [];
        
      const mapped = logged.map((r: any) => {
        const role = r.reviewer_role || 'Accountant';
        return {
          id: String(r.id),
          status: 'VERIFIED',
          createdBy: r.reviewed_by || r.reviewer_username || 'ACCOUNTANT',
          timestamp: r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : 'N/A',
          invoiceNumber: r.priority?.normalized_invoice_number || r.priority?.invoice_number || 'N/A',
          clientName: r.priority?.client_name || 'N/A',
          balanceValue: r.priority?.outstanding_balance || 0,
          balance: `₱${(r.priority?.outstanding_balance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
          priorityLevel: r.priority?.priority_level || 'HIGH PRIORITY',
          dueDate: r.priority?.due_date || 'N/A',
          decision: r.review_status || 'Pending',
          loggedBy: getEmployeeNameByRole(role, r.reviewed_by || r.reviewer_username || 'User'),
          loggedByRole: role,
          actionTaken: r.remarks || 'No action taken',
          remarks: r.recommended_action || 'No remarks',
        };
      });
      
      setData(mapped);
    } catch (e) {
      console.error(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (row: any) => {
    setSelectedRecord(row);
    setDecision('Accept & Close');
    setActionTaken('');
    setRemarks('');
  };

  const handleSubmit = async () => {
    if (!selectedRecord) return;
    if (!actionTaken.trim()) {
      toast.warning('Manager Action Taken is required.', 'Validation');
      return;
    }
    setModalLoading(true);
    try {
      const realId = selectedRecord.id;
      await http.post(`/ai/collection/recommendations/${realId}/review`, {
        decision,
        remarks: actionTaken,
        recommendedAction: remarks,
      });
      toast.success(`Decision saved successfully.`, 'Manager Review Logged');
      setSelectedRecord(null);
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update decision.', 'Error');
    } finally {
      setModalLoading(false);
    }
  };
  const filteredData = data.filter(row => {
    const matchesSearch = (row.clientName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (row.invoiceNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = priorityFilter === 'All' || (row.priorityLevel || '').toLowerCase().includes(priorityFilter.toLowerCase());
    return matchesSearch && matchesPriority;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SharedKPIs arRecords={arRecords} />

      <div style={{ marginTop: 24, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column' }}>
          {!(user?.employeeId === 'EMP-002' || user?.role === 'HEAD_ACCOUNTANT') && (
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>
              For Manager Approval / Logged Decisions
            </h2>
          )}
          <CustomSearchFilter isMisty={user?.employeeId === 'EMP-002' || user?.role === 'HEAD_ACCOUNTANT'} searchQuery={searchQuery} setSearchQuery={setSearchQuery} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} />
        </div>

        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: '#9CA3AF', gap: 10 }}>
              <i className="ti ti-refresh" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 14 }}>Loading logged decisions...</span>
            </div>
          ) : filteredData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', fontSize: 14 }}>
              <i className="ti ti-search" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
              No matching records found.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
              {filteredData.map((row, i) => {
                const overdue = getDaysOverdue(row.dueDate);
                const isRejected = String(row.decision).toLowerCase().includes('reject');
                const isApproved = String(row.decision).toLowerCase().includes('accept') || String(row.decision).toLowerCase().includes('process');
                const decisionColor = isRejected ? '#DC2626' : isApproved ? '#059669' : '#7C3AED';
                const decisionBg = isRejected ? '#FEF2F2' : isApproved ? '#F0FDF4' : '#EDE9FE';
                const actCheck = (user?.role === 'FINANCIAL_MANAGER' || user?.role === 'Financial Manager')
                  ? { allowed: true }
                  : canActOnRecord(user, { ...row, status: row.status || 'VERIFIED' }, 'resolve');

                return (
                  <div
                    key={row.id || i}
                    style={{
                      background: '#fff', border: '1px solid #E2E8F0',
                      borderRadius: 12, padding: 24,
                      display: 'flex', flexDirection: 'column', gap: 16,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    {/* Top Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <PriorityBadge level={row.priorityLevel || 'High Priority'} />
                      <RiskBadge score={row.score ?? null} level={row.priorityLevel} />
                    </div>
                    <AiDisclaimer inline />

                    {/* Title */}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: '#111827' }}>
                        {row.clientName || 'Unknown Account'}
                      </div>
                      <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>
                        {row.invoiceNumber || '—'}
                      </div>
                      
                      <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: decisionBg, color: decisionColor, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                        {row.decision}
                      </div>
                    </div>

                    {/* Details Row */}
                    <div style={{ display: 'flex', gap: 40, marginTop: 4 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>OUTSTANDING BALANCE</div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: '#111827', marginTop: 4 }}>
                          {row.balance}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>DUE DATE</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#111827', marginTop: 4 }}>
                          {row.dueDate && row.dueDate !== 'N/A'
                            ? new Date(row.dueDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Overdue Badge */}
                    {overdue > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                          <i className="ti ti-clock" style={{ fontSize: 14 }} />
                          {overdue} Days Overdue
                        </div>
                      </div>
                    )}

                    {/* Logged By */}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontWeight: 700, fontSize: 14 }}>
                        {row.loggedBy.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{row.loggedBy}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>{row.loggedByRole}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                      <button
                        onClick={() => handleOpenModal(row)}
                        disabled={!actCheck.allowed}
                        title={!actCheck.allowed ? actCheck.reason : undefined}
                        style={{
                          width: '100%', padding: '12px 0',
                          background: !actCheck.allowed ? '#94A3B8' : '#0D9488',
                          color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
                          cursor: !actCheck.allowed ? 'not-allowed' : 'pointer', transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => { if (actCheck.allowed) e.currentTarget.style.opacity = '0.9'; }}
                        onMouseLeave={e => { if (actCheck.allowed) e.currentTarget.style.opacity = '1'; }}
                      >
                        {!actCheck.allowed ? (actCheck.reason || 'Restricted') : 'Final Resolve'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedRecord && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setSelectedRecord(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #E2E8F0' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: '#0F172A' }}>Decision Log Details</h3>
              <button onClick={() => setSelectedRecord(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><i className="ti ti-x" style={{ fontSize: 20 }} /></button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: 20 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Official FOMS Account</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0F172A', marginBottom: 16 }}>{selectedRecord.clientName}</div>
                <div style={{ display: 'flex', gap: 40 }}>
                  <div><div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: 4 }}>Invoice Number</div><div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedRecord.invoiceNumber}</div></div>
                  <div><div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: 4 }}>Outstanding Balance</div><div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedRecord.balance}</div></div>
                </div>
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: 20 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Accountant Audit Trail</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.875rem' }}>
                  <div><strong style={{ color: '#0F172A' }}>Initial Decision:</strong> <span style={{ color: '#475569' }}>{selectedRecord.decision}</span></div>
                  <div><strong style={{ color: '#0F172A' }}>Logged By:</strong> <span style={{ color: '#475569' }}>{selectedRecord.loggedBy} ({selectedRecord.loggedByRole})</span></div>
                  <div><strong style={{ color: '#0F172A' }}>Timestamp:</strong> <span style={{ color: '#475569' }}>{selectedRecord.timestamp}</span></div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', marginTop: 12, border: '1px solid #E2E8F0', fontSize: '0.85rem' }}>
                  <strong style={{ color: '#0F172A' }}>Action Taken:</strong> <span style={{ color: '#475569' }}>{selectedRecord.actionTaken}</span><br/>
                  <strong style={{ color: '#0F172A' }}>Notes:</strong> <span style={{ color: '#475569' }}>{selectedRecord.remarks}</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}><i className="ti ti-circle-check" style={{ fontSize: 16 }} /> Manager Review</div>
                <div style={{ marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Manager Decision</div>
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <select value={decision} onChange={e => setDecision(e.target.value)} style={{ width: '100%', appearance: 'none', padding: '12px 16px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.95rem', color: '#0F172A', outline: 'none' }}>
                    <option value="Accept & Close">Accept &amp; Close (Mark Completed)</option>
                    <option value="Proceed with Legal Escalation">Proceed with Legal Escalation</option>
                    <option value="Reject Priority Assignment">Reject &amp; Return to Accountant</option>
                  </select>
                  <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#64748B', pointerEvents: 'none' }} />
                </div>
                <div style={{ marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Manager Action Taken <span style={{ color: '#EF4444' }}>*</span></div>
                <div style={{ marginBottom: 16 }}><input type="text" value={actionTaken} onChange={e => setActionTaken(e.target.value)} placeholder="e.g. Approved and closed." style={{ width: '100%', padding: '12px 16px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.95rem', color: '#0F172A', outline: 'none' }} /></div>
                <div style={{ marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Manager Remarks</div>
                <div><textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Notes..." rows={3} style={{ width: '100%', padding: '12px 16px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.95rem', color: '#0F172A', outline: 'none', resize: 'vertical' }} /></div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 12 }}>
              <button onClick={() => setSelectedRecord(null)} style={{ flex: 1, padding: '12px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>Cancel</button>
              <button disabled={modalLoading || !actionTaken.trim()} onClick={handleSubmit} style={{ flex: 1, padding: '12px', background: (!actionTaken.trim() || modalLoading) ? '#94A3B8' : '#0F172A', border: 'none', borderRadius: '8px', fontWeight: 700, color: '#fff', cursor: (!actionTaken.trim() || modalLoading) ? 'not-allowed' : 'pointer' }}>
                {modalLoading ? 'Saving...' : 'Log Manager Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ACCOUNTANT VIEW (Pending Priorities)
// ============================================================================
const AccountantView = ({ token, user, arRecords }: any) => {
  const { toast } = useToast() as any;
  const [recs, setRecs] = useState<any[]>([]);
  const [serverPriorities, setServerPriorities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedPriority, setSelectedPriority] = useState<any | null>(null);
  const [decision, setDecision] = useState('Accept Recommendation');
  const [remarks, setRemarks] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const data: any = await http.get('/ai/collection/recommendations', { status: 'all' });
      setRecs(Array.isArray(data) ? data : []);
    } catch {}
    try {
      const prioRes: any = await collectionService.getPriorityList();
      const items = Array.isArray(prioRes) ? prioRes : prioRes?.items || [];
      setServerPriorities(items);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const priorityList = useMemo(() => {
    return serverPriorities.map((p: any) => {
      const overdue = p.daysOverdue ?? p.overdue_days ?? getDaysOverdue(p.dueDate || p.due_date);
      const invNum = p.invoiceNumber || p.invoice_number;
      const rejectedRec = recs.find(rec => (rec.priority?.invoice_number === invNum || rec.invoice_number === invNum) && rec.review_status === 'Reject Priority Assignment');

      return {
        id: p.id,
        invoice_number: invNum || '—',
        client_name: p.clientName || p.client_name || 'Unknown',
        outstanding_balance: p.outstandingBalance ?? p.outstanding_balance ?? 0,
        due_date: p.dueDate || p.due_date || '',
        priority_level: p.priorityLevel || p.riskLevel || p.priority_level || 'Normal Priority',
        priority_score: p.priorityScore ?? p.riskScore ?? p.priority_score ?? 0,
        suggested_action: p.suggestedAction || p.suggested_action || 'Schedule priority follow-up call immediately to secure payment commitments.',
        overdue_days: overdue,
        is_rejected: !!rejectedRec,
        rejected_remarks: rejectedRec?.remarks || 'Manager requested revision.',
        rec_id: rejectedRec?.id || null,
        createdBy: p.createdBy,
      };
    });
  }, [serverPriorities, recs]);

  const handleOpenModal = (row: any) => {
    setSelectedPriority(row);
    setDecision('Accept Recommendation');
    setRemarks('');
  };

  const handleSubmit = async () => {
    if (!selectedPriority) return;
    if (selectedPriority.createdBy && (selectedPriority.createdBy === user?.id || selectedPriority.createdBy === user?.employeeId)) {
      toast.error('You cannot act on your own record.', 'Separation of Duties');
      return;
    }
    setModalLoading(true);
    try {
      const endpoint = selectedPriority.rec_id 
        ? `/ai/collection/recommendations/${selectedPriority.rec_id}/review`
        : `/ai/collection/recommendations/new`;
        
      await http.post(endpoint, {
        priority_id: selectedPriority.id,
        decision,
        remarks,
        recommendedAction: remarks,
      });
      toast.success(`Priority updated and submitted!`, 'Success');
      setSelectedPriority(null);
      fetchRecommendations();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit priority', 'Error');
    } finally {
      setModalLoading(false);
    }
  };
  const filteredPriorityList = priorityList.filter((row: any) => {
    const matchesSearch = (row.client_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (row.invoice_number || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = priorityFilter === 'All' || (row.priority_level || '').toLowerCase().includes(priorityFilter.toLowerCase());
    return matchesSearch && matchesPriority;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SharedKPIs arRecords={arRecords} />

      <div style={{ marginTop: 24, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>
            Pending Priority Accounts
          </h2>
          <CustomSearchFilter searchQuery={searchQuery} setSearchQuery={setSearchQuery} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} />
        </div>
        
        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', fontSize: 14 }}>
              <i className="ti ti-refresh" style={{ fontSize: 24, animation: 'spin 1s linear infinite', display: 'block', marginBottom: 12 }} />
              Loading priority accounts...
            </div>
          ) : filteredPriorityList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', fontSize: 14 }}>
              <i className="ti ti-search" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
              No matching priorities found.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
              {filteredPriorityList.map((row: any, i: number) => {
                const overdue = row.overdue_days || getDaysOverdue(row.due_date);
                const isCreator = !!(row.createdBy && (row.createdBy === user?.id || row.createdBy === user?.employeeId));

                return (
                  <div
                    key={row.id || i}
                    style={{
                      background: '#fff', border: '1px solid #E2E8F0',
                      borderRadius: 12, padding: 24,
                      display: 'flex', flexDirection: 'column', gap: 16,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    {/* Top Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <PriorityBadge level={row.priority_level} score={row.priority_score} />
                      <RiskBadge score={row.priority_score} level={row.priority_level} />
                    </div>
                    <AiDisclaimer inline />

                    {/* Title */}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: '#111827' }}>
                        {row.client_name || 'Unknown Account'}
                      </div>
                      <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>
                        {row.invoice_number || '—'}
                      </div>
                      {row.is_rejected && (
                        <div style={{ color: '#DC2626', fontSize: 11, fontWeight: 700, marginTop: 8 }}>
                          <i className="ti ti-alert-circle" /> Rejected by Manager
                        </div>
                      )}
                    </div>

                    {/* Details Row */}
                    <div style={{ display: 'flex', gap: 40, marginTop: 4 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>OUTSTANDING BALANCE</div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: '#111827', marginTop: 4 }}>
                          ₱{(row.outstanding_balance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>DUE DATE</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#111827', marginTop: 4 }}>
                          {row.due_date && row.due_date !== 'N/A'
                            ? new Date(row.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Overdue Badge */}
                    {overdue > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                          <i className="ti ti-clock" style={{ fontSize: 14 }} />
                          {overdue} Days Overdue
                        </div>
                      </div>
                    )}

                    {/* Action Basis */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', marginBottom: 4 }}>AI SUGGESTION &amp; ACTION BASIS</div>
                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                        {row.suggested_action}
                      </div>
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                      <button
                        onClick={() => handleOpenModal(row)}
                        disabled={isCreator}
                        title={isCreator ? 'You cannot act on your own record' : undefined}
                        style={{
                          width: '100%', padding: '12px 0',
                          background: isCreator ? '#94A3B8' : row.is_rejected ? '#DC2626' : '#0D9488',
                          color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
                          cursor: isCreator ? 'not-allowed' : 'pointer', transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => { if (!isCreator) e.currentTarget.style.opacity = '0.9'; }}
                        onMouseLeave={e => { if (!isCreator) e.currentTarget.style.opacity = '1'; }}
                      >
                        {isCreator ? 'Cannot Act (Own Record)' : row.is_rejected ? 'Revise Recommendation' : 'Review Recommendation'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedPriority && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setSelectedPriority(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px 32px', overflowY: 'auto' }}>
              
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', marginBottom: 4 }}>{selectedPriority.invoice_number || 'INV-XXXX-XXXX'}</div>
                  <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>{selectedPriority.client_name}</h3>
                  <PriorityBadge level={selectedPriority.priority_level} score={selectedPriority.priority_score} />
                </div>
                <button onClick={() => setSelectedPriority(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#0F172A' }}><i className="ti ti-x" style={{ fontSize: 24 }} /></button>
              </div>

              {/* OVERVIEW */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>OVERVIEW</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Client Name</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedPriority.client_name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Outstanding Balance</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>₱{(selectedPriority.outstanding_balance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Due Date</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>
                      {selectedPriority.due_date && selectedPriority.due_date !== 'N/A'
                        ? new Date(selectedPriority.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Days Overdue</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedPriority.overdue_days || 0} days</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Priority Score</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedPriority.priority_score}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Priority Level</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedPriority.priority_level || 'Normal Priority'}</span>
                  </div>
                </div>
              </div>

              {/* AI RECOMMENDATION */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  <i className="ti ti-wand" style={{ fontSize: 18 }} /> AI RECOMMENDATION
                </div>
                <div style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 8, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
                    <i className="ti ti-file-description" style={{ fontSize: 16 }} /> Suggested Action Plan
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.5 }}>
                    {selectedPriority.suggested_action}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <AiDisclaimer inline />
                  </div>
                </div>
              </div>

              {/* FINANCE REVIEW */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
                  <i className="ti ti-file-invoice" style={{ fontSize: 18 }} /> FINANCE REVIEW
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: 8 }}>Review Decision</label>
                  <div style={{ position: 'relative' }}>
                    <select value={decision} onChange={e => setDecision(e.target.value)} style={{ width: '100%', appearance: 'none', padding: '10px 14px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.9rem', color: '#0F172A', outline: 'none' }}>
                      <option value="Accept Recommendation">Accept Recommendation</option>
                      <option value="Reviewed & Closed">Reviewed &amp; Closed</option>
                      <option value="Reject Priority Assignment">Reject Priority Assignment</option>
                    </select>
                    <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748B', pointerEvents: 'none' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: 8 }}>Remarks / Validation Notes (Optional)</label>
                  <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional validation steps or extra context..." rows={3} style={{ width: '100%', padding: '10px 14px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.9rem', color: '#0F172A', outline: 'none', resize: 'vertical' }} />
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 16, marginTop: 32 }}>
                <button onClick={() => setSelectedPriority(null)} style={{ flex: 1, padding: '12px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 700, color: '#0F172A', cursor: 'pointer' }}>Cancel</button>
                <button disabled={modalLoading} onClick={handleSubmit} style={{ flex: 1, padding: '12px', background: modalLoading ? '#94A3B8' : '#0D9488', border: 'none', borderRadius: '8px', fontWeight: 700, color: '#fff', cursor: modalLoading ? 'not-allowed' : 'pointer' }}>
                  {modalLoading ? 'Saving...' : 'Log Decision'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN WRAPPER
// ============================================================================
const AccountsReceivable: React.FC = () => {
  const { user } = useAuth();
  const token = localStorage.getItem('auth_token') || '';
  const isAllowed = canViewReceivableRisk(user?.role);
  const { data: arData } = useQuery('ar:records', () => isAllowed ? arService.records({ pageSize: 100 }) : Promise.resolve({ items: [], total: 0 }));
  
  if (!isAllowed) {
    return <ForbiddenPage />;
  }
  const arRecords = arData?.items || [];
  
  const isManager = user?.role === 'FINANCIAL_MANAGER' || user?.role === 'HEAD_ACCOUNTANT';

  return (
    <>
      {isManager ? (
        <ManagerView token={token} user={user} arRecords={arRecords} />
      ) : (
        <AccountantView token={token} user={user} arRecords={arRecords} />
      )}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default AccountsReceivable;

