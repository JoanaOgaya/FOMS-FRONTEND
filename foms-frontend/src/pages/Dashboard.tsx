import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types/auth';
import { Card } from '../components/Card';
import { KpiCard } from '../components/shared/KpiCard';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { useQuery } from '../hooks/useQuery';
import { RecentActivity } from '../components/RecentActivity';
import { ErrorState } from '../components/shared/ErrorState';
import { AccountantDashboard } from './AccountantDashboard';
import { HeadAccountantDashboard } from './HeadAccountantDashboard';
import { DashboardBanner, peso } from '../components/DashboardWidgets';
import { DonutWidget, AgingBarWidget } from '../components/DashboardCharts';
import { DashboardAiAlerts } from '../components/ai/DashboardAiAlerts';
import { dashboardService } from '../services/dashboardService';
import { arService } from '../services/arService';
import { paymentsService } from '../services/paymentsService';
import { cashFlowService } from '../services/cashFlowService';
import { liquidationsService } from '../services/liquidationsService';
import { auditLogsService } from '../services/auditLogsService';
import { assistantFinanceService } from '../services/assistantFinanceService';
import { formatCurrency, formatDate } from '../utils/format';
import type { ARRecord, Payment, CashFlowRecord, Liquidation, AuditLog, FinanceManagerDashboardSummary } from '../types/entities';

// ── Assistant Finance Dashboard ──────────────────────────────────────
const AsstFinanceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { data: asstDbData } = useQuery('asst:db-summary', () => assistantFinanceService.getDashboard());
  const { data: arData } = useQuery('asst:ar', () => arService.records({ pageSize: 100 }));
  const { data: paymentsData } = useQuery('asst:payments', () => paymentsService.list({ pageSize: 100 }));
  const { data: auditData } = useQuery('asst:audit', () => auditLogsService.list({ pageSize: 20 }));
  const { data: liqData } = useQuery('asst:liq', () => liquidationsService.list({ pageSize: 100 }));
  const { data: cashData } = useQuery('asst:cash', () => cashFlowService.list({ pageSize: 100 }));

  const arRecords: ARRecord[] = arData?.items || [];
  const payments: Payment[] = paymentsData?.items || [];
  const auditLogs: AuditLog[] = auditData?.items || [];
  const liquidations: Liquidation[] = liqData?.items || [];
  const cashFlowRecords: CashFlowRecord[] = cashData?.items || [];
  
  const [liqViewMode, setLiqViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [showValidated, setShowValidated] = useState(true);
  const [showPending, setShowPending] = useState(true);

  const totalAR = arRecords.reduce((s: number, r: ARRecord) => s + r.outstandingBalance, 0);
  const nearDue = arRecords.filter((r: ARRecord) => {
    if (r.outstandingBalance <= 0 || r.status === 'Overdue' || r.status === 'Outstanding') return false;
    const dueDate = r.dueDate;
    if (!dueDate) return false;
    const daysRemaining = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysRemaining >= 0 && daysRemaining <= 7;
  }).length;

  const recentActivity = auditLogs
    .filter((l: AuditLog) => l.userRole === 'Assistant of Finance Manager' || l.userRole === 'ASSISTANT_FM')
    .slice(0, 5);

  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const liquidationTrendWeekly = last7Days.map(date => {
    const dayStr = date.toLocaleString('default', { weekday: 'short' });
    const dayLiquidations = liquidations.filter((l: Liquidation) => {
      const lDate = new Date(l.submittedAt || Date.now());
      return lDate.toDateString() === date.toDateString();
    });

    return {
      day: dayStr,
      validated: dayLiquidations.filter((l: Liquidation) => l.status === 'Validated').length,
      pending: dayLiquidations.filter((l: Liquidation) => l.status === 'Pending Validation').length,
      returned: dayLiquidations.filter((l: Liquidation) => l.status === 'Returned').length,
    };
  });

  const last6Months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return d;
  });

  const liquidationTrendMonthly = last6Months.map(date => {
    const monthStr = date.toLocaleString('default', { month: 'short' });
    const monthLiquidations = liquidations.filter((l: Liquidation) => {
      const lDate = new Date(l.submittedAt || Date.now());
      return lDate.getMonth() === date.getMonth() && lDate.getFullYear() === date.getFullYear();
    });

    return {
      day: monthStr,
      validated: monthLiquidations.filter((l: Liquidation) => l.status === 'Validated').length,
      pending: monthLiquidations.filter((l: Liquidation) => l.status === 'Pending Validation').length,
      returned: monthLiquidations.filter((l: Liquidation) => l.status === 'Returned').length,
    };
  });

  const asstDb = asstDbData?.data;
  const liquidationTrendData = (liqViewMode === 'weekly' 
    ? (asstDb?.liquidationReports?.weeklyTrend && asstDb.liquidationReports.weeklyTrend.length > 0 ? asstDb.liquidationReports.weeklyTrend : liquidationTrendWeekly)
    : (asstDb?.liquidationReports?.monthlyTrend && asstDb.liquidationReports.monthlyTrend.length > 0 ? asstDb.liquidationReports.monthlyTrend : liquidationTrendMonthly));

  const totalCashInflow = cashFlowRecords.filter((r: CashFlowRecord) => r.type === 'Inflow').reduce((s: number, r: CashFlowRecord) => s + r.amount, 0);
  const totalCashOutflow = cashFlowRecords.filter((r: CashFlowRecord) => r.type === 'Outflow').reduce((s: number, r: CashFlowRecord) => s + r.amount, 0);
  const totalNetCash = totalCashInflow - totalCashOutflow;
  const pendingLiquidationCount = asstDb?.pendingLiquidations ?? liquidations.filter((l: Liquidation) => l.status === 'Pending Validation').length;

  const bannerName = (authUser?.fullName || 'Assistant').split(' ')[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <DashboardBanner
        eyebrow="Assistant of Finance Manager · Validation Desk"
        title={`Hi ${bannerName}, ${pendingLiquidationCount} liquidation${pendingLiquidationCount !== 1 ? 's' : ''} awaiting review`}
        subtitle={`${nearDue} account(s) due within 7 days · ${peso(totalAR)} outstanding AR.`}
        gradient="linear-gradient(135deg, #7C3AED 0%, #6D28D9 55%, #4C1D95 100%)"
        icon="ti-cash"
        cta={{ label: 'Liquidation Reports', icon: 'ti-cash', onClick: () => navigate('/liquidations') }}
        secondaryCta={{ label: 'SpeedPay Validation', onClick: () => navigate('/speedpay-validation') }}
      />
      <div className="kpi-grid">
        <KpiCard label="Total Cash Inflows" value={formatCurrency(totalCashInflow)} icon="ti-arrow-down-right" variant="success" periodText="Overall Inflows" />
        <KpiCard label="Total Cash Outflows" value={formatCurrency(totalCashOutflow)} icon="ti-arrow-up-right" variant="danger" periodText="Overall Outflows" />
        <KpiCard label="Net Cash Balance" value={formatCurrency(totalNetCash)} icon="ti-wallet" variant={totalNetCash >= 0 ? "new" : "danger"} periodText="Current Balance" />
        <KpiCard label="Pending Liquidations" value={pendingLiquidationCount} icon="ti-file-search" variant="warning" periodText="Awaiting Review/Approval" />
      </div>
      
      <div style={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Needs your attention</h3>
          <span style={{ fontSize: '13px', color: '#94A3B8' }}>{pendingLiquidationCount} items</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', marginTop: '6px' }} />
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A', marginBottom: '2px' }}>{pendingLiquidationCount} liquidation reports pending validation</div>
                <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>Expense disbursements and receipts awaiting review</div>
              </div>
            </div>
            <button onClick={() => navigate('/liquidations')} style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Review →</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>Liquidation Validation Overview</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                  {liqViewMode === 'weekly' ? 'Last 7 Days Liquidations Processed' : 'Last 6 Months Liquidations Processed'}
                </p>
              </div>
              <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '4px' }}>
                <button
                  onClick={() => setLiqViewMode('weekly')}
                  style={{ padding: '4px 12px', fontSize: '0.8125rem', fontWeight: 600, border: 'none', borderRadius: '6px', cursor: 'pointer', background: liqViewMode === 'weekly' ? '#fff' : 'transparent', color: liqViewMode === 'weekly' ? '#0F172A' : '#64748B', boxShadow: liqViewMode === 'weekly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setLiqViewMode('monthly')}
                  style={{ padding: '4px 12px', fontSize: '0.8125rem', fontWeight: 600, border: 'none', borderRadius: '6px', cursor: 'pointer', background: liqViewMode === 'monthly' ? '#fff' : 'transparent', color: liqViewMode === 'monthly' ? '#0F172A' : '#64748B', boxShadow: liqViewMode === 'monthly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}
                >
                  Monthly
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 250, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={liquidationTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValidated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9488" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} labelStyle={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }} />
                  <Area type="monotone" dataKey="validated" hide={!showValidated} name="Validated" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorValidated)" activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="pending" hide={!showPending} name="Pending" stroke="#0D9488" strokeWidth={2} fillOpacity={1} fill="url(#colorPending)" activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '16px' }}>
              <div 
                onClick={() => setShowValidated(!showValidated)} 
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: showValidated ? 1 : 0.5, transition: 'opacity 0.2s' }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
                <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>Validated</span>
              </div>
              <div 
                onClick={() => setShowPending(!showPending)} 
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: showPending ? 1 : 0.5, transition: 'opacity 0.2s' }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0D9488' }} />
                <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>Pending Validation</span>
              </div>
            </div>
          </Card>
        </div>

        <RecentActivity logs={recentActivity.length > 0 ? recentActivity : auditLogs.slice(0, 5)} />
      </div>
    </div>
  );
};

// ── Finance Manager Dashboard ────────────────────────────────────────
const FinanceManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedClientId = searchParams.get('client');
  const [collectionTrendView, setCollectionTrendView] = useState<'weekly' | 'monthly'>('monthly');
  const [showInflow, setShowInflow] = useState(true);
  const [showOutflow, setShowOutflow] = useState(true);
  const { user: authUser } = useAuth();
  const dashboardQuery = useQuery(
    `dashboard:finance-manager:${authUser?.employeeId}:${selectedClientId ?? 'all'}:${collectionTrendView}`,
    () => dashboardService.financeManagerExecutive({
      clientId: selectedClientId ?? undefined,
      period: collectionTrendView,
    }),
    { enabled: !!authUser },
  );
  const summary = dashboardQuery.data;
  const bannerName = (authUser?.fullName || 'Manager').split(' ')[0];

  if (!summary && dashboardQuery.isLoading) {
    return <div role="status" aria-live="polite" style={{ padding: 40, color: '#64748B' }}>Loading executive dashboard…</div>;
  }

  if (!summary && dashboardQuery.error) {
    return <ErrorState error={dashboardQuery.error} onRetry={dashboardQuery.refetch} />;
  }

  if (!summary) {
    return <ErrorState error={new Error('Executive dashboard data is unavailable.')} onRetry={dashboardQuery.refetch} />;
  }

  const agingColors: Record<string, string> = {
    Current: '#3B82F6',
    '0-30 days': '#10B981',
    '31-60 days': '#F59E0B',
    '61-90 days': '#F97316',
    '90+ days': '#EF4444',
  };
  const agingData = (summary.agingBuckets && summary.agingBuckets.length > 0
    ? summary.agingBuckets
    : [
        { label: 'Current', value: 0 },
        { label: '0-30 days', value: 0 },
        { label: '31-60 days', value: 0 },
        { label: '61-90 days', value: 0 },
        { label: '90+ days', value: 0 },
      ]
  ).map(bucket => ({
    name: bucket.label,
    value: bucket.value,
    color: agingColors[bucket.label] ?? '#64748B'
  }));
  const hasAgingData = agingData.some(bucket => bucket.value > 0);
  const trendData = summary.cashFlowAnalytics;
  const hasCashFlowData = trendData.some(row => row.inflow > 0 || row.outflow > 0);
  const nearDueAccounts = summary.nearDueAccounts;
  const nearDueCount = summary.accountsNearDueDate;
  const totalAttentionItems = summary.duplicateAlerts + nearDueCount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {dashboardQuery.error && <ErrorState error={dashboardQuery.error} onRetry={dashboardQuery.refetch} />}
      <DashboardBanner
        eyebrow="Finance Manager · Executive Overview"
        title={`Hi ${bannerName}, here's your financial overview`}
        gradient="linear-gradient(135deg, #0F172A 0%, #1E3A8A 60%, #0D9488 100%)"
        icon="ti-building-bank"
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="kpi-grid">
          <KpiCard label="Total Invoices Billed" value={summary.totalInvoicesBilled} icon="ti-file-invoice" variant="new" hideTrend />
          <KpiCard label="Total AR Outstanding" value={formatCurrency(summary.totalArOutstanding)} icon="ti-report-money" variant="warning" hideTrend />
          <KpiCard label="Collection Rate" value={`${summary.collectionRate.toFixed(1)}%`} icon="ti-chart-pie" variant="info" hideTrend />
          <KpiCard label="Cash Inflow (This Month)" value={formatCurrency(summary.cashInflowThisMonth)} icon="ti-cash" variant="success" hideTrend />
        </div>

        {/* Needs your attention panel */}
        <div style={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Needs your attention</h3>
            <span style={{ fontSize: '13px', color: '#94A3B8' }}>{totalAttentionItems} items</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', marginTop: '6px' }} />
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A', marginBottom: '2px' }}>{summary.duplicateAlerts} duplicate alerts</div>
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
          <div style={{ width: '100%', height: 280, minHeight: 280, flex: 1 }}>
            {hasCashFlowData ? (
              <ResponsiveContainer width="100%" height={280}>
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
            ) : (
              <div
                role="status"
                style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#94A3B8', fontSize: '0.875rem' }}
              >
                No cash-flow transactions recorded for this period.
              </div>
            )}
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
            {summary.topPayingClients.length > 0 ? summary.topPayingClients.map((c, i) => (
              <div key={c.clientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < summary.topPayingClients.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{i + 1}</div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#0F172A' }}>{c.clientName}</span>
                </div>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#10B981' }}>{formatCurrency(c.amount)}</span>
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
        {hasAgingData ? (
          <AgingBarWidget
            title="AR Aging Distribution"
            subtitle="Outstanding balance by overdue period"
            icon="ti-calendar-time"
            data={agingData}
            totalLabel="TOTAL AR"
            totalAmount={formatCurrency(summary.totalArOutstanding)}
            defaultChartType="bar"
          />
        ) : (
          <Card style={{ minHeight: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>AR Aging Distribution</h3>
            <p role="status" style={{ margin: '12px 0 0', color: '#64748B', fontSize: '0.875rem' }}>
              No outstanding receivables to age.
            </p>
            <strong style={{ marginTop: 12, color: '#0F172A' }}>{formatCurrency(summary.totalArOutstanding)} total AR</strong>
          </Card>
        )}
        
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Accounts Near Due Date</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.8125rem', color: '#64748B' }}>Within the next 7 days</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 0 }}>
            {nearDueAccounts.slice(0, 5).map((account, index, arr) => (
              <div key={`${account.clientId}-${account.dueDate}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: index < arr.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
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
          logs={summary.recentActivity}
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
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#EF4444' }}>{summary.duplicateAlerts}</span>
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

      <section aria-labelledby="executive-insights-title">
        <h3 id="executive-insights-title" style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
          Live Financial &amp; Workflow Alerts
        </h3>
        {summary.insights.length === 0 ? (
          <div role="status" style={{ background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 12, padding: 20, color: '#64748B', textAlign: 'center' }}>
            No open financial or workflow alerts.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {summary.insights.map(insight => (
              <div
                key={insight.id}
                style={{
                  background: '#fff',
                  border: `1px solid ${insight.severity === 'high' || insight.severity === 'critical' ? '#FECACA' : '#CCFBF1'}`,
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div>
                  <strong style={{ color: '#0F172A', fontSize: '0.9rem' }}>{insight.title}</strong>
                  <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '0.85rem' }}>{insight.message}</p>
                  <span style={{ display: 'block', marginTop: 6, color: '#94A3B8', fontSize: '0.75rem' }}>
                    Current records · {formatDate(insight.createdAt)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(insight.targetRoute)}
                  style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Review →
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <p style={{ margin: 0, textAlign: 'right', color: '#94A3B8', fontSize: '0.75rem' }}>
        Dashboard data as of {formatDate(summary.asOf)}
      </p>
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
      {user.role !== 'FINANCIAL_MANAGER' && user.role !== 'ACCOUNTANT' && <DashboardAiAlerts />}
    </div>
  );
};

export default Dashboard;
