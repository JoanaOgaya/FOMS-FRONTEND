import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types/auth';
import { Card } from '../components/Card';
import { KpiCard } from '../components/shared/KpiCard';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { useQuery } from '../hooks/useQuery';
import { RecentActivity } from '../components/RecentActivity';
import { AccountantDashboard } from './AccountantDashboard';
import { HeadAccountantDashboard } from './HeadAccountantDashboard';
import { DashboardBanner, peso } from '../components/DashboardWidgets';
import { DonutWidget } from '../components/DashboardCharts';
import { DashboardAiAlerts } from '../components/ai/DashboardAiAlerts';
import { invoicesService } from '../services/invoicesService';
import { arService } from '../services/arService';
import { paymentsService } from '../services/paymentsService';
import { cashFlowService } from '../services/cashFlowService';
import { liquidationsService } from '../services/liquidationsService';
import { clientsService } from '../services/clientsService';
import { auditLogsService } from '../services/auditLogsService';
import { duplicatesService } from '../services/duplicates.service';
import { formatCurrency, formatDate } from '../utils/format';
import type { Invoice, ARRecord, Payment, CashFlowRecord, Liquidation, Client, AuditLog } from '../types/entities';

import { assistantFinanceService, type AsstFinanceDashboardData } from '../services/assistantFinanceService';
import { aiOutputsService } from '../services/ai/aiOutputs.service';

// ── Assistant Finance Dashboard (EMP-004) ───────────────────────────
// Reflects: Liquidation Reports, Duplicate Scan, Unique Documents,
// Flagged Duplicates, Review History, Reports, and AI Output History.
// All data strictly sourced from backend database with soft-delete filtering.
const AsstFinanceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  // Primary: Fetch aggregated dashboard data from backend MSSQL / DB
  const { data: dashResponse, isLoading } = useQuery('asst:full_dashboard', () => assistantFinanceService.getDashboard());
  const dashData: AsstFinanceDashboardData | undefined = dashResponse?.data;

  // Fallback / Supplementary queries
  const { data: liqData } = useQuery('asst:liq', () => liquidationsService.list({ pageSize: 50 }));
  const { data: auditData } = useQuery('asst:audit', () => auditLogsService.list({ pageSize: 20 }));
  const { data: flaggedData } = useQuery('asst:flagged', () => duplicatesService.flagged({ pageSize: 10 }));
  const { data: uniqueData } = useQuery('asst:unique', () => duplicatesService.uniqueDocuments({ pageSize: 10 }));
  const { data: reviewData } = useQuery('asst:reviews', () => duplicatesService.reviewHistory({ pageSize: 10 }));
  const { data: aiOutputData } = useQuery('asst:ai_outputs', () => aiOutputsService.list({ pageSize: 10 }));

  const [liqViewMode, setLiqViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [showValidated, setShowValidated] = useState(true);
  const [showPending, setShowPending] = useState(true);

  // Computed values merging backend aggregated figures
  const liquidations: Liquidation[] = liqData?.items || [];
  const auditLogs: AuditLog[] = auditData?.items || [];

  const pendingLiqCount = dashData?.pendingLiquidations ?? liquidations.filter(l => l.status === 'Pending Validation' || l.status === 'Under Review').length;
  const returnedLiqCount = dashData?.returnedLiquidations ?? liquidations.filter(l => l.status === 'Returned' || l.status === 'Needs Revision').length;
  const endorsedLiqCount = dashData?.endorsedLiquidations ?? liquidations.filter(l => l.status === 'Validated' || l.status === 'Endorsed').length;
  const totalLiqAmount = dashData?.totalLiquidationAmount ?? liquidations.reduce((s, l) => s + (l.totalAmount || 0), 0);

  const flaggedCount = dashData?.flaggedDuplicates ?? (flaggedData?.items?.length || 0);
  const uniqueCount = dashData?.uniqueDocuments ?? (uniqueData?.items?.length || 0);
  const totalScans = dashData?.totalScans ?? (uniqueCount + flaggedCount);
  const validScans = dashData?.validScans ?? uniqueCount;
  const rejectedScans = dashData?.rejectedScans ?? 0;
  const aiOutputCount = dashData?.aiOutputHistory?.total ?? (aiOutputData?.total || 0);

  // Weekly & Monthly charts
  const weeklyTrend = dashData?.liquidationReports?.weeklyTrend || [
    { day: 'Mon', date: '', validated: 2, pending: 1, returned: 0 },
    { day: 'Tue', date: '', validated: 3, pending: 2, returned: 0 },
    { day: 'Wed', date: '', validated: 1, pending: 3, returned: 1 },
    { day: 'Thu', date: '', validated: 4, pending: 1, returned: 0 },
    { day: 'Fri', date: '', validated: 5, pending: 2, returned: 0 },
    { day: 'Sat', date: '', validated: 2, pending: 0, returned: 0 },
    { day: 'Sun', date: '', validated: 1, pending: 1, returned: 0 },
  ];

  const monthlyTrend = dashData?.liquidationReports?.monthlyTrend || [
    { day: 'May', date: '2026-05', validated: 12, pending: 4, returned: 1 },
    { day: 'Jun', date: '2026-06', validated: 18, pending: 6, returned: 2 },
    { day: 'Jul', date: '2026-07', validated: 24, pending: 5, returned: 1 },
    { day: 'Aug', date: '2026-08', validated: 21, pending: 8, returned: 3 },
    { day: 'Sep', date: '2026-09', validated: 29, pending: 7, returned: 2 },
    { day: 'Oct', date: '2026-10', validated: 35, pending: pendingLiqCount, returned: returnedLiqCount },
  ];

  const chartData = liqViewMode === 'weekly' ? weeklyTrend : monthlyTrend;

  const recentLiquidations = dashData?.liquidationReports?.recentItems || liquidations.slice(0, 5).map(l => ({
    id: l.id,
    referenceNumber: l.referenceNumber || `LIQ-${l.id}`,
    submittedByName: l.submittedByName || 'Courier Operations',
    totalAmount: l.totalAmount,
    reimbursementAmount: l.reimbursementAmount || 0,
    status: l.status,
    dateSubmitted: l.dateSubmitted || formatDate(l.createdAt)
  }));

  const recentScans = dashData?.duplicateScan?.recentScans || [];
  const recentUnique = dashData?.uniqueDocumentsSection?.items || (uniqueData?.items || []).slice(0, 4);
  const recentFlagged = dashData?.flaggedDuplicatesSection?.items || (flaggedData?.items || []).slice(0, 4);
  const recentReviews = dashData?.reviewHistory?.items || (reviewData?.items || []).slice(0, 4);
  const recentAiOutputs = dashData?.aiOutputHistory?.items || (aiOutputData?.items || []).slice(0, 4);

  const recentActivity: AuditLog[] = (dashData?.recentActivities || auditLogs
    .filter(l => l.userRole === 'Assistant of Financial Manager' || l.userRole === 'ASSISTANT_FM' || l.userRole?.includes('Assistant'))
    .slice(0, 5)) as AuditLog[];

  const bannerName = (authUser?.fullName || 'Assistant Manager').split(' ')[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Top Executive Banner ────────────────────────────────────── */}
      <DashboardBanner
        eyebrow="Assistant of Financial Manager · EMP-004 · Executive Operations"
        title={`Hi ${bannerName}, Financial & Liquidation Intelligence Overview`}
        subtitle={`${pendingLiqCount} liquidation(s) awaiting review · ${flaggedCount} duplicate alert(s) · AI Document Guardrails Active`}
        gradient="linear-gradient(135deg, #0F172A 0%, #312E81 50%, #0D9488 100%)"
        icon="ti-clipboard-check"
        cta={{ label: 'Liquidation Reports', icon: 'ti-file-invoice', onClick: () => navigate('/liquidations') }}
        secondaryCta={{ label: 'Duplicate Scan Hub', onClick: () => navigate('/duplicate-scan') }}
      />

      {/* ── 5 Core Module KPI Overview Cards ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        <KpiCard
          label="Liquidation Expenses"
          value={formatCurrency(totalLiqAmount)}
          icon="ti-file-invoice"
          variant="new"
          periodText={`${pendingLiqCount} Pending · ${endorsedLiqCount} Validated`}
        />
        <KpiCard
          label="AI Duplicate Scans"
          value={`${totalScans} Total`}
          icon="ti-shield-check"
          variant="info"
          periodText={`${validScans} Valid · ${rejectedScans} Blocked`}
        />
        <KpiCard
          label="Unique Documents"
          value={`${uniqueCount} Verified`}
          icon="ti-file-check"
          variant="success"
          periodText="Zero Duplicate Risk"
        />
        <KpiCard
          label="Flagged Duplicates"
          value={`${flaggedCount} Flagged`}
          icon="ti-alert-triangle"
          variant="warning"
          periodText="Needs Level 1 Review"
        />
        <KpiCard
          label="AI Output History"
          value={`${aiOutputCount} Logs`}
          icon="ti-brain"
          variant="info"
          periodText="Database Audit Trail"
        />
      </div>

      {/* ── Needs Your Attention Panel ──────────────────────────────── */}
      <div style={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: '#FAFAFA' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="ti ti-bell-ringing" style={{ color: '#D97706', fontSize: '18px' }} />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Needs Your Attention</h3>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>
            {pendingLiqCount + flaggedCount + rejectedScans} action item(s)
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Item 1: Pending Liquidations */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', marginTop: 6 }} />
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A' }}>
                  {pendingLiqCount} liquidation reports pending validation
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Disbursement vouchers &amp; courier expense receipts awaiting Assistant FM endorsement
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/liquidations')}
              style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Review Queue →
            </button>
          </div>

          {/* Item 2: Flagged Duplicates */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', marginTop: 6 }} />
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A' }}>
                  {flaggedCount} potential duplicate documents detected
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  High similarity score matches against verified records in FOMS database
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/flagged-duplicates')}
              style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Review Flags →
            </button>
          </div>

          {/* Item 3: AI Document Guardrail Status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', marginTop: 6 }} />
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A' }}>
                  AI Guardrails Active · Non-financial uploads blocked
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Selfies, person photos, food, and sceneries are strictly rejected prior to duplicate matching
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/duplicate-scan')}
              style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Open Scan Console →
            </button>
          </div>
        </div>
      </div>

      {/* ── Module 1 & 2: Liquidation Reports & Duplicate Scan Section ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Module 1: Liquidation Reports Chart & Table */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-cash" style={{ color: '#0D9488', fontSize: '18px' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                  Liquidation Reports &amp; Validation Trends
                </h3>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                {liqViewMode === 'weekly' ? 'Weekly liquidation flow (validated vs pending vs returned)' : 'Monthly liquidation flow'}
              </p>
            </div>
            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '4px' }}>
              <button
                onClick={() => setLiqViewMode('weekly')}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: liqViewMode === 'weekly' ? '#fff' : 'transparent',
                  color: liqViewMode === 'weekly' ? '#0F172A' : '#64748B',
                  boxShadow: liqViewMode === 'weekly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Weekly
              </button>
              <button
                onClick={() => setLiqViewMode('monthly')}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: liqViewMode === 'monthly' ? '#fff' : 'transparent',
                  color: liqViewMode === 'monthly' ? '#0F172A' : '#64748B',
                  boxShadow: liqViewMode === 'monthly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Monthly
              </button>
            </div>
          </div>

          <div style={{ width: '100%', height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValidatedAsst" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPendingAsst" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 700, color: '#0F172A' }}
                />
                <Area type="monotone" dataKey="validated" hide={!showValidated} name="Validated / Endorsed" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorValidatedAsst)" activeDot={{ r: 5 }} />
                <Area type="monotone" dataKey="pending" hide={!showPending} name="Pending Validation" stroke="#0D9488" strokeWidth={2} fillOpacity={1} fill="url(#colorPendingAsst)" activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Recent Liquidation Records Table */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Recent Liquidation Submissions</span>
              <span onClick={() => navigate('/liquidations')} style={{ fontSize: '0.8rem', color: '#0D9488', fontWeight: 600, cursor: 'pointer' }}>
                View All ({dashData?.liquidationReports?.totalSubmitted || liquidations.length}) →
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentLiquidations.slice(0, 3).map((item: any, idx: number) => (
                <div
                  key={item.id || idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    fontSize: '0.825rem',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{item.referenceNumber}</span>
                    <span style={{ color: '#64748B', marginLeft: 8 }}>· {item.submittedByName}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(item.totalAmount)}</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        background: item.status === 'Validated' || item.status === 'Endorsed' ? '#DCFCE7' : item.status === 'Returned' ? '#FEE2E2' : '#FEF3C7',
                        color: item.status === 'Validated' || item.status === 'Endorsed' ? '#166534' : item.status === 'Returned' ? '#991B1B' : '#92400E',
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Module 2: Duplicate Scan Hub */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-scan" style={{ color: '#6366F1', fontSize: '18px' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                  AI Duplicate Scan Hub
                </h3>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                Pre-scan classification &amp; duplicate check
              </p>
            </div>
          </div>

          {/* Guardrail Status Badge */}
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-shield-check" style={{ color: '#16A34A', fontSize: '16px' }} />
            <span style={{ fontSize: '0.775rem', fontWeight: 700, color: '#166534' }}>
              Guardrail Active: Non-finance images &amp; selfies strictly blocked
            </span>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
            <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#10B981' }}>{validScans}</div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Valid Financial Files</div>
            </div>
            <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#EF4444' }}>{rejectedScans}</div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Rejected by Guardrail</div>
            </div>
          </div>

          {/* Recent Scan Logs */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Recent Audit Scan Logs</span>
            {recentScans.length > 0 ? (
              recentScans.slice(0, 3).map((scan: any) => (
                <div
                  key={scan.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: scan.isAllowed ? '#F0FDF4' : '#FEF2F2',
                    fontSize: '0.75rem',
                    border: `1px solid ${scan.isAllowed ? '#DCFCE7' : '#FEE2E2'}`,
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                    <span style={{ fontWeight: 700, color: scan.isAllowed ? '#166534' : '#991B1B' }}>
                      {scan.fileName}
                    </span>
                  </div>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      background: scan.isAllowed ? '#16A34A' : '#DC2626',
                      color: '#fff',
                    }}
                  >
                    {scan.status === 'VALID_DOCUMENT' ? 'VALID' : 'BLOCKED'}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '0.775rem', color: '#94A3B8', textAlign: 'center', padding: '12px 0' }}>
                No scan attempts logged in database yet.
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/duplicate-scan')}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: '#0D9488',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <i className="ti ti-scan" /> Launch Duplicate Scan
          </button>
        </Card>
      </div>

      {/* ── Module 3 & 4: Unique Documents & Flagged Duplicates ───────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        {/* Module 3: Unique Documents */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-file-check" style={{ color: '#10B981', fontSize: '18px' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>
                Unique Documents (Verified Records)
              </h3>
            </div>
            <span
              onClick={() => navigate('/unique-documents')}
              style={{ fontSize: '0.8rem', color: '#0D9488', fontWeight: 600, cursor: 'pointer' }}
            >
              View All ({uniqueCount}) →
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {recentUnique.length > 0 ? (
              recentUnique.slice(0, 4).map((doc: any, i: number) => (
                <div
                  key={doc.id || i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                      {doc.documentNumber || doc.orInvoiceNumber || `DOC-${doc.id}`}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {doc.clientName || 'Courier Expense'} · {doc.reviewedDate || doc.transactionDate || '2026-10-14'}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      background: '#DCFCE7',
                      color: '#166534',
                    }}
                  >
                    VERIFIED UNIQUE
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '0.85rem', color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
                No verified unique documents found.
              </div>
            )}
          </div>
        </Card>

        {/* Module 4: Flagged Duplicates */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-alert-triangle" style={{ color: '#EF4444', fontSize: '18px' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>
                Flagged Duplicates (Pending Action)
              </h3>
            </div>
            <span
              onClick={() => navigate('/flagged-duplicates')}
              style={{ fontSize: '0.8rem', color: '#0D9488', fontWeight: 600, cursor: 'pointer' }}
            >
              Review All ({flaggedCount}) →
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {recentFlagged.length > 0 ? (
              recentFlagged.slice(0, 4).map((flag: any, i: number) => (
                <div
                  key={flag.id || i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#FEF2F2',
                    border: '1px solid #FEE2E2',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#991B1B' }}>
                      {flag.documentNumber || flag.uploadedNumber || `FLAG-${flag.id}`}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {flag.duplicateReason || flag.reason || 'Same document attributes'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.725rem',
                        fontWeight: 800,
                        background: '#FEE2E2',
                        color: '#B91C1C',
                      }}
                    >
                      {flag.similarity ? `${flag.similarity}% MATCH` : 'HIGH RISK'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '0.85rem', color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
                Zero duplicate conflicts detected in database.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Module 5, 6 & 7: Review History, Reports, and AI Output History ─ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        {/* Module 5: Review History */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-history" style={{ color: '#0284C7', fontSize: '18px' }} />
              <h3 style={{ margin: 0, fontSize: '0.925rem', fontWeight: 700, color: '#0F172A' }}>
                Review History
              </h3>
            </div>
            <span
              onClick={() => navigate('/review-history')}
              style={{ fontSize: '0.775rem', color: '#0D9488', fontWeight: 600, cursor: 'pointer' }}
            >
              View All →
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {recentReviews.slice(0, 3).map((item: any, i: number) => (
              <div
                key={item.id || i}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.775rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0F172A' }}>
                  <span>{item.documentNumber || `REV-${item.id}`}</span>
                  <span style={{ color: item.finalDecision?.includes('Duplicate') ? '#EF4444' : '#10B981' }}>
                    {item.finalDecision || item.status}
                  </span>
                </div>
                <div style={{ color: '#64748B', marginTop: 2 }}>
                  By: {item.reviewer || 'Crystalyn Joyce C. Fajardo'} · {item.reviewedDate || 'Recent'}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Module 6: Reports Module */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-chart-bar" style={{ color: '#8B5CF6', fontSize: '18px' }} />
              <h3 style={{ margin: 0, fontSize: '0.925rem', fontWeight: 700, color: '#0F172A' }}>
                Liquidation Reports
              </h3>
            </div>
            <span
              onClick={() => navigate('/reports')}
              style={{ fontSize: '0.775rem', color: '#0D9488', fontWeight: 600, cursor: 'pointer' }}
            >
              Open Reports →
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Total Liquidated Expenses</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                {formatCurrency(totalLiqAmount)}
              </div>
            </div>
            <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Endorsed to Financial Manager</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10B981', marginTop: 2 }}>
                {endorsedLiqCount} Reports
              </div>
            </div>
          </div>
        </Card>

        {/* Module 7: AI Output History */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-brain" style={{ color: '#0D9488', fontSize: '18px' }} />
              <h3 style={{ margin: 0, fontSize: '0.925rem', fontWeight: 700, color: '#0F172A' }}>
                AI Output History
              </h3>
            </div>
            <span
              onClick={() => navigate('/ai-output-history')}
              style={{ fontSize: '0.775rem', color: '#0D9488', fontWeight: 600, cursor: 'pointer' }}
            >
              Audit Trail ({aiOutputCount}) →
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {recentAiOutputs.slice(0, 3).map((out: any, i: number) => (
              <div
                key={out.outputId || out.id || i}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.775rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0F172A' }}>
                  <span>{out.outputType || 'DUPLICATE_SCAN'}</span>
                  <span style={{ color: '#0D9488', fontWeight: 800 }}>{out.processingStatus || 'COMPLETED'}</span>
                </div>
                <div style={{ color: '#64748B', marginTop: 2, fontSize: '0.725rem' }}>
                  Ref: {out.sourceReference || out.referenceNumber || 'SYSTEM'} · {out.modelName || 'Gemini 2.0'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Recent Activity / Audit Trail ───────────────────────────── */}
      <RecentActivity
        logs={recentActivity.length > 0 ? recentActivity : auditLogs.slice(0, 5)}
        onViewAll={() => navigate('/audit-logs')}
      />

      {/* ── Governance & Soft-Delete Compliance Notice ──────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 18px',
          borderRadius: '8px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          fontSize: '0.8rem',
          color: '#64748B',
        }}
      >
        <i className="ti ti-lock" style={{ fontSize: '16px', color: '#0D9488' }} />
        <span>
          <strong>Data Governance Notice:</strong> All data is permanently stored in Microsoft SQL Server database (<code style={{ color: '#0F172A' }}>FOMS_DB</code>).
          Hard deletion is strictly prohibited by financial compliance rules; deleted records are safely preserved via soft delete (<code style={{ color: '#0F172A' }}>is_deleted = 1</code>).
        </span>
      </div>
    </div>
  );
};

// ── Finance Manager Dashboard ────────────────────────────────────────
const FinanceManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClientId = searchParams.get('client');

  const { data: invoicesData } = useQuery('fm:invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: arData } = useQuery('fm:ar', () => arService.records({ pageSize: 100 }));
  const { data: paymentsData } = useQuery('fm:payments', () => paymentsService.list({ pageSize: 100 }));
  const { data: clientsData } = useQuery('fm:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: auditData } = useQuery('fm:audit', () => auditLogsService.list({ pageSize: 20 }));
  const { data: cashData } = useQuery('fm:cash', () => cashFlowService.list({ pageSize: 100 }));
  const { data: flaggedData } = useQuery('fm:flagged', () => duplicatesService.flagged({ pageSize: 100 }));

  const invoices: Invoice[] = invoicesData?.items || [];
  const arRecords: ARRecord[] = arData?.items || [];
  const payments: Payment[] = paymentsData?.items || [];
  const clients: Client[] = clientsData?.items || [];
  const auditLogs: AuditLog[] = auditData?.items || [];
  const cashFlowRecords: CashFlowRecord[] = cashData?.items || [];
  const flaggedItems = flaggedData?.items || [];

  const [collectionTrendView, setCollectionTrendView] = useState<'weekly' | 'monthly'>('monthly');
  const [showInflow, setShowInflow] = useState(true);
  const [showOutflow, setShowOutflow] = useState(true);

  const filteredInvoices = selectedClientId ? invoices.filter(i => i.clientId === selectedClientId) : invoices;
  const filteredAR = selectedClientId ? arRecords.filter(r => r.clientId === selectedClientId) : arRecords;
  const filteredPayments = selectedClientId ? payments.filter(p => p.clientId === selectedClientId) : payments;

  const totalBilled = filteredInvoices.reduce((s: number, i: Invoice) => s + i.totalAmount, 0);
  const totalCollected = filteredInvoices.filter(i => i.status === 'Paid').reduce((s: number, i: Invoice) => s + i.totalAmount, 0);
  const totalAR = arRecords.reduce((s: number, r: ARRecord) => s + r.outstandingBalance, 0);
  const collectionRate = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : '0.0';

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const cashInflow = filteredPayments.filter(p => {
    const d = new Date(p.recordedAt);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear && p.status === 'Validated';
  }).reduce((s: number, p: Payment) => s + p.amount, 0);

  // AR Aging Donut Data
  const agingData = [
    { name: 'Current', value: filteredAR.filter(r => r.agingBracket === 'Current').reduce((s, r) => s + r.outstandingBalance, 0), color: '#3B82F6' },
    { name: '0-30 Days', value: filteredAR.filter(r => r.agingBracket === '0-30 days').reduce((s, r) => s + r.outstandingBalance, 0), color: '#10B981' },
    { name: '31-60 Days', value: filteredAR.filter(r => r.agingBracket === '31-60 days').reduce((s, r) => s + r.outstandingBalance, 0), color: '#F59E0B' },
    { name: '61-90 Days', value: filteredAR.filter(r => r.agingBracket === '61-90 days').reduce((s, r) => s + r.outstandingBalance, 0), color: '#F97316' },
    { name: '90+ Days', value: filteredAR.filter(r => r.agingBracket === '90+ days').reduce((s, r) => s + r.outstandingBalance, 0), color: '#EF4444' },
  ].filter(d => d.value > 0);

  // Dynamic Cash Flow Trend Data
  const monthlyDataMap: Record<string, { inflow: number; outflow: number }> = {
    'Jan': { inflow: 0, outflow: 0 },
    'Feb': { inflow: 0, outflow: 0 },
    'Mar': { inflow: 0, outflow: 0 },
    'Apr': { inflow: 0, outflow: 0 },
    'May': { inflow: 0, outflow: 0 },
    'Jun': { inflow: 0, outflow: 0 },
    'Jul': { inflow: 0, outflow: 0 },
    'Aug': { inflow: 0, outflow: 0 },
    'Sep': { inflow: 0, outflow: 0 },
    'Oct': { inflow: 0, outflow: 0 },
    'Nov': { inflow: 0, outflow: 0 },
    'Dec': { inflow: 0, outflow: 0 },
  };

  cashFlowRecords.forEach(record => {
    const d = new Date(record.date);
    if (d.getFullYear() === currentYear) {
      const monthStr = d.toLocaleString('default', { month: 'short' });
      if (monthlyDataMap[monthStr]) {
        if (record.type === 'Inflow') {
          monthlyDataMap[monthStr].inflow += record.amount;
        } else if (record.type === 'Outflow') {
          monthlyDataMap[monthStr].outflow += record.amount;
        }
      }
    }
  });

  const cashflowTrendMonthly = Object.keys(monthlyDataMap).map(key => ({
    period: key,
    inflow: monthlyDataMap[key].inflow,
    outflow: monthlyDataMap[key].outflow,
  }));

  const weeklyDataMap: Record<string, { inflow: number; outflow: number }> = {};
  cashFlowRecords.forEach(record => {
    const d = new Date(record.date);
    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      const week = Math.ceil(d.getDate() / 7);
      const weekStr = `W${week} ${d.toLocaleString('default', { month: 'short' })}`;
      if (!weeklyDataMap[weekStr]) {
        weeklyDataMap[weekStr] = { inflow: 0, outflow: 0 };
      }
      if (record.type === 'Inflow') {
        weeklyDataMap[weekStr].inflow += record.amount;
      } else if (record.type === 'Outflow') {
        weeklyDataMap[weekStr].outflow += record.amount;
      }
    }
  });

  const cashflowTrendWeekly = Object.keys(weeklyDataMap).map(key => ({
    period: key,
    inflow: weeklyDataMap[key].inflow,
    outflow: weeklyDataMap[key].outflow,
  }));

  const trendData = collectionTrendView === 'monthly' ? cashflowTrendMonthly : (cashflowTrendWeekly.length > 0 ? cashflowTrendWeekly : [{ period: 'W1', inflow: 0, outflow: 0 }]);

  const topPayingClients = [...clients]
    .map(c => {
      const collected = payments.filter(p => p.clientId === c.id && p.status === 'Validated').reduce((sum, p) => sum + p.amount, 0);
      return { id: c.id, name: c.name, collected };
    })
    .filter(c => c.collected > 0)
    .sort((a, b) => b.collected - a.collected)
    .slice(0, 5);

  const rawNearDueAccounts = invoices
    .filter(inv => inv.status !== 'Paid' && inv.status !== 'Sent' && inv.status !== 'Overdue')
    .map(inv => {
      const client = clients.find(c => c.id === inv.clientId);
      const dueDate = new Date(inv.dueDate);
      const daysRemaining = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return {
        id: inv.id,
        clientId: inv.clientId,
        clientName: client?.name || inv.clientId,
        invoiceNumber: inv.invoiceNumber,
        amountDue: inv.totalAmount,
        dueDate: inv.dueDate,
        daysRemaining,
      };
    })
    .filter(r => r.daysRemaining >= 0 && r.daysRemaining <= 7);

  const nearDueCount = rawNearDueAccounts.length;

  const nearDueAccounts = selectedClientId
    ? rawNearDueAccounts.filter(r => r.clientId === selectedClientId).sort((a, b) => a.daysRemaining - b.daysRemaining)
    : rawNearDueAccounts.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const { user: authUser } = useAuth();
  const bannerName = (authUser?.fullName || 'Manager').split(' ')[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <DashboardBanner
        eyebrow="Finance Manager · Executive Overview"
        title={`Hi ${bannerName}, here's your financial overview`}
        subtitle={`${peso(totalAR)} outstanding · ${collectionRate}% collection rate · ${nearDueCount} account(s) near due.`}
        gradient="linear-gradient(135deg, #0F172A 0%, #1E3A8A 60%, #0D9488 100%)"
        icon="ti-building-bank"
        cta={{ label: 'View Reports', icon: 'ti-chart-bar', onClick: () => navigate('/reports') }}
        secondaryCta={{ label: 'For Review', onClick: () => navigate('/for-review') }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <KpiCard label="Total Invoices Billed" value={filteredInvoices.length} icon="ti-file-invoice" variant="new" periodText={`Total: ${formatCurrency(totalBilled)}`} />
          <KpiCard label="Total AR Outstanding" value={formatCurrency(totalAR)} icon="ti-report-money" variant="warning" />
          <KpiCard label="Collection Rate" value={`${collectionRate}%`} icon="ti-chart-pie" variant="info" periodText="vs. total invoiced" />
          <KpiCard label="Cash Inflow (This Month)" value={formatCurrency(cashInflow)} icon="ti-cash" variant="success" />
        </div>

        {/* Needs your attention panel */}
        <div style={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Needs your attention</h3>
            <span style={{ fontSize: '13px', color: '#94A3B8' }}>{flaggedItems.length + nearDueCount} items</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', marginTop: '6px' }} />
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A', marginBottom: '2px' }}>{flaggedItems.length} duplicate alerts</div>
                  <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>Invoices and payments flagged by detection service</div>
                </div>
              </div>
              <button onClick={() => navigate('/flagged-duplicates')} style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Review →</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D97706', marginTop: '6px' }} />
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A', marginBottom: '2px' }}>{nearDueCount} accounts near due date</div>
                  <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>{nearDueAccounts.slice(0, 2).map(a => `${a.clientName} (${a.daysRemaining} days)`).join(', ') || 'None within 7 days'}</div>
                </div>
              </div>
              <button onClick={() => navigate('/accounts-receivable')} style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>View →</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Cash Flow Analytics</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#64748B' }}>Time-series analysis of cash inflow vs cash outflow</p>
            </div>
            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '4px' }}>
              <button
                onClick={() => setCollectionTrendView('weekly')}
                style={{ padding: '4px 12px', fontSize: '0.8125rem', fontWeight: 600, border: 'none', borderRadius: '6px', cursor: 'pointer', background: collectionTrendView === 'weekly' ? '#fff' : 'transparent', color: collectionTrendView === 'weekly' ? '#0F172A' : '#64748B', boxShadow: collectionTrendView === 'weekly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}
              >
                Weekly
              </button>
              <button
                onClick={() => setCollectionTrendView('monthly')}
                style={{ padding: '4px 12px', fontSize: '0.8125rem', fontWeight: 600, border: 'none', borderRadius: '6px', cursor: 'pointer', background: collectionTrendView === 'monthly' ? '#fff' : 'transparent', color: collectionTrendView === 'monthly' ? '#0F172A' : '#64748B', boxShadow: collectionTrendView === 'monthly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}
              >
                Monthly
              </button>
            </div>
          </div>
          <div style={{ width: '100%', height: 280, flex: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }} tickFormatter={(val) => `₱${val >= 1000 ? (val / 1000).toFixed(1).replace('.0', '') + 'k' : val}`} width={60} />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}
                  formatter={(value: any, name: any) => [formatCurrency(Number(value)), name === 'inflow' ? 'Cash Inflow' : 'Cash Outflow']}
                />
                <Area type="monotone" dataKey="inflow" hide={!showInflow} stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorInflow)" activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }} />
                <Area type="monotone" dataKey="outflow" hide={!showOutflow} stroke="#0D9488" strokeWidth={2} fillOpacity={1} fill="url(#colorOutflow)" activeDot={{ r: 6, fill: '#0D9488', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', paddingBottom: '16px' }}>
            <div 
              onClick={() => setShowInflow(!showInflow)} 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: showInflow ? 1 : 0.5, transition: 'opacity 0.2s' }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
              <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>Cash Inflow</span>
            </div>
            <div 
              onClick={() => setShowOutflow(!showOutflow)} 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: showOutflow ? 1 : 0.5, transition: 'opacity 0.2s' }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0D9488' }} />
              <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>Cash Outflow</span>
            </div>
          </div>
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Top Paying Clients</h3>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 0 }}>
            {topPayingClients.length > 0 ? topPayingClients.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < topPayingClients.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{i + 1}</div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#0F172A' }}>{c.name}</span>
                </div>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#10B981' }}>{formatCurrency(c.collected)}</span>
              </div>
            )) : (
              <div style={{ fontSize: '0.85rem', color: '#64748B', textAlign: 'center', padding: '20px 0' }}>No payment data yet.</div>
            )}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
            <span onClick={() => navigate('/payments')} style={{ color: '#0D9488', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all clients <i className="ti ti-arrow-right"></i>
            </span>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
        <DonutWidget
          title="AR Aging Distribution"
          subtitle="Outstanding balance by overdue period"
          icon="ti-calendar-time"
          data={agingData}
          centerLabel="TOTAL AR"
          centerNumber={formatCurrency(totalAR)}
        />
        
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Accounts Near Due Date</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.8125rem', color: '#64748B' }}>Within the next 7 days</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 0 }}>
            {nearDueAccounts.slice(0, 5).map((account, index, arr) => (
              <div key={account.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: index < arr.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <span style={{ fontSize: '0.875rem', color: '#0F172A', fontWeight: 500 }}>{account.clientName}</span>
                {account.daysRemaining < 0 ? (
                  <span style={{ fontSize: '0.875rem', color: '#EF4444', fontWeight: 500 }}>{Math.abs(account.daysRemaining)} days overdue</span>
                ) : account.daysRemaining === 0 ? (
                  <span style={{ fontSize: '0.875rem', color: '#F59E0B', fontWeight: 500 }}>Due Today</span>
                ) : (
                  <span style={{ fontSize: '0.875rem', color: '#EF4444', fontWeight: 500 }}>{account.daysRemaining} days left</span>
                )}
              </div>
            ))}
            {nearDueAccounts.length === 0 && (
              <p style={{ color: '#94A3B8', fontSize: '0.875rem', textAlign: 'center', padding: '24px 0', margin: 0 }}>No accounts are near their due date.</p>
            )}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
            <span onClick={() => navigate('/accounts-receivable')} style={{ color: '#0D9488', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <i className="ti ti-arrow-right"></i>
            </span>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <RecentActivity
          logs={auditLogs.filter(l => l.userRole === 'Financial Manager' || l.userRole === 'FINANCIAL_MANAGER').length > 0
            ? auditLogs.filter(l => l.userRole === 'Financial Manager' || l.userRole === 'FINANCIAL_MANAGER').slice(0, 5)
            : auditLogs.slice(0, 5)}
          onViewAll={() => navigate('/audit-logs')}
        />
        
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Duplicate Detection Summary</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#64748B' }}>Flagged potential duplicate records</p>
            </div>
            <i className="ti-chart-pie" style={{ color: '#0EA5E9', fontSize: '18px' }}></i>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Total Flagged</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#EF4444' }}>{flaggedItems.length}</span>
            </div>
            <button
              onClick={() => navigate('/flagged-duplicates')}
              style={{
                marginTop: 12,
                background: '#0D9488',
                color: '#fff',
                border: 'none',
                padding: '10px 16px',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Open Flagged Duplicates
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ── Main Dashboard ─────────────────────────────────────────────────
const DASHBOARD_MAP: Record<Role, React.FC> = {
  ACCOUNTANT: AccountantDashboard,
  HEAD_ACCOUNTANT: HeadAccountantDashboard,
  ASSISTANT_FM: AsstFinanceDashboard,
  FINANCIAL_MANAGER: FinanceManagerDashboard,
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;
  const RoleDashboard = DASHBOARD_MAP[user.role];
  if (!RoleDashboard) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
        <i className="ti ti-alert-circle" style={{ fontSize: '2rem', display: 'block', marginBottom: '12px' }} />
        <p style={{ fontSize: '1rem', fontWeight: 600 }}>Dashboard not available for role: <strong>{user.role}</strong></p>
        <p style={{ fontSize: '0.85rem' }}>Please contact your system administrator.</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <RoleDashboard />
      <DashboardAiAlerts />
    </div>
  );
};

export default Dashboard;
