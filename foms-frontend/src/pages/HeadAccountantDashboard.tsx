import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { invoicesService } from '../services/invoicesService';
import { paymentsService } from '../services/paymentsService';
import { arService } from '../services/arService';
import { adjustmentsService } from '../services/adjustmentsService';
import { speedpayService } from '../services/speedpayService';
import { clientsService } from '../services/clientsService';
import { auditLogsService } from '../services/auditLogsService';
import { KpiCard } from '../components/shared/KpiCard';
import { Card } from '../components/Card';
import { RecentActivity } from '../components/RecentActivity';
import { DonutWidget } from '../components/DashboardCharts';
import { formatDate } from '../utils/format';
import type { Invoice, Payment, ARRecord, FinancialAdjustment, SpeedPaySubmission, Client, AuditLog } from '../types/entities';
import {
  DashboardBanner, WorkQueue, QuickActions, peso, QueueItem,
} from '../components/DashboardWidgets';

/**
 * HEAD ACCOUNTANT DASHBOARD — "Review & Approval Center"
 * The head accountant REVIEWS: approves/rejects invoices submitted by
 * accountants, validates payments, reviews adjustments and watches AR risk.
 */
export const HeadAccountantDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: invoicesData } = useQuery('head:invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: paymentsData } = useQuery('head:payments', () => paymentsService.list({ pageSize: 100 }));
  const { data: arData } = useQuery('head:ar', () => arService.records({ pageSize: 100 }));
  const { data: adjustmentsData } = useQuery('head:adjustments', () => adjustmentsService.list({ pageSize: 100 }));
  const { data: speedPayData } = useQuery('head:speedpay', () => speedpayService.list({ pageSize: 100 }));
  const { data: clientsData } = useQuery('head:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: auditData } = useQuery('head:audit', () => auditLogsService.list({ pageSize: 20 }));

  const invoices: Invoice[] = invoicesData?.items || [];
  const payments: Payment[] = paymentsData?.items || [];
  const arRecords: ARRecord[] = arData?.items || [];
  const financialAdjustments: FinancialAdjustment[] = adjustmentsData?.items || [];
  const speedPay: SpeedPaySubmission[] = speedPayData?.items || [];
  const clients: Client[] = clientsData?.items || [];
  const auditLogs: AuditLog[] = auditData?.items || [];

  const clientName = (id: string) => clients.find(c => c.id === id)?.name || id;
  const firstName = (user?.fullName || 'Head Accountant').split(' ')[0];

  const pendingInvoices = invoices.filter(i => i.status === 'Pending Approval');
  const pendingPayments = payments.filter(p => p.status === 'Pending Validation');
  const pendingAdjustments = financialAdjustments.filter(a => a.status === 'Pending Approval');
  const pendingSpeedPay = speedPay.filter(s => s.status === 'Pending Validation');

  const totalPending = pendingInvoices.length + pendingPayments.length + pendingAdjustments.length + pendingSpeedPay.length;
  const valueAwaiting = pendingInvoices.reduce((s, i) => s + i.totalAmount, 0);

  // Decisions already made on invoices
  const approved = invoices.filter(i => ['Approved', 'Sent', 'Paid', 'Overdue'].includes(i.status)).length;
  const returned = invoices.filter(i => i.status === 'Needs Revision').length;
  const decided = approved + returned;
  const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : 0;

  const totalBalance = arRecords.reduce((s: number, r: ARRecord) => s + (r.outstandingBalance || 0), 0);
  const overdueInvoices = invoices.filter(i => i.status === 'Overdue' || i.status === 'Outstanding').length;

  const nearDueAccounts = arRecords.filter(r => {
    if (r.outstandingBalance <= 0 || r.status === 'Overdue' || r.status === 'Outstanding') return false;
    const inv = invoices.find(i => i.id === r.invoiceId);
    const dueDate = r.dueDate || inv?.dueDate;
    if (!dueDate) return false;
    const d = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    return d >= 0 && d <= 7;
  }).map(r => {
    const inv = invoices.find(i => i.id === r.invoiceId);
    return { ...r, dueDate: r.dueDate || inv?.dueDate, invoiceNumber: inv?.invoiceNumber || r.invoiceId };
  });

  const formatPeriod = (period?: string) => {
    if (!period) return '';
    const parts = period.split(' - ');
    if (parts.length === 2) {
      const s = formatDate(parts[0].trim());
      const e = formatDate(parts[1].trim());
      if (s && e) return `${s} - ${e}`;
    }
    return period;
  };

  // Unified approval queue
  const queue: QueueItem[] = [
    ...pendingInvoices.map(i => ({
      id: `inv-${i.id}`, tag: 'Invoice', tagColor: '#0F766E', tagBg: '#CCFBF1',
      title: `${i.invoiceNumber} — ${clientName(i.clientId)}`,
      subtitle: `${i.waybillIds?.length || 0} waybill(s) · prepared by ${i.createdBy} · ${formatPeriod(i.billingPeriod)}`,
      amount: i.totalAmount, actionLabel: 'Review', onClick: () => navigate('/invoice-review'),
    })),
    ...pendingPayments.map(p => ({
      id: `pay-${p.id}`, tag: 'Payment', tagColor: '#1D4ED8', tagBg: '#DBEAFE',
      title: `${p.invoiceNumber || p.invoiceId} — ${p.clientName || clientName(p.clientId)}`,
      subtitle: `${p.paymentMethod} · Ref ${p.referenceNumber}`,
      amount: p.amount, actionLabel: 'Validate', onClick: () => navigate('/payments'),
    })),
    ...pendingAdjustments.map(a => ({
      id: `adj-${a.id}`, tag: a.type, tagColor: '#7C3AED', tagBg: '#EDE9FE',
      title: `${a.id} — ${clientName(a.clientId)}`,
      subtitle: a.reason,
      amount: a.amount, actionLabel: 'Review', onClick: () => navigate('/adjustments'),
    })),
    ...pendingSpeedPay.map(s => ({
      id: `sp-${s.id}`, tag: 'SpeedPay', tagColor: '#B45309', tagBg: '#FEF3C7',
      title: `${s.id}${s.clientName ? ' — ' + s.clientName : ''}`,
      subtitle: 'Online payment awaiting validation',
      amount: typeof s.amountPaid === 'number' ? s.amountPaid : undefined,
      actionLabel: 'Validate', onClick: () => navigate('/speedpay-validation'),
    })),
  ];

  const overviewData = [
    { name: 'Invoices', value: pendingInvoices.length, color: '#0D9488' },
    { name: 'Payments', value: pendingPayments.length, color: '#3B82F6' },
    { name: 'Adjustments', value: pendingAdjustments.length, color: '#8B5CF6' },
    { name: 'SpeedPay', value: pendingSpeedPay.length, color: '#F59E0B' },
  ].filter(d => d.value > 0);

  const recentActivity = auditLogs.filter(l => l.userRole === 'Head Accountant').slice(0, 5);

  // ── Trend line graph data (real timestamps) ──
  const [trendRange, setTrendRange] = useState<'7d' | '6m'>('7d');
  const sameBucket = (iso: string | undefined, d: Date) => {
    if (!iso) return false;
    const t = new Date(iso);
    return trendRange === '7d'
      ? t.toDateString() === d.toDateString()
      : t.getMonth() === d.getMonth() && t.getFullYear() === d.getFullYear();
  };
  const buckets = Array.from({ length: trendRange === '7d' ? 7 : 6 }).map((_, i, arr) => {
    const d = new Date();
    if (trendRange === '7d') d.setDate(d.getDate() - (arr.length - 1 - i));
    else { d.setDate(1); d.setMonth(d.getMonth() - (arr.length - 1 - i)); }
    return d;
  });
  const trendData = buckets.map(d => ({
    label: trendRange === '7d'
      ? d.toLocaleString('en-PH', { weekday: 'short' })
      : d.toLocaleString('en-PH', { month: 'short' }),
    submitted: invoices.filter(i => sameBucket(i.createdAt, d) && i.status !== 'Draft').length,
    approved: invoices.filter(i => sameBucket(i.approvedAt, d)).length,
    validated: payments.filter(p => sameBucket(p.validatedAt, d)).length,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <DashboardBanner
        eyebrow="Head Accountant · Review & Approval Center"
        title={`${firstName}, ${totalPending} item${totalPending !== 1 ? 's' : ''} await your decision`}
        gradient="linear-gradient(135deg, #1E293B 0%, #0F172A 60%, #134E4A 100%)"
        icon="ti-shield-check"
        cta={{ label: 'Review Invoices', icon: 'ti-file-check', onClick: () => navigate('/invoice-review') }}
        secondaryCta={{ label: 'Audit Logs', onClick: () => navigate('/audit-logs') }}
      />

      <div className="kpi-grid">
        <KpiCard label="Invoices for Approval" value={pendingInvoices.length} icon="ti-file-check" variant="warning"
          onClick={() => navigate('/invoice-review')} />
        <KpiCard label="Payments to Validate" value={pendingPayments.length + pendingSpeedPay.length} icon="ti-cash" variant="info"
          onClick={() => navigate('/payments')} />
        <KpiCard label="Adjustments to Review" value={pendingAdjustments.length} icon="ti-adjustments-alt" variant="new"
          onClick={() => navigate('/adjustments')} />
        <KpiCard label="Approval Rate" value={`${approvalRate}%`} icon="ti-chart-pie" variant="success"
          onClick={() => navigate('/review-history')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1.3fr)', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <WorkQueue
            title="Needs your attention"
            icon="ti-gavel" iconColor="#0F766E" iconBg="#CCFBF1"
            items={queue}
            emptyText="Queue is clear — no pending approvals."
            maxItems={7}
          />

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Approval Activity Trend</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748B' }}>Invoices submitted vs approved, and payments validated</p>
              </div>
              <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 4 }}>
                {([['7d', '7 Days'], ['6m', '6 Months']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setTrendRange(k)}
                    style={{ padding: '4px 12px', fontSize: '0.8rem', fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: trendRange === k ? '#fff' : 'transparent', color: trendRange === k ? '#0F172A' : '#64748B', boxShadow: trendRange === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }} dy={8} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} labelStyle={{ fontWeight: 700, color: '#0F172A' }} />
                  <Line type="monotone" dataKey="submitted" name="Submitted" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="approved" name="Approved" stroke="#0D9488" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="validated" name="Payments Validated" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12 }}>
              {[['Submitted', '#F59E0B'], ['Approved', '#0D9488'], ['Payments Validated', '#3B82F6']].map(([n, c]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                  <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>{n}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: '1.2rem' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}>Collection Risk</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                    {overdueInvoices} overdue · {nearDueAccounts.length} due within 7 days · {peso(totalBalance)} outstanding
                  </p>
                </div>
              </div>
              <span onClick={() => navigate('/accounts-receivable')} style={{ color: '#0D9488', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>View AR</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {nearDueAccounts.slice(0, 4).map((a) => (
                <div key={a.id} onClick={() => navigate(`/accounts-receivable`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>{a.invoiceNumber} — {clientName(a.clientId)}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Due {formatDate(a.dueDate)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.85rem' }}>{peso(a.outstandingBalance)}</span>
                    <span style={{ padding: '3px 9px', borderRadius: 6, background: '#FEF3C7', color: '#D97706', fontSize: '0.7rem', fontWeight: 700 }}>Due Soon</span>
                  </div>
                </div>
              ))}
              {nearDueAccounts.length === 0 && (
                <p style={{ color: '#94A3B8', fontSize: '0.875rem', textAlign: 'center', padding: '16px 0', margin: 0 }}>No accounts are currently near due date.</p>
              )}
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <DonutWidget
            title="Pending by Type"
            icon="ti-report-money"
            data={overviewData}
            centerLabel="PENDING"
          />
          <QuickActions
            title="Jump To"
            actions={[
              { label: 'Invoice List', description: 'Review & approve invoices', icon: 'ti-file-invoice', color: '#0D9488', bg: '#CCFBF1', onClick: () => navigate('/invoicing-desk?tab=pending') },
              { label: 'For Review', description: 'Approve or return duplicate decisions', icon: 'ti-clipboard-check', color: '#7C3AED', bg: '#EDE9FE', onClick: () => navigate('/flagged-duplicates') },
              { label: 'Reports', description: 'Financial summaries', icon: 'ti-chart-bar', color: '#2563EB', bg: '#DBEAFE', onClick: () => navigate('/reports') },
            ]}
          />
          <RecentActivity title="My Recent Decisions" logs={recentActivity.length > 0 ? recentActivity : auditLogs.slice(0, 5)} onViewAll={() => navigate('/audit-logs')} />
        </div>
      </div>
    </div>
  );
};

export default HeadAccountantDashboard;
