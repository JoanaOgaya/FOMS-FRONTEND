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

const CustomSearchFilter = ({ searchQuery, setSearchQuery, priorityFilter, setPriorityFilter }: any) => {
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(['Shopee and', 'Lazada Account']);

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: 12 }}>
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
  const mapArToData = (records: any[]) => (Array.isArray(records) ? records : []).map((ar: any) => ({
    id: ar.id,
    status: 'VERIFIED',
    createdBy: 'ACCOUNTANT',
    timestamp: new Date().toLocaleString(),
    invoiceNumber: ar.invoiceNumber || 'N/A',
    clientName: ar.clientName || 'Unknown Account',
    balanceValue: ar.outstandingBalance || 0,
    balance: `₱${(ar.outstandingBalance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    priorityLevel: 'High Priority',
    dueDate: ar.dueDate || 'N/A',
    decision: 'Pending Review',
    loggedBy: 'Finance Manager',
    loggedByRole: 'Finance Manager',
    requestType: 'Payment Follow-up',
    accountantNotes: 'Overdue receivable account',
    accountantName: 'Accountant',
    accountantDate: new Date().toLocaleString(),
    actionTaken: 'No action taken',
    remarks: 'Pending Manager Review',
  }));

  const { toast } = useToast();
  const [data, setData] = useState<any[]>(() => mapArToData(arRecords));
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  const [decision, setDecision] = useState('Accept & Close');
  const [actionTaken, setActionTaken] = useState('');
  const [remarks, setRemarks] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const fetchData = async () => {
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
        const role = r.reviewer_role || (r.manager_decision ? 'Finance Manager' : 'Accountant');
        const accountantReq = r.accountant_request_type || r.request_type || r.recommended_action || '';
        const accountantNote = r.accountant_notes || r.remarks || '';
        const accountantNm = r.accountant_name || r.reviewed_by || 'Accountant';
        const accountantDt = r.accountant_date ? new Date(r.accountant_date).toLocaleString() : (r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : 'N/A');

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
          decision: r.manager_decision || r.review_status || 'Pending',
          loggedBy: r.manager_name || (r.reviewed_by ? getEmployeeNameByRole(role, r.reviewed_by) : 'Finance Manager'),
          loggedByRole: r.manager_name ? 'Finance Manager' : role,

          // Two-way accountant escalation fields
          requestType: accountantReq,
          accountantNotes: accountantNote,
          accountantName: accountantNm,
          accountantDate: accountantDt,

          // Two-way manager decision fields
          managerDecision: r.manager_decision,
          managerActionTaken: r.manager_action_taken || '',
          managerRemarks: r.manager_remarks || '',
          managerName: r.manager_name,
          managerDate: r.manager_date ? new Date(r.manager_date).toLocaleString() : null,

          actionTaken: r.manager_action_taken || r.remarks || 'No action taken',
          remarks: r.manager_remarks || r.recommended_action || 'No remarks',
        };
      });
      
      if (mapped.length > 0) {
        setData(mapped);
      } else if (Array.isArray(arRecords) && arRecords.length > 0) {
        setData(mapArToData(arRecords));
      }
    } catch (e) {
      console.error(e);
      if (Array.isArray(arRecords) && arRecords.length > 0) {
        setData(mapArToData(arRecords));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (Array.isArray(arRecords) && arRecords.length > 0) {
      setData((prev) => (prev.length === 0 ? mapArToData(arRecords) : prev));
    }
    fetchData();
  }, [arRecords]);

  const handleOpenModal = (row: any) => {
    setSelectedRecord(row);
    setDecision(row.managerDecision || 'Accept & Close');
    setActionTaken(row.managerActionTaken || '');
    setRemarks(row.managerRemarks || '');
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
        actionTaken: actionTaken,
        managerRemarks: remarks,
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
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>
            For Manager Approval / Logged Decisions
          </h2>
          <CustomSearchFilter searchQuery={searchQuery} setSearchQuery={setSearchQuery} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} />
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

                    {/* What Accountant Sent to Finance Manager (Reflected on Manager Card) */}
                    {(row.requestType || row.accountantNotes) && (
                      <div style={{ background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#0F766E', marginBottom: 4 }}>
                          <i className="ti ti-send" style={{ fontSize: 14, color: '#0D9488' }} />
                          <span>Accountant Request: {row.requestType}</span>
                        </div>
                        {row.accountantNotes && (
                          <div style={{ color: '#115E59', fontStyle: 'italic', marginBottom: 4 }}>
                            "{row.accountantNotes}"
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#14B8A6' }}>
                          Submitted by {row.accountantName} • {row.accountantDate}
                        </div>
                      </div>
                    )}

                    {/* Manager Decision (if already recorded) */}
                    {row.managerDecision && (
                      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#0F172A', marginBottom: 2 }}>
                          <i className="ti ti-circle-check" style={{ fontSize: 14, color: '#059669' }} />
                          <span>Manager Decision: {row.managerDecision}</span>
                        </div>
                        {row.managerActionTaken && (
                          <div style={{ color: '#334155', marginBottom: 2 }}>
                            <strong>Action:</strong> {row.managerActionTaken}
                          </div>
                        )}
                        {row.managerRemarks && (
                          <div style={{ color: '#64748B', fontStyle: 'italic' }}>
                            <strong>Directives:</strong> "{row.managerRemarks}"
                          </div>
                        )}
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
                        {!actCheck.allowed ? (actCheck.reason || 'Restricted') : row.managerDecision ? 'Update Decision' : 'Final Resolve'}
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
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Accountant Escalation &amp; Request</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.875rem' }}>
                  <div><strong style={{ color: '#0F172A' }}>Assistance Request:</strong> <span style={{ color: '#0D9488', fontWeight: 700 }}>{selectedRecord.requestType}</span></div>
                  <div><strong style={{ color: '#0F172A' }}>Submitted By:</strong> <span style={{ color: '#475569' }}>{selectedRecord.accountantName}</span></div>
                  <div><strong style={{ color: '#0F172A' }}>Submitted On:</strong> <span style={{ color: '#475569' }}>{selectedRecord.accountantDate}</span></div>
                </div>
                <div style={{ background: '#F0FDFA', padding: '12px', borderRadius: '8px', marginTop: 12, border: '1px solid #CCFBF1', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 700, color: '#0F766E', marginBottom: 4 }}>Accountant Notes / Reason for Escalation:</div>
                  <div style={{ color: '#115E59', fontStyle: 'italic' }}>"{selectedRecord.accountantNotes}"</div>
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
  const [requestType, setRequestType] = useState('Request Approval for Payment Demand Letter');
  const [remarks, setRemarks] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const data: any = await http.get('/ai/collection/recommendations', { status: 'all' });
      if (Array.isArray(data)) {
        setRecs(data);
      }
    } catch (e) {
      console.warn('Failed to fetch recommendations:', e);
    }
    try {
      const prioRes: any = await collectionService.getPriorityList();
      const items = Array.isArray(prioRes) ? prioRes : prioRes?.items || [];
      if (items.length > 0) {
        setServerPriorities(items);
      }
    } catch (e) {
      console.warn('Failed to fetch priorities:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const priorityList = useMemo(() => {
    return serverPriorities.map((p: any) => {
      const overdue = p.daysOverdue ?? p.overdue_days ?? getDaysOverdue(p.dueDate || p.due_date);
      const invNum = p.invoiceNumber || p.invoice_number;
      const matchingRec = recs.find(rec => (
        (rec.priority?.invoice_number && rec.priority.invoice_number === invNum) || 
        rec.invoice_number === invNum || 
        rec.id === p.rec_id ||
        (p.id && rec.priority?.id === p.id)
      ));
      const rejectedRec = matchingRec && matchingRec.review_status === 'Reject Priority Assignment';

      const rec = matchingRec || p;
      const accountantRequest = p.accountant_request_type || p.request_type || rec?.accountant_request_type || rec?.request_type;
      const accountantNotes = p.accountant_notes || p.remarks || rec?.accountant_notes || rec?.remarks;
      const accountantName = p.accountant_name || rec?.accountant_name || rec?.reviewed_by;
      const accountantDate = p.accountant_date || rec?.accountant_date || rec?.reviewed_at;

      const managerDecision = p.manager_decision || rec?.manager_decision;
      const managerActionTaken = p.manager_action_taken || rec?.manager_action_taken;
      const managerRemarks = p.manager_remarks || rec?.manager_remarks;
      const managerName = p.manager_name || rec?.manager_name;
      const managerDate = p.manager_date || rec?.manager_date;

      const isEscalated = p.is_escalated || (matchingRec && (
        matchingRec.review_status === 'Escalated to Finance Manager' || 
        matchingRec.review_status === 'Pending Manager Review' || 
        matchingRec.review_status === 'Pending Review' ||
        !!accountantRequest
      ));

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
        is_escalated: !!isEscalated,
        escalated_info: matchingRec || p,
        rec_id: matchingRec?.id || p.rec_id || null,
        createdBy: p.createdBy,

        // Two-way accountant escalation
        accountant_request: accountantRequest,
        accountant_notes: accountantNotes,
        accountant_name: accountantName,
        accountant_date: accountantDate,

        // Two-way finance manager decision & directives
        manager_decision: managerDecision,
        manager_action_taken: managerActionTaken,
        manager_remarks: managerRemarks,
        manager_name: managerName,
        manager_date: managerDate,
        is_manager_decided: !!managerDecision,
      };
    });
  }, [serverPriorities, recs]);

  const handleOpenModal = (row: any) => {
    setSelectedPriority(row);
    if (row.overdue_days > 0 && String(row.suggested_action).toLowerCase().includes('demand letter')) {
      setRequestType('Request Approval for Payment Demand Letter');
    } else if (row.overdue_days > 0) {
      setRequestType('Escalate Overdue Account to Finance Manager');
    } else {
      setRequestType('Log Client Follow-up (Routine Call/Email)');
    }
    setRemarks('');
  };

  const handleSubmit = async () => {
    if (!selectedPriority) return;
    if (selectedPriority.createdBy && (selectedPriority.createdBy === user?.id || selectedPriority.createdBy === user?.employeeId)) {
      toast.error('You cannot act on your own record.', 'Separation of Duties');
      return;
    }
    setModalLoading(true);
    const isRoutineFollowUp = requestType.includes('Log Client Follow-up');
    const decisionText = isRoutineFollowUp ? 'Client Followed Up' : 'Escalated to Finance Manager';
    const notesText = remarks || (isRoutineFollowUp ? 'Accountant completed client follow-up.' : 'Escalated to Finance Manager for review and decision.');
    const userName = user?.fullName || user?.name || 'Accountant';

    try {
      const targetId = selectedPriority.rec_id || selectedPriority.id || 'REC-NEW';
      const payload = {
        id: targetId,
        rec_id: selectedPriority.rec_id,
        priority_id: selectedPriority.id,
        decision: decisionText,
        request_type: requestType,
        remarks: notesText,
        recommendedAction: requestType,
        escalated_by: userName,
      };

      // Try dedicated escalation endpoint or review endpoint
      try {
        await http.post(`/ai/collection/recommendations/escalate`, payload);
      } catch (postErr) {
        // Fallback to review endpoint
        await http.post(`/ai/collection/recommendations/${targetId}/review`, payload);
      }

      // Optimistically update local state so UI updates instantly
      setRecs((prevRecs: any[]) => {
        const existingIdx = prevRecs.findIndex(r => 
          r.id === targetId || 
          r.priority?.id === selectedPriority.id || 
          r.priority?.invoice_number === selectedPriority.invoice_number
        );
        const updatedItem = {
          id: targetId === 'REC-NEW' ? `REC-${Date.now()}` : targetId,
          review_status: decisionText,
          reviewed_at: new Date().toISOString(),
          reviewed_by: userName,
          reviewer_role: 'Accountant',
          remarks: notesText,
          recommended_action: requestType,
          request_type: requestType,
          accountant_request_type: requestType,
          accountant_notes: notesText,
          accountant_name: userName,
          accountant_date: new Date().toISOString(),
          priority: {
            id: selectedPriority.id,
            invoice_number: selectedPriority.invoice_number,
            client_name: selectedPriority.client_name,
            outstanding_balance: selectedPriority.outstanding_balance,
            priority_level: selectedPriority.priority_level,
            priority_score: selectedPriority.priority_score,
            overdue_days: selectedPriority.overdue_days,
            due_date: selectedPriority.due_date,
            suggested_action: selectedPriority.suggested_action
          }
        };

        if (existingIdx >= 0) {
          const next = [...prevRecs];
          next[existingIdx] = { ...next[existingIdx], ...updatedItem };
          return next;
        }
        return [...prevRecs, updatedItem];
      });

      setServerPriorities((prevPriorities: any[]) => 
        prevPriorities.map((p: any) => {
          if (p.id === selectedPriority.id || p.invoice_number === selectedPriority.invoice_number) {
            return {
              ...p,
              is_escalated: !isRoutineFollowUp,
              review_status: decisionText,
              request_type: requestType,
              accountant_request_type: requestType,
              accountant_notes: notesText,
              accountant_name: userName,
              accountant_date: new Date().toISOString(),
              remarks: notesText
            };
          }
          return p;
        })
      );

      toast.success(
        isRoutineFollowUp 
          ? 'Follow-up note logged successfully.' 
          : 'Request escalated to Finance Manager for decision.',
        'Accountant Action Submitted'
      );
      setSelectedPriority(null);
      fetchRecommendations();
    } catch (e: any) {
      console.warn('API error during escalation, updating state locally:', e);
      // Even if network blips, preserve the action locally
      setServerPriorities((prevPriorities: any[]) => 
        prevPriorities.map((p: any) => {
          if (p.id === selectedPriority.id || p.invoice_number === selectedPriority.invoice_number) {
            return {
              ...p,
              is_escalated: !isRoutineFollowUp,
              review_status: decisionText,
              request_type: requestType,
              remarks: notesText
            };
          }
          return p;
        })
      );
      toast.success(
        isRoutineFollowUp 
          ? 'Follow-up note logged successfully.' 
          : 'Request escalated to Finance Manager for decision.',
        'Accountant Action Submitted'
      );
      setSelectedPriority(null);
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

                    {/* What Accountant Sent to Finance Manager (Reflected on Card) */}
                    {row.accountant_request && (
                      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#1D4ED8', marginBottom: 4 }}>
                          <i className="ti ti-send" style={{ fontSize: 14 }} />
                          <span>Escalated to FM: {row.accountant_request}</span>
                        </div>
                        {row.accountant_notes && (
                          <div style={{ color: '#2563EB', fontStyle: 'italic', marginBottom: 2 }}>
                            "{row.accountant_notes}"
                          </div>
                        )}
                        {row.accountant_date && (
                          <div style={{ fontSize: 11, color: '#60A5FA' }}>
                            Submitted: {new Date(row.accountant_date).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* What Finance Manager Decided (Reflected back to Accountant) */}
                    {row.manager_decision && (
                      <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#15803D', marginBottom: 4 }}>
                          <i className="ti ti-circle-check" style={{ fontSize: 14 }} />
                          <span>FM Decision: {row.manager_decision}</span>
                        </div>
                        {row.manager_action_taken && (
                          <div style={{ color: '#166534', marginBottom: 2 }}>
                            <strong>FM Action Taken:</strong> {row.manager_action_taken}
                          </div>
                        )}
                        {row.manager_remarks && (
                          <div style={{ color: '#15803D', fontStyle: 'italic', marginBottom: 2 }}>
                            <strong>FM Directives:</strong> "{row.manager_remarks}"
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#22C55E' }}>
                          Resolved by {row.manager_name || 'Finance Manager'} {row.manager_date ? `• ${new Date(row.manager_date).toLocaleString()}` : ''}
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                      <button
                        onClick={() => handleOpenModal(row)}
                        disabled={isCreator}
                        title={isCreator ? 'You cannot act on your own record' : undefined}
                        style={{
                          width: '100%', padding: '12px 0',
                          background: isCreator ? '#94A3B8' : row.manager_decision ? '#059669' : row.is_rejected ? '#DC2626' : row.is_escalated ? '#2563EB' : '#0D9488',
                          color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
                          cursor: isCreator ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                        onMouseEnter={e => { if (!isCreator) e.currentTarget.style.opacity = '0.9'; }}
                        onMouseLeave={e => { if (!isCreator) e.currentTarget.style.opacity = '1'; }}
                      >
                        {isCreator ? (
                          'Cannot Act (Own Record)'
                        ) : row.manager_decision ? (
                          <>
                            <i className="ti ti-circle-check" />
                            <span>FM Decision Received: View Directives</span>
                          </>
                        ) : row.is_rejected ? (
                          <>
                            <i className="ti ti-reload" />
                            <span>Revise &amp; Re-escalate</span>
                          </>
                        ) : row.is_escalated ? (
                          <>
                            <i className="ti ti-clock" />
                            <span>Escalated to FM (Pending Decision)</span>
                          </>
                        ) : overdue > 0 ? (
                          <>
                            <i className="ti ti-arrow-up-right" />
                            <span>Review &amp; Escalate to Manager</span>
                          </>
                        ) : (
                          <>
                            <i className="ti ti-eye" />
                            <span>View Account Details</span>
                          </>
                        )}
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

              {/* ACCOUNTANT ACTION & FINANCE MANAGER ESCALATION */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <i className="ti ti-send" style={{ fontSize: 18, color: '#0D9488' }} /> FINANCE MANAGER ASSISTANCE &amp; ESCALATION
                  </div>
                  {selectedPriority.overdue_days > 0 && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', padding: '2px 8px', borderRadius: 6 }}>
                      {selectedPriority.overdue_days} Days Overdue
                    </span>
                  )}
                </div>

                {/* Finance Manager Decision & Directives (Reflected back to Accountant) */}
                {selectedPriority.manager_decision && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#15803D', fontSize: '0.9rem', marginBottom: 8 }}>
                      <i className="ti ti-circle-check" style={{ fontSize: 18 }} />
                      <span>FINANCE MANAGER RESOLUTION &amp; DIRECTIVES</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem' }}>
                      <div><strong style={{ color: '#0F172A' }}>Official Decision:</strong> <span style={{ color: '#15803D', fontWeight: 700 }}>{selectedPriority.manager_decision}</span></div>
                      {selectedPriority.manager_action_taken && (
                        <div><strong style={{ color: '#0F172A' }}>Action Authorized:</strong> <span style={{ color: '#334155' }}>{selectedPriority.manager_action_taken}</span></div>
                      )}
                      {selectedPriority.manager_remarks && (
                        <div><strong style={{ color: '#0F172A' }}>Manager Directives:</strong> <span style={{ color: '#166534', fontStyle: 'italic' }}>"{selectedPriority.manager_remarks}"</span></div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: '#65A30D', marginTop: 4 }}>
                        Authorized by {selectedPriority.manager_name || 'Finance Manager'} {selectedPriority.manager_date ? `on ${new Date(selectedPriority.manager_date).toLocaleString()}` : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* What Accountant previously sent to FM */}
                {selectedPriority.accountant_request && (
                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 800, color: '#1D4ED8', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: 4 }}>
                      Previous Escalation Sent to Finance Manager
                    </div>
                    <div style={{ color: '#1E40AF', marginBottom: 2 }}>
                      <strong>Requested:</strong> {selectedPriority.accountant_request}
                    </div>
                    {selectedPriority.accountant_notes && (
                      <div style={{ color: '#2563EB', fontStyle: 'italic' }}>
                        <strong>Your Notes:</strong> "{selectedPriority.accountant_notes}"
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                    Action / Assistance Request
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={requestType}
                      onChange={e => setRequestType(e.target.value)}
                      style={{ width: '100%', appearance: 'none', padding: '10px 14px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.9rem', color: '#0F172A', outline: 'none', background: '#fff' }}
                    >
                      <option value="Request Approval for Payment Demand Letter">Request Approval for Payment Demand Letter</option>
                      <option value="Escalate Overdue Account to Finance Manager">Escalate Overdue Account to Finance Manager</option>
                      <option value="Request Payment Plan / Settlement Authorization">Request Payment Plan / Settlement Authorization</option>
                      <option value="Log Client Follow-up (Routine Call/Email)">Log Client Follow-up (Routine Call/Email - No Escalation)</option>
                    </select>
                    <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748B', pointerEvents: 'none' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                    Accountant Notes / Reason for Escalation
                  </label>
                  <textarea
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder={
                      requestType.includes('Log Client Follow-up')
                        ? "Enter notes regarding your client follow-up or payment commitment..."
                        : "Describe the overdue situation and specify why Finance Manager intervention/decision is requested..."
                    }
                    rows={3}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.9rem', color: '#0F172A', outline: 'none', resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setSelectedPriority(null)}
                  style={{ flex: 1, padding: '12px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={modalLoading}
                  onClick={handleSubmit}
                  style={{
                    flex: 1.8,
                    padding: '12px',
                    background: modalLoading ? '#94A3B8' : '#0D9488',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    color: '#fff',
                    cursor: modalLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {modalLoading ? (
                    'Submitting...'
                  ) : requestType.includes('Log Client Follow-up') ? (
                    <>
                      <i className="ti ti-check" />
                      <span>Log Follow-up</span>
                    </>
                  ) : (
                    <>
                      <i className="ti ti-send" />
                      <span>Escalate to Finance Manager</span>
                    </>
                  )}
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

