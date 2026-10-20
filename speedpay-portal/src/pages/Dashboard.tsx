import React, { useMemo } from 'react';
import { useClientContext } from '../context/ClientContext';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, TrendingDown, TrendingUp, Calendar, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';

// ─── Mini Bar Chart ───────────────────────────────────────────────
function BarChart({ data, color = '#6366F1', height = 120 }: { data: { label: string; value: number }[]; color?: string; height?: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height, padding: '0 4px', width: '100%' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700, textAlign: 'center' }}>
            {d.value > 0 ? (d.value >= 1000 ? `₱${(d.value / 1000).toFixed(0)}k` : `₱${d.value}`) : ''}
          </div>
          <div
            style={{
              width: '100%',
              background: `linear-gradient(180deg, ${color}, ${color}99)`,
              borderRadius: '4px 4px 0 0',
              height: `${(d.value / max) * (height - 30)}px`,
              minHeight: d.value > 0 ? '4px' : '0px',
              transition: 'height 0.4s ease',
            }}
          />
          <div style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export const Dashboard: React.FC = () => {
  const { invoices, payments } = useClientContext();
  const navigate = useNavigate();

  // ── Real KPI computations from actual invoice/payment data ──
  const totalOutstanding = useMemo(
    () => invoices.filter(i => i.status === 'Unpaid' || i.status === 'Due Soon' || i.status === 'Overdue')
      .reduce((sum, i) => sum + i.amount, 0),
    [invoices]
  );

  const nextDueInvoice = useMemo(() => {
    const unpaid = invoices.filter(i => i.status === 'Unpaid' || i.status === 'Due Soon' || i.status === 'Overdue');
    if (!unpaid.length) return null;
    return unpaid.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  }, [invoices]);

  const totalPaidPeriod = useMemo(
    () => payments.filter(p => p.status === 'Validated').reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  // ── Chart: Invoice Status Breakdown ──
  const chartData = useMemo(() => [
    { label: 'Overdue', value: invoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + i.amount, 0), color: '#EF4444' },
    { label: 'Due Soon', value: invoices.filter(i => i.status === 'Due Soon').reduce((s, i) => s + i.amount, 0), color: '#F59E0B' },
    { label: 'Unpaid', value: invoices.filter(i => i.status === 'Unpaid').reduce((s, i) => s + i.amount, 0), color: '#3B82F6' },
    { label: 'Paid', value: invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + i.amount, 0), color: '#10B981' },
    { label: 'Pending Validation', value: invoices.filter(i => i.status === 'Pending Validation').reduce((s, i) => s + i.amount, 0), color: '#8B5CF6' },
  ].filter(d => d.value > 0), [invoices]);

  const chartTotal = chartData.reduce((s, d) => s + d.value, 0);

  // ── Dynamic reminders from real invoices ──
  const reminders = useMemo(() => {
    const items: { type: string; label: string; sub: string }[] = [];
    invoices.filter(i => i.status === 'Due Soon').slice(0, 2).forEach(inv => {
      items.push({
        type: 'due_soon',
        label: `Due soon: ${inv.invoiceNumber}`,
        sub: `Due on ${new Date(inv.dueDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} — ₱${inv.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
      });
    });
    invoices.filter(i => i.status === 'Overdue').slice(0, 2).forEach(inv => {
      items.push({
        type: 'overdue',
        label: `Overdue: ${inv.invoiceNumber}`,
        sub: `Was due ${new Date(inv.dueDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} — ₱${inv.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
      });
    });
    payments.filter(p => p.status === 'Validated').slice(0, 2).forEach(pay => {
      items.push({
        type: 'validated',
        label: `Payment validated: ${pay.invoiceId}`,
        sub: `₱${pay.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} via ${pay.paymentMethod} — Ref: ${pay.referenceNo}`
      });
    });
    if (items.length === 0) {
      items.push({ type: 'info', label: 'No pending invoices', sub: 'All your invoices are up to date.' });
    }
    return items;
  }, [invoices, payments]);

  // ── Monthly Payment Summary ──
  const monthlyData = useMemo(() => {
    const months: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const year = d.getFullYear();
      const month = d.getMonth();
      const value = payments
        .filter(p => {
          const pd = new Date(p.dateSubmitted);
          return pd.getFullYear() === year && pd.getMonth() === month && p.status === 'Validated';
        })
        .reduce((sum, p) => sum + p.amount, 0);
      months.push({ label, value });
    }
    return months;
  }, [payments]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: '"Inter", sans-serif' }}>
      
      <style>{`
        .kpi { background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s; }
        .kpi:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: translateY(-2px); }
        .kpi-label { font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.8px; }
        .kpi-val { font-size: 26px; font-weight: 800; color: #0F172A; letter-spacing: -0.5px; line-height: 1; }
        .kpi-trend { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; }
        .t-up { color: #059669; } .t-dn { color: #DC2626; } .t-nl { color: #64748B; }
        .ra-item { transition: all 0.2s ease; padding: 10px 12px; margin: 0 -12px; border-radius: 8px; }
        .ra-item:hover { background-color: #F8FAFC; transform: translateX(4px); }
      `}</style>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        <div className="kpi">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-label">Total Outstanding</span>
            <TrendingDown size={18} color="#EF4444" />
          </div>
          <div className="kpi-val" style={{ color: totalOutstanding > 0 ? '#EF4444' : '#0F172A' }}>
            ₱{totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="kpi-trend t-dn"><span>{invoices.filter(i => i.status === 'Overdue').length} overdue invoice(s)</span></div>
        </div>

        <div className="kpi">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-label">Next Due Date</span>
            <Calendar size={18} color="#F59E0B" />
          </div>
          <div className="kpi-val" style={{ fontSize: nextDueInvoice ? '20px' : '26px' }}>
            {nextDueInvoice
              ? new Date(nextDueInvoice.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'None'}
          </div>
          {nextDueInvoice && (
            <div className="kpi-trend t-nl">
              <span>{nextDueInvoice.invoiceNumber} — ₱{nextDueInvoice.amount.toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="kpi">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-label">Total Paid (This Period)</span>
            <TrendingUp size={18} color="#10B981" />
          </div>
          <div className="kpi-val" style={{ color: '#10B981' }}>
            ₱{totalPaidPeriod.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="kpi-trend t-up"><span>{payments.filter(p => p.status === 'Validated').length} validated payment(s)</span></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      {/* Chart: Invoice Breakdown */}
      <div style={{ background: '#FFF', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart2 size={18} color="#0EA5E9" />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Invoice Payment Summary</h3>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#D97706', background: '#FEF3C7', padding: '4px 10px', borderRadius: '12px', letterSpacing: '0.5px' }}>ALL TIME</span>
        </div>

        {chartTotal === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8', fontSize: '14px' }}>
            No invoice data available yet.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '48px', padding: '16px 24px' }}>
            {/* Donut Chart SVG */}
            <div style={{ width: '180px', height: '180px', position: 'relative', flexShrink: 0 }}>
              <svg viewBox="0 0 42 42" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                {/* Background circle */}
                <circle cx="21" cy="21" r="15.9154943" fill="transparent" stroke="#F8FAFC" strokeWidth="8" />
                {(() => {
                  let cumulativePercent = 0;
                  return chartData.map((d, i) => {
                    const percent = (d.value / chartTotal) * 100;
                    const gap = percent === 100 ? 0 : 1.5; // 1.5% gap
                    const dash = Math.max(0, percent - gap);
                    const strokeDasharray = `${dash} ${100 - dash}`;
                    const strokeDashoffset = 100 - cumulativePercent;
                    cumulativePercent += percent;
                    return (
                      <circle
                        key={i}
                        cx="21"
                        cy="21"
                        r="15.9154943"
                        fill="transparent"
                        stroke={d.color}
                        strokeWidth="8"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        style={{ transition: 'stroke-dasharray 0.5s ease' }}
                      >
                        <title>{d.label}: ₱{d.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</title>
                      </circle>
                    );
                  });
                })()}
              </svg>
            </div>
            
            {/* Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
              {chartData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  <span style={{ color: '#64748B', fontWeight: 500, width: '130px' }}>{d.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>₱{d.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 600 }}>({((d.value / chartTotal) * 100).toFixed(0)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chart: Monthly Payment Summary */}
      <div style={{ background: '#FFF', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart2 size={18} color="#10B981" />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Monthly Payment Summary</h3>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#065F46', background: '#D1FAE5', padding: '4px 10px', borderRadius: '12px', letterSpacing: '0.5px' }}>LAST 6 MONTHS</span>
        </div>

        {monthlyData.every(d => d.value === 0) ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8', fontSize: '14px' }}>
            No payment history yet.
          </div>
        ) : (
          <div style={{ padding: '0 10px', marginTop: '10px' }}>
            <BarChart data={monthlyData} color="#10B981" height={160} />
          </div>
        )}
      </div>
      </div>

      {/* Reminders */}
      <div style={{ background: '#FFF', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Reminders</h3>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {reminders.map((n, idx) => {
            const actionColor = n.type === 'due_soon' ? '#F59E0B' : n.type === 'overdue' ? '#EF4444' : n.type === 'validated' ? '#10B981' : '#94A3B8';
            return (
              <div key={idx} className="ra-item" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderBottom: idx < reminders.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: actionColor, flexShrink: 0 }} />
                  {idx < reminders.length - 1 && <div style={{ width: 1, flexGrow: 1, background: '#F1F5F9', marginTop: 4, minHeight: '20px' }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: 2 }}>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#334155', fontWeight: 600 }}>{n.label}</p>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748B' }}>{n.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Needed */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Action Needed</h3>
        <Link to="/invoices" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600, color: '#0EA5E9', textDecoration: 'none' }}>
          View all <ChevronRight size={16} />
        </Link>
      </div>

      {invoices.filter(i => i.status === 'Overdue' || i.status === 'Due Soon').length === 0 ? (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '20px', textAlign: 'center', color: '#16A34A', fontWeight: 600, fontSize: '14px' }}>
          🎉 All invoices are up to date! No actions required.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {invoices.filter(i => i.status === 'Overdue' || i.status === 'Due Soon').slice(0, 2).map((inv) => (
            <div key={inv.id} style={{ background: '#FFF', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: inv.status === 'Overdue' ? '1px solid #FECACA' : '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>{inv.invoiceNumber}</div>
                <div style={{ fontSize: '12px', color: inv.status === 'Overdue' ? '#DC2626' : '#D97706', fontWeight: 600, marginBottom: '2px' }}>{inv.status}</div>
                <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>₱{inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <button
                onClick={() => navigate('/pay', { state: { invoiceId: inv.id } })}
                style={{ background: inv.status === 'Overdue' ? '#EF4444' : '#F59E0B', color: '#FFF', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Pay now
              </button>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};
