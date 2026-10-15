import React from 'react';
import { Card } from './Card';

export const peso = (n: number) =>
  `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Welcome banner ─────────────────────────────────────────────────
interface BannerProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  gradient: string;
  icon: string;
  cta?: { label: string; icon?: string; onClick: () => void };
  secondaryCta?: { label: string; onClick: () => void };
}

export const DashboardBanner: React.FC<BannerProps> = ({ eyebrow, title, subtitle, gradient, icon, cta, secondaryCta }) => (
  <div
    style={{
      background: gradient,
      borderRadius: 16,
      padding: '24px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24,
      color: '#fff',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    <i
      className={`ti ${icon}`}
      style={{ position: 'absolute', right: 180, top: -20, fontSize: 150, opacity: 0.08, pointerEvents: 'none' }}
    />
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 6 }}>
        {eyebrow}
      </div>
      <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>{title}</h2>
      {subtitle && <p style={{ margin: '6px 0 0', fontSize: '0.9rem', opacity: 0.85 }}>{subtitle}</p>}
    </div>
    <div style={{ display: 'flex', gap: 10, position: 'relative', flexShrink: 0 }}>
      {secondaryCta && (
        <button
          onClick={secondaryCta.onClick}
          style={{
            background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)',
            padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          {secondaryCta.label}
        </button>
      )}
      {cta && (
        <button
          onClick={cta.onClick}
          style={{
            background: '#fff', color: '#0F172A', border: 'none', padding: '10px 18px', borderRadius: 10,
            fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {cta.icon && <i className={`ti ${cta.icon}`} style={{ fontSize: 16 }} />}
          {cta.label}
        </button>
      )}
    </div>
  </div>
);

// ── Work queue ─────────────────────────────────────────────────────
export interface QueueItem {
  id: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  title: string;
  subtitle?: string;
  amount?: number;
  actionLabel: string;
  onClick: () => void;
}

interface QueueProps {
  title: string;
  subtitle?: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  items: QueueItem[];
  emptyText: string;
  maxItems?: number;
  onViewAll?: () => void;
}

export const WorkQueue: React.FC<QueueProps> = ({ title, subtitle, icon, iconColor, iconBg, items, emptyText, maxItems = 6, onViewAll }) => (
  <Card style={{ padding: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #E2E8F0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className={`ti ${icon}`} style={{ fontSize: '1.2rem' }} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>{title}</h3>
          {subtitle && <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', background: '#F1F5F9', padding: '4px 10px', borderRadius: 999 }}>
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
        {onViewAll && (
          <span onClick={onViewAll} style={{ color: '#0D9488', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            View all
          </span>
        )}
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.slice(0, maxItems).map((it, idx, arr) => (
        <div
          key={it.id}
          onClick={it.onClick}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '14px 22px', cursor: 'pointer',
            borderBottom: idx < arr.length - 1 ? '1px solid #F1F5F9' : 'none', transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
            <span style={{ padding: '4px 10px', borderRadius: 6, background: it.tagBg, color: it.tagColor, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', minWidth: 92, textAlign: 'center', flexShrink: 0 }}>
              {it.tag}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
              {it.subtitle && <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.subtitle}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            {it.amount !== undefined && (
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>{peso(it.amount)}</span>
            )}
            <span style={{ color: '#0D9488', fontSize: 13, fontWeight: 600 }}>{it.actionLabel}</span>
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div style={{ padding: '36px 22px', textAlign: 'center', color: '#94A3B8', fontSize: '0.875rem' }}>
          <i className="ti ti-circle-check" style={{ fontSize: 28, color: '#10B981', display: 'block', marginBottom: 8 }} />
          {emptyText}
        </div>
      )}
    </div>
  </Card>
);

// ── Quick actions ──────────────────────────────────────────────────
export interface QuickActionItem {
  label: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  onClick: () => void;
}

export const QuickActions: React.FC<{ title?: string; actions: QuickActionItem[] }> = ({ title = 'Quick Actions', actions }) => (
  <Card style={{ padding: '18px 20px' }}>
    <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>{title}</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {actions.map((a) => (
        <div
          key={a.label}
          onClick={a.onClick}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.background = '#F8FAFC'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: a.bg, color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className={`ti ${a.icon}`} style={{ fontSize: '1.15rem' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>{a.label}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{a.description}</div>
          </div>
        </div>
      ))}
    </div>
  </Card>
);

// ── Segmented pipeline bar ─────────────────────────────────────────
export interface PipelineStage { label: string; value: number; color: string }

export const Pipeline: React.FC<{ title: string; subtitle?: string; stages: PipelineStage[] }> = ({ title, subtitle, stages }) => {
  const total = stages.reduce((s, x) => s + x.value, 0);
  return (
    <Card style={{ padding: '18px 20px' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>{title}</h3>
      {subtitle && <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>{subtitle}</p>}
      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: '#F1F5F9', margin: '16px 0' }}>
        {stages.filter(s => s.value > 0).map((s) => (
          <div key={s.label} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / (total || 1)) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
        {stages.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: '#475569' }}>{s.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};
