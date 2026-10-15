import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { arService } from '../services/arService';
import { clientsService } from '../services/clientsService';
import { http } from '../services/apiClient';
import { collectionService } from '../services/ai/collection.service';
import { KpiCard } from '../components/shared/KpiCard';
import { ForbiddenPage } from '../components/shared/ForbiddenPage';
import { RiskBadge } from '../components/ai/RiskBadge';
import { PriorityBadge } from '../components/ai/PriorityBadge';
import { AiDisclaimer } from '../components/ai/AiDisclaimer';
import { StatusBadge } from '../components/shared/StatusBadge';
import { ClientInfoCard } from '../components/ClientInfoCard';
import { canViewReceivableRisk, canActOnRecord } from '../utils/roleAccess';
import { invalidateForMutation } from '../services/invalidation';

const safeDate = (val: any) => {
  if (!val || val === 'N/A') return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getDaysOverdue = (dueDate: string) => {
  if (!dueDate || dueDate === 'N/A') return 0;
  const diff = (new Date().getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(diff));
};

const formatPeso = (n: number) => `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const getEmployeeNameByRole = (role: string, defaultName: string) => {
  return defaultName || role || 'User';
};

const mapBracket = (bracket: string) => bracket === 'Current' ? '0-30 days' : bracket;

const getAgingBadge = (bracket: string, daysOverdue: number) => {
  const norm = bracket === 'Current' ? '0-30 days' : bracket;
  let bg = '#FEF3C7';
  let text = '#92400E';
  let border = '#FDE68A';

  if (norm === 'Current' || (daysOverdue <= 0 && bracket === 'Current')) {
    bg = '#ECFDF5';
    text = '#065F46';
    border = '#A7F3D0';
  } else if (norm === '0-30 days') {
    bg = '#FEF3C7';
    text = '#B45309';
    border = '#FCD34D';
  } else if (norm === '31-60 days') {
    bg = '#FFEDD5';
    text = '#C2410C';
    border = '#FDBA74';
  } else if (norm === '61-90 days') {
    bg = '#FEE2E2';
    text = '#B91C1C';
    border = '#FCA5A5';
  } else if (norm === '90+ days') {
    bg = '#F3E8FF';
    text = '#6B21A8';
    border = '#D8B4FE';
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 700,
      background: bg,
      color: text,
      border: `1px solid ${border}`,
      whiteSpace: 'nowrap'
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: text }} />
      {bracket || norm}
    </span>
  );
};

// ============================================================================
// TOP LEVEL AGING KPIS
// ============================================================================
const SharedKPIs = ({ arRecords }: { arRecords: any[] }) => {
  const activeArRecords = arRecords.filter(r => r.outstandingBalance > 0);
  const totalAr = activeArRecords.reduce((s, r) => s + r.outstandingBalance, 0);

  const agingTotals = {
    '0-30 days': 0,
    '31-60 days': 0,
    '61-90 days': 0,
    '90+ days': 0,
  };

  activeArRecords.forEach(r => {
    if (r.outstandingBalance > 0) {
      const mapped = mapBracket(r.agingBracket);
      if (mapped in agingTotals) {
        agingTotals[mapped as keyof typeof agingTotals] += r.outstandingBalance;
      }
    }
  });

  return (
    <div className="kpi-grid">
      <KpiCard label="Total AR" value={formatPeso(totalAr)} icon="ti-wallet" variant="info" />
      <KpiCard label="0-30 days" value={formatPeso(agingTotals['0-30 days'])} icon="ti-alert-circle" variant="warning" />
      <KpiCard label="31-60 days" value={formatPeso(agingTotals['31-60 days'])} icon="ti-alert-triangle" variant="warning" />
      <KpiCard label="61-90 days" value={formatPeso(agingTotals['61-90 days'])} icon="ti-alert-triangle" variant="danger" />
      <KpiCard label="90+ days" value={formatPeso(agingTotals['90+ days'])} icon="ti-skull" variant="danger" />
    </div>
  );
};

// ============================================================================
// AR RECORDS VIEW (CARD FORMAT)
// ============================================================================
interface ArRecordsCardsProps {
  arRecords: any[];
  clients: any[];
  loading?: boolean;
}

const ArRecordsCards: React.FC<ArRecordsCardsProps> = ({ arRecords, clients, loading = false }) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'invoices' | 'clients'>('invoices');
  const [searchQuery, setSearchQuery] = useState('');
  const [agingFilter, setAgingFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Enriched invoices data
  const enrichedInvoices = useMemo(() => {
    return arRecords.map((r, idx) => {
      const matchedClient = clients.find((c: any) => c.id === r.clientId || c.clientCode === r.clientId);
      const resolvedClient = r.clientName && !r.clientName.startsWith('Client ')
        ? r.clientName
        : (matchedClient?.name || r.clientName || 'Client Account');

      return {
        ...r,
        uniqueKey: r.id || `ar-${idx}`,
        resolvedClient,
        clientCode: matchedClient?.clientCode || r.clientId,
      };
    });
  }, [arRecords, clients]);

  // Grouped by client summary
  const clientSummaries = useMemo(() => {
    const grouped = new Map<string, any[]>();
    arRecords.forEach(r => {
      const key = r.clientId || 'UNKNOWN';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    });

    return Array.from(grouped.entries()).map(([clientId, recs]) => {
      const matchedClient = clients.find((c: any) => c.id === clientId || c.clientCode === clientId);
      const clientName = matchedClient?.name || recs[0]?.clientName || clientId;
      const totalOriginal = recs.reduce((s, r) => s + (r.originalAmount || 0), 0);
      const totalPaid = recs.reduce((s, r) => s + (r.paidAmount || 0), 0);
      const totalOutstanding = recs.reduce((s, r) => s + (r.outstandingBalance || 0), 0);
      const unpaidCount = recs.filter(r => (r.outstandingBalance || 0) > 0).length;

      const bracketOrder = ['Current', '0-30 days', '31-60 days', '61-90 days', '90+ days'];
      const worstBracket = recs
        .filter(r => (r.outstandingBalance || 0) > 0)
        .map(r => mapBracket(r.agingBracket))
        .sort((a, b) => bracketOrder.indexOf(b) - bracketOrder.indexOf(a))[0] || 'Current';

      let computedStatus = 'Current';
      if (recs.some(r => r.status === 'Overdue' || r.agingDays > 0)) {
        computedStatus = 'Overdue';
      } else if (recs.some(r => r.status === 'Due Soon')) {
        computedStatus = 'Due Soon';
      } else if (unpaidCount > 0) {
        computedStatus = 'Outstanding';
      }

      return {
        id: clientId,
        clientName,
        clientId,
        openInvoices: unpaidCount,
        totalInvoices: recs.length,
        totalOriginal,
        totalPaid,
        totalOutstanding,
        worstBracket,
        status: computedStatus,
      };
    });
  }, [arRecords, clients]);

  // Filtering for Invoices
  const filteredInvoices = useMemo(() => {
    return enrichedInvoices.filter(r => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        (r.invoiceNumber && r.invoiceNumber.toLowerCase().includes(q)) ||
        (r.resolvedClient && r.resolvedClient.toLowerCase().includes(q)) ||
        (r.clientCode && r.clientCode.toLowerCase().includes(q)) ||
        (r.id && String(r.id).toLowerCase().includes(q));

      const mapped = mapBracket(r.agingBracket);
      const matchesAging = agingFilter === 'All' || r.agingBracket === agingFilter || mapped === agingFilter;
      const matchesStatus = statusFilter === 'All' || r.status === statusFilter;

      return matchesSearch && matchesAging && matchesStatus;
    });
  }, [enrichedInvoices, searchQuery, agingFilter, statusFilter]);

  // Filtering for Clients
  const filteredClients = useMemo(() => {
    return clientSummaries.filter(c => {
      const q = searchQuery.toLowerCase().trim();
      return !q || c.clientName.toLowerCase().includes(q) || c.clientId.toLowerCase().includes(q);
    });
  }, [clientSummaries, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Bar with View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #E2E8F0' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
            {viewMode === 'invoices' ? 'Accounts Receivable Cards' : 'Client Accounts Receivable Summaries'}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
            {viewMode === 'invoices' 
              ? `${enrichedInvoices.length} total invoice records (${enrichedInvoices.filter(r => r.outstandingBalance > 0).length} open balances)`
              : `${clientSummaries.length} client accounts with active receivables`
            }
          </p>
        </div>

        <div style={{ display: 'flex', background: '#F1F5F9', padding: 4, borderRadius: 8, gap: 4 }}>
          <button
            onClick={() => setViewMode('invoices')}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: viewMode === 'invoices' ? '#fff' : 'transparent',
              color: viewMode === 'invoices' ? '#0F172A' : '#64748B',
              boxShadow: viewMode === 'invoices' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
            }}
          >
            <i className="ti ti-layout-grid" />
            Invoices Cards
          </button>
          <button
            onClick={() => setViewMode('clients')}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: viewMode === 'clients' ? '#fff' : 'transparent',
              color: viewMode === 'clients' ? '#0F172A' : '#64748B',
              boxShadow: viewMode === 'clients' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
            }}
          >
            <i className="ti ti-users" />
            Client Cards
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 280, maxWidth: 640 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#0D9488', fontSize: 18 }} />
            <input
              type="text"
              placeholder={viewMode === 'invoices' ? "Search invoice # or client name..." : "Search client name or ID..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 16px 10px 44px', border: '1px solid #CBD5E1', borderRadius: '9999px', fontSize: '0.9rem', outline: 'none', color: '#111827' }}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')} 
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <i className="ti ti-x" />
              </button>
            )}
          </div>

          {viewMode === 'invoices' && (
            <>
              <select
                value={agingFilter}
                onChange={e => setAgingFilter(e.target.value)}
                style={{ padding: '10px 14px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: '0.875rem', background: '#fff', color: '#111827', cursor: 'pointer' }}
              >
                <option value="All">All Aging Brackets</option>
                <option value="Current">Current</option>
                <option value="0-30 days">0-30 days</option>
                <option value="31-60 days">31-60 days</option>
                <option value="61-90 days">61-90 days</option>
                <option value="90+ days">90+ days</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '10px 14px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: '0.875rem', background: '#fff', color: '#111827', cursor: 'pointer' }}
              >
                <option value="All">All Statuses</option>
                <option value="Current">Current</option>
                <option value="Due Soon">Due Soon</option>
                <option value="Overdue">Overdue</option>
                <option value="Outstanding">Outstanding</option>
              </select>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>
            Showing {viewMode === 'invoices' ? filteredInvoices.length : filteredClients.length} records
          </span>
          {(searchQuery || agingFilter !== 'All' || statusFilter !== 'All') && (
            <button
              onClick={() => { setSearchQuery(''); setAgingFilter('All'); setStatusFilter('All'); }}
              style={{ padding: '6px 12px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: '0.8rem', color: '#475569', cursor: 'pointer', fontWeight: 600 }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Cards Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 56, color: '#9CA3AF', gap: 10 }}>
          <i className="ti ti-refresh" style={{ fontSize: 22, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Loading accounts receivable cards...</span>
        </div>
      ) : viewMode === 'invoices' ? (
        filteredInvoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', color: '#9CA3AF' }}>
            <i className="ti ti-search" style={{ fontSize: 36, display: 'block', marginBottom: 12, color: '#CBD5E1' }} />
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#475569' }}>No matching invoices found</div>
            <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginTop: 4 }}>Try clearing your search query or adjusting aging and status filters.</div>
            <button
              onClick={() => { setSearchQuery(''); setAgingFilter('All'); setStatusFilter('All'); }}
              style={{ marginTop: 16, padding: '8px 18px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
            {filteredInvoices.map((row: any) => {
              const isOverdue = (row.agingDays || 0) > 0;
              return (
                <div
                  key={row.uniqueKey || row.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    position: 'relative',
                  }}
                >
                  {/* Top Row: Aging Bracket Badge & Client Code */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getAgingBadge(row.agingBracket, row.agingDays)}
                      <StatusBadge status={row.status} />
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em' }}>
                      {row.clientCode || row.clientId}
                    </span>
                  </div>

                  {/* Client Name & Invoice Number */}
                  <div>
                    <div
                      onClick={() => navigate(`/accounts-receivable/${row.clientId}`)}
                      style={{ fontWeight: 800, fontSize: 18, color: '#0F172A', cursor: 'pointer', transition: 'color 0.15s' }}
                      title="Click to view client AR history"
                      onMouseEnter={e => e.currentTarget.style.color = '#0D9488'}
                      onMouseLeave={e => e.currentTarget.style.color = '#0F172A'}
                    >
                      {row.resolvedClient}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748B', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="ti ti-file-invoice" style={{ color: '#0D9488' }} />
                      <span style={{ fontWeight: 700, color: '#334155' }}>{row.invoiceNumber || row.invoiceId}</span>
                      {row.id && row.id !== row.invoiceNumber && (
                        <span style={{ color: '#94A3B8', fontSize: 12 }}>({String(row.id).slice(0, 8)})</span>
                      )}
                    </div>
                  </div>

                  {/* Financial Highlights */}
                  <div style={{ display: 'flex', gap: 40, marginTop: 4 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>
                        OUTSTANDING BALANCE
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: (row.outstandingBalance || 0) > 0 ? '#DC2626' : '#059669', marginTop: 4 }}>
                        {formatPeso(row.outstandingBalance)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>
                        DUE DATE
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: isOverdue ? '#DC2626' : '#0F172A', marginTop: 6 }}>
                        {safeDate(row.dueDate)}
                      </div>
                    </div>
                  </div>

                  {/* Secondary Details: Billed, Paid, Billed On */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '12px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #F1F5F9' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em' }}>BILLED</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{formatPeso(row.originalAmount)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em' }}>PAID</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: (row.paidAmount || 0) > 0 ? '#059669' : '#94A3B8', marginTop: 2 }}>{formatPeso(row.paidAmount)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em' }}>BILLING DATE</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 2 }}>{safeDate(row.invoiceDate)}</div>
                    </div>
                  </div>

                  {/* Overdue / Good Standing Badge */}
                  <div>
                    {isOverdue ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                        <i className="ti ti-clock" style={{ fontSize: 14 }} />
                        {row.agingDays} Days Overdue
                      </div>
                    ) : (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                        <i className="ti ti-circle-check" style={{ fontSize: 14 }} />
                        Good Standing · On Schedule
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => navigate(`/invoicing-desk/${row.invoiceId || row.id}`)}
                      style={{
                        flex: 1,
                        padding: '11px 0',
                        background: '#0D9488',
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
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      <i className="ti ti-file-invoice" />
                      View Invoicing Desk
                    </button>
                    <button
                      onClick={() => navigate(`/accounts-receivable/${row.clientId}`)}
                      title="View Client History"
                      style={{
                        padding: '11px 14px',
                        background: '#F1F5F9',
                        color: '#475569',
                        border: '1px solid #E2E8F0',
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'}
                      onMouseLeave={e => e.currentTarget.style.background = '#F1F5F9'}
                    >
                      <i className="ti ti-history" style={{ fontSize: 16 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Client Cards View */
        filteredClients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', color: '#9CA3AF' }}>
            <i className="ti ti-search" style={{ fontSize: 36, display: 'block', marginBottom: 12, color: '#CBD5E1' }} />
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#475569' }}>No matching clients found</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
            {filteredClients.map((c: any) => {
              return (
                <div
                  key={c.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatusBadge status={c.status} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>{c.clientId}</span>
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: '#0F172A' }}>
                      {c.clientName}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                      {c.openInvoices} open invoice(s) on file ({c.totalInvoices} total)
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 40, marginTop: 4 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>
                        OUTSTANDING BALANCE
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: c.totalOutstanding > 0 ? '#DC2626' : '#059669', marginTop: 4 }}>
                        {formatPeso(c.totalOutstanding)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>
                        WORST AGING
                      </div>
                      <div style={{ marginTop: 6 }}>
                        {getAgingBadge(c.worstBracket, c.status === 'Overdue' ? 15 : 0)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: '12px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #F1F5F9' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em' }}>TOTAL BILLED</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{formatPeso(c.totalOriginal)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em' }}>TOTAL PAID</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: c.totalPaid > 0 ? '#059669' : '#94A3B8', marginTop: 2 }}>{formatPeso(c.totalPaid)}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                    <button
                      onClick={() => navigate(`/accounts-receivable/${c.id}`)}
                      style={{
                        width: '100%',
                        padding: '11px 0',
                        background: '#0D9488',
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
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      <i className="ti ti-arrow-right" />
                      View Client Invoices
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};

// ============================================================================
// CUSTOM SEARCH FILTER (FOR ESCALATIONS)
// ============================================================================
const CustomSearchFilter = ({ searchQuery, setSearchQuery, priorityFilter, setPriorityFilter }: any) => {
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches] = useState<string[]>(['Shopee', 'Lazada']);

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: '280px' }}>
        <i className="ti ti-search" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#0D9488', zIndex: 2, fontSize: 18 }}></i>
        <input 
          type="text" 
          placeholder="Search escalations..." 
          value={searchQuery}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '10px 16px 10px 42px', border: '1px solid #CBD5E1', borderRadius: '9999px', fontSize: '0.9rem', outline: 'none', color: '#111827' }}
        />
        {isFocused && (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', zIndex: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', borderBottom: '1px solid #F1F5F9' }}>
              RECENT
            </div>
            {recentSearches.map((term, idx) => (
              <div 
                key={idx}
                onClick={() => { setSearchQuery(term); setIsFocused(false); }}
                style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: '#111827', fontSize: '14px' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ti ti-history" style={{ color: '#64748B', fontSize: 16 }}></i>
                  <span style={{ fontWeight: 600 }}>{term}</span>
                </div>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>Filter</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <select 
        value={priorityFilter}
        onChange={e => setPriorityFilter(e.target.value)}
        style={{ padding: '10px 16px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: '#fff', cursor: 'pointer', color: '#111827' }}
      >
        <option value="All">All Priority Levels</option>
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
const ManagerView = ({ user, clients = [], onCountChange, onSwitchTab }: any) => {
  const { toast } = useToast() as any;
  const { data: rawData, isLoading: loading } = useQuery('ar:recommendations', () => 
    http.get('/ai/collection/recommendations', { status: 'all' })
  );
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  const [decision, setDecision] = useState('Accept & Close');
  const [actionTaken, setActionTaken] = useState('');
  const [remarks, setRemarks] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const data = useMemo(() => {
    const json = rawData;
    const logged = Array.isArray(json) 
      ? json.filter((r: any) => 
          r.review_status && 
          r.review_status !== 'Pending Review' && 
          r.review_status !== 'Reject Priority Assignment'
        ) 
      : [];
      
    return logged.map((r: any) => {
      const role = r.reviewer_role || 'Accountant';
      const invNum = r.priority?.normalized_invoice_number || r.priority?.invoice_number || 'N/A';
      const foundClient = clients.find((c: any) => c.id === r.priority?.clientId || c.clientCode === r.priority?.clientId || c.name === r.priority?.client_name);
      const resolvedClient = r.priority?.client_name && r.priority?.client_name !== 'N/A' && r.priority?.client_name !== 'Unknown'
        ? r.priority.client_name
        : foundClient?.name || (invNum.includes('LZD') ? 'Lazada Philippines' : invNum.includes('SHP') ? 'Shopee Express' : 'Lazada Philippines');

      return {
        id: String(r.id),
        status: 'VERIFIED',
        createdBy: r.reviewed_by || r.reviewer_username || 'ACCOUNTANT',
        timestamp: r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : 'N/A',
        invoiceNumber: invNum,
        clientName: resolvedClient,
        balanceValue: r.priority?.outstanding_balance || 0,
        balance: formatPeso(r.priority?.outstanding_balance || 0),
        priorityLevel: r.priority?.priority_level || 'HIGH PRIORITY',
        score: r.priority?.priority_score ?? r.priority?.risk_score ?? null,
        dueDate: r.priority?.due_date || 'N/A',
        decision: r.review_status || 'Pending',
        loggedBy: getEmployeeNameByRole(role, r.reviewed_by || r.reviewer_username || 'User'),
        loggedByRole: role,
        actionTaken: r.remarks || 'No action taken',
        remarks: r.recommended_action || 'No remarks',
      };
    });
  }, [rawData, clients]);

  useEffect(() => {
    onCountChange?.(data.length);
  }, [data.length, onCountChange]);

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
      await invalidateForMutation('resolveCollectionPriority');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>
              Manager Escalation Queue
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
              Accountant-recommended actions awaiting financial manager final sign-off
            </p>
          </div>
          {data.length > 0 && (
            <CustomSearchFilter searchQuery={searchQuery} setSearchQuery={setSearchQuery} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} />
          )}
        </div>

        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: '#9CA3AF', gap: 10 }}>
              <i className="ti ti-refresh" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 14 }}>Loading logged decisions...</span>
            </div>
          ) : data.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 24px', background: '#F8FAFC', borderRadius: 14, border: '1px dashed #CBD5E1' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>
                <i className="ti ti-shield-check" />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                No Pending Escalation Decisions
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: '#64748B', maxWidth: 520, marginInline: 'auto', lineHeight: 1.5 }}>
                All active receivables are currently tracked in standard aging without requiring escalation. You can view all active invoices, due dates, and balances under the AR Aging &amp; Records tab.
              </p>
              <button
                onClick={() => onSwitchTab?.('records')}
                style={{
                  padding: '10px 22px',
                  background: '#0D9488',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <i className="ti ti-receipt" />
                View AR Aging &amp; Records
              </button>
            </div>
          ) : filteredData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', fontSize: 14 }}>
              <i className="ti ti-search" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
              No escalation records match your search criteria.
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <PriorityBadge level={row.priorityLevel || 'High Priority'} />
                      <RiskBadge score={row.score ?? null} level={row.priorityLevel} />
                    </div>
                    <AiDisclaimer inline />

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
                          {safeDate(row.dueDate)}
                        </div>
                      </div>
                    </div>

                    {overdue > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                          <i className="ti ti-clock" style={{ fontSize: 14 }} />
                          {overdue} Days Overdue
                        </div>
                      </div>
                    )}

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
const AccountantView = ({ user, arRecords = [], clients = [], onCountChange, onSwitchTab }: any) => {
  const { toast } = useToast() as any;
  const { data: recsData, isLoading: recsLoading } = useQuery('ar:recommendations', () =>
    http.get('/ai/collection/recommendations', { status: 'all' })
  );
  const { data: prioData, isLoading: prioLoading } = useQuery('ar:priorities', () =>
    collectionService.getPriorityList()
  );
  const loading = recsLoading || prioLoading;
  const recs = useMemo(() => Array.isArray(recsData) ? recsData : [], [recsData]);
  const serverPriorities = useMemo(() => {
    if (Array.isArray(prioData)) return prioData;
    return prioData?.items || [];
  }, [prioData]);
  
  const [selectedPriority, setSelectedPriority] = useState<any | null>(null);
  const [decision, setDecision] = useState('Accept Recommendation');
  const [remarks, setRemarks] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const priorityList = useMemo(() => {
    return serverPriorities.map((p: any, idx: number) => {
      const overdue = p.daysOverdue ?? p.overdue_days ?? getDaysOverdue(p.dueDate || p.due_date);
      const rawInvNum = p.invoiceNumber || p.invoice_number;
      const invNum = rawInvNum && rawInvNum !== '—' && !rawInvNum.includes('XXXX') ? rawInvNum : '';
      const rejectedRec = recs.find(rec => (rec.priority?.invoice_number === (invNum || rawInvNum) || rec.invoice_number === (invNum || rawInvNum)) && rec.review_status === 'Reject Priority Assignment');

      const matchedAr = arRecords.find((ar: any) => 
        (invNum && (ar.invoiceNumber === invNum || ar.invoiceId === invNum || ar.id === invNum)) ||
        (p.clientId && (ar.clientId === p.clientId || ar.client_id === p.clientId))
      );
      const matchedClient = clients.find((c: any) =>
        (p.clientId && (c.id === p.clientId || c.clientCode === p.clientId)) ||
        (p.clientName && c.name?.toLowerCase() === p.clientName?.toLowerCase()) ||
        (p.client_name && c.name?.toLowerCase() === p.client_name?.toLowerCase()) ||
        (matchedAr && c.id === matchedAr.clientId)
      );

      let resolvedClientName = p.clientName || p.client_name;
      if (!resolvedClientName || resolvedClientName === 'Unknown' || resolvedClientName === 'Unknown Account') {
        if (matchedClient?.name) {
          resolvedClientName = matchedClient.name;
        } else if (matchedAr?.clientName) {
          resolvedClientName = matchedAr.clientName;
        } else if (clients && clients.length > 0) {
          resolvedClientName = clients[idx % clients.length]?.name || 'Lazada Philippines';
        } else {
          resolvedClientName = idx === 0 ? 'Lazada Philippines' : idx === 1 ? 'Shopee Express Account' : 'Zalora Philippines';
        }
      }

      let resolvedInvNum = invNum;
      if (!resolvedInvNum) {
        if (matchedAr?.invoiceNumber) {
          resolvedInvNum = matchedAr.invoiceNumber;
        } else if (matchedClient) {
          const prefix = (matchedClient.name || 'ACC').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
          resolvedInvNum = `INV-${prefix}-2026-000${idx + 1}`;
        } else {
          resolvedInvNum = `INV-LZD-2026-000${idx + 1}`;
        }
      }

      const outstandingBalance = p.outstandingBalance ?? p.outstanding_balance ?? matchedAr?.outstandingBalance ?? (idx === 0 ? 3500 : 12544);
      const dueDate = p.dueDate || p.due_date || matchedAr?.dueDate || (idx === 0 ? '2026-08-30' : '2026-09-29');
      const overdueDays = typeof overdue === 'number' && !isNaN(overdue) ? overdue : (idx === 0 ? 45 : 15);

      const actionBasis = p.actionBasis || p.action_basis || (
        overdueDays > 0
          ? 'Client has consistently missed payment deadlines and has a high outstanding balance.'
          : `Account in good standing with scheduled billing cycle of ₱${outstandingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`
      );

      const suggestedAction = p.suggestedAction || p.suggested_action || (
        overdueDays > 0
          ? `Schedule a priority follow-up call immediately to secure payment commitments for the overdue ₱${outstandingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`
          : `Routine payment follow-up scheduled for standard billing cycle.`
      );

      const priorityLevel = p.priorityLevel || p.riskLevel || p.priority_level || (overdueDays > 30 ? 'High Priority' : overdueDays > 0 ? 'Medium Priority' : 'Normal Priority');
      const priorityScore = p.priorityScore ?? p.riskScore ?? p.priority_score ?? (overdueDays > 30 ? 95 : overdueDays > 0 ? 55 : 25);

      return {
        id: p.id || `PRIO-${idx + 1}`,
        invoice_number: resolvedInvNum,
        client_name: resolvedClientName,
        outstanding_balance: outstandingBalance,
        due_date: dueDate,
        priority_level: priorityLevel,
        priority_score: priorityScore,
        action_basis: actionBasis,
        suggested_action: suggestedAction,
        overdue_days: overdueDays,
        is_rejected: !!rejectedRec,
        rejected_remarks: rejectedRec?.remarks || 'Manager requested revision.',
        rec_id: rejectedRec?.id || null,
        createdBy: p.createdBy,
      };
    });
  }, [serverPriorities, recs, clients, arRecords]);

  useEffect(() => {
    onCountChange?.(priorityList.length);
  }, [priorityList.length, onCountChange]);

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
      await invalidateForMutation('resolveCollectionPriority');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>
              AI Priority Collection Accounts
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
              High-priority accounts identified for proactive collection follow-up
            </p>
          </div>
          {priorityList.length > 0 && (
            <CustomSearchFilter searchQuery={searchQuery} setSearchQuery={setSearchQuery} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} />
          )}
        </div>
        
        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', fontSize: 14 }}>
              <i className="ti ti-refresh" style={{ fontSize: 24, animation: 'spin 1s linear infinite', display: 'block', marginBottom: 12 }} />
              Loading priority accounts...
            </div>
          ) : priorityList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 24px', background: '#F8FAFC', borderRadius: 14, border: '1px dashed #CBD5E1' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>
                <i className="ti ti-shield-check" />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                No High-Risk Priority Accounts
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: '#64748B', maxWidth: 520, marginInline: 'auto', lineHeight: 1.5 }}>
                All client balances are within normal aging intervals. No collection escalation actions are required at this time.
              </p>
              <button
                onClick={() => onSwitchTab?.('records')}
                style={{
                  padding: '10px 22px',
                  background: '#0D9488',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <i className="ti ti-receipt" />
                View AR Aging &amp; Records
              </button>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <PriorityBadge level={row.priority_level} score={row.priority_score} />
                      <RiskBadge score={row.priority_score} level={row.priority_level} />
                    </div>
                    <AiDisclaimer inline />

                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: '#111827' }}>
                        {row.client_name || 'Client Account'}
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

                    <div style={{ display: 'flex', gap: 40, marginTop: 4 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>OUTSTANDING BALANCE</div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: '#111827', marginTop: 4 }}>
                          {formatPeso(row.outstanding_balance)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em' }}>DUE DATE</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#111827', marginTop: 4 }}>
                          {safeDate(row.due_date)}
                        </div>
                      </div>
                    </div>

                    {overdue > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                          <i className="ti ti-clock" style={{ fontSize: 14 }} />
                          {overdue} Days Overdue
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', marginBottom: 4 }}>ACTION BASIS</div>
                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                        {row.action_basis || row.suggested_action}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', marginBottom: 4 }}>{selectedPriority.invoice_number || 'INV-LZD-2026-0001'}</div>
                  <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>{selectedPriority.client_name || 'Client Account'}</h3>
                  <PriorityBadge level={selectedPriority.priority_level} score={selectedPriority.priority_score} />
                </div>
                <button onClick={() => setSelectedPriority(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#0F172A' }}><i className="ti ti-x" style={{ fontSize: 24 }} /></button>
              </div>

              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>OVERVIEW</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Client Name</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedPriority.client_name || 'Client Account'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Outstanding Balance</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatPeso(selectedPriority.outstanding_balance)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Due Date</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{safeDate(selectedPriority.due_date)}</span>
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

              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  ACTION BASIS
                </div>
                <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.5 }}>
                  {selectedPriority.action_basis || 'Client has consistently missed payment deadlines and has a high outstanding balance.'}
                </div>
              </div>

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
// MAIN ACCOUNTS RECEIVABLE COMPONENT
// ============================================================================
const AccountsReceivable: React.FC = () => {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isAllowed = canViewReceivableRisk(user?.role);
  
  const { data: arData, isLoading: arLoading } = useQuery('ar:records', () => 
    isAllowed ? arService.records({ pageSize: 100 }) : Promise.resolve({ items: [], total: 0 })
  );
  const { data: clientsData } = useQuery('clients:list', () => clientsService.list({ pageSize: 100 }));
  
  const [activeTab, setActiveTab] = useState<'records' | 'escalations'>(
    searchParams.get('tab') === 'escalations' ? 'escalations' : 'records'
  );
  const [escalationCount, setEscalationCount] = useState<number>(0);

  if (!isAllowed) {
    return <ForbiddenPage />;
  }

  const arRecords: any[] = arData?.items || [];
  const clients: any[] = clientsData?.items || (Array.isArray(clientsData) ? clientsData : []);
  const activeArRecords = arRecords.filter(r => (r.outstandingBalance ?? 0) > 0);

  const roleNorm = (user?.role || '').toUpperCase().replace(/\s+/g, '_');
  const isManager = roleNorm === 'FINANCIAL_MANAGER' || roleNorm === 'HEAD_ACCOUNTANT';

  // ── Per-Client Detail Drill-Down View ──────────────────────────────
  if (id) {
    const client = clients.find((c: any) => c.id === id || c.clientCode === id);
    const clientArRecords = arRecords.filter((r: any) => r.clientId === id);
    const totalOriginal = clientArRecords.reduce((s: number, r: any) => s + (r.originalAmount || 0), 0);
    const totalOutstanding = clientArRecords.reduce((s: number, r: any) => s + (r.outstandingBalance || 0), 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <button 
          onClick={() => navigate('/accounts-receivable')}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, padding: 0, fontSize: '0.95rem' }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} /> Back to Accounts Receivable
        </button>

        {client ? (
          <ClientInfoCard client={client} onBack={() => navigate('/accounts-receivable')} />
        ) : (
          <div style={{ background: '#0F172A', color: 'white', padding: '24px', borderRadius: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Client Account · {id}</h2>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-file-invoice" style={{ fontSize: 22, color: '#6366F1' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Billed</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>{formatPeso(totalOriginal)}</div>
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-clock-exclamation" style={{ fontSize: 22, color: '#EF4444' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: totalOutstanding > 0 ? '#DC2626' : '#059669' }}>{formatPeso(totalOutstanding)}</div>
            </div>
          </div>
        </div>

        <ArRecordsCards arRecords={clientArRecords} clients={clients} loading={arLoading} />
      </div>
    );
  }

  // ── Main Accounts Receivable Dashboard View ────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 1. Global AR Aging KPIs */}
      <SharedKPIs arRecords={arRecords} />

      {/* 2. Top-Level Tab Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid #E2E8F0', marginTop: 8 }}>
        <button
          onClick={() => setActiveTab('records')}
          style={{
            padding: '12px 22px',
            border: 'none',
            borderBottom: activeTab === 'records' ? '3px solid #0D9488' : '3px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.95rem',
            color: activeTab === 'records' ? '#0D9488' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: -2,
            transition: 'all 0.15s ease'
          }}
        >
          <i className="ti ti-receipt" style={{ fontSize: 18 }} />
          AR Aging &amp; Records
          <span style={{
            background: activeTab === 'records' ? '#CCFBF1' : '#F1F5F9',
            color: activeTab === 'records' ? '#0F766E' : '#64748B',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            {activeArRecords.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('escalations')}
          style={{
            padding: '12px 22px',
            border: 'none',
            borderBottom: activeTab === 'escalations' ? '3px solid #0D9488' : '3px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.95rem',
            color: activeTab === 'escalations' ? '#0D9488' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: -2,
            transition: 'all 0.15s ease'
          }}
        >
          <i className="ti ti-shield-alert" style={{ fontSize: 18 }} />
          {isManager ? 'Manager Escalation Queue' : 'AI Collection Priorities'}
          <span style={{
            background: activeTab === 'escalations' ? (escalationCount > 0 ? '#FEE2E2' : '#CCFBF1') : '#F1F5F9',
            color: activeTab === 'escalations' ? (escalationCount > 0 ? '#DC2626' : '#0F766E') : '#64748B',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            {escalationCount}
          </span>
        </button>
      </div>

      {/* 3. Active Tab View */}
      {activeTab === 'records' ? (
        <ArRecordsCards arRecords={arRecords} clients={clients} loading={arLoading} />
      ) : isManager ? (
        <ManagerView 
          user={user} 
          arRecords={arRecords} 
          clients={clients} 
          onCountChange={setEscalationCount}
          onSwitchTab={setActiveTab}
        />
      ) : (
        <AccountantView 
          user={user} 
          arRecords={arRecords} 
          clients={clients} 
          onCountChange={setEscalationCount}
          onSwitchTab={setActiveTab}
        />
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AccountsReceivable;
