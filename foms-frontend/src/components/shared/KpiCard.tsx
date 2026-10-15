import React from 'react';
import { NOT_AVAILABLE, formatTrend } from '../../utils/format';

type TrendType = 'up' | 'down' | 'neutral';

/** Legacy pages pass a pre-formatted trend; the API-driven pages pass a number (or null). */
interface LegacyTrend {
  type: TrendType;
  value: string;
}

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon?: string;
  variant?: 'teal' | 'success' | 'warning' | 'danger' | 'info' | 'new' | 'delivery';
  /** Percent change vs previous period. null/undefined renders "N/A". */
  trend?: number | null | LegacyTrend;
  periodText?: string;
  polarity?: 'higher-is-better' | 'lower-is-better';
  loading?: boolean;
  onClick?: () => void;
}

const variantColors: Record<string, { accent: string; bg: string }> = {
  teal: { accent: 'var(--teal)', bg: 'var(--teal-bg)' },
  success: { accent: 'var(--ok)', bg: 'var(--ok-bg)' },
  warning: { accent: 'var(--warn)', bg: 'var(--warn-bg)' },
  danger: { accent: 'var(--err)', bg: 'var(--err-bg)' },
  info: { accent: 'var(--info)', bg: 'var(--info-bg)' },
  new: { accent: 'var(--new)', bg: 'var(--new-bg)' },
  delivery: { accent: 'var(--delivery)', bg: 'var(--delivery-bg)' },
};

function resolveTrend(trend: KpiCardProps['trend']): { type: TrendType; text: string } {
  if (trend === null || trend === undefined) return { type: 'neutral', text: NOT_AVAILABLE };
  if (typeof trend === 'number') return { type: trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral', text: formatTrend(trend) };
  return { type: trend.type, text: trend.value };
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label, value, icon, variant = 'teal', trend, periodText, polarity = 'higher-is-better', loading = false, onClick,
}) => {
  const colors = variantColors[variant] || variantColors.teal;
  const hasTrend = trend !== undefined && trend !== null;
  const t = hasTrend ? resolveTrend(trend) : null;

  const style = {
    '--kpi-ac': colors.accent,
    '--kpi-ibg': colors.bg,
    '--kpi-ic': colors.accent,
    cursor: onClick ? 'pointer' : 'default',
    userSelect: 'none',
    padding: '16px',
  } as React.CSSProperties;

  const trendClass =
    !t ? ''
    : t.type === 'neutral' ? 't-nl'
    : polarity === 'lower-is-better' ? (t.type === 'down' ? 't-up' : 't-dn')
    : (t.type === 'up' ? 't-up' : 't-dn');
  const trendIcon = !t ? '' : t.type === 'up' ? '↑' : t.type === 'down' ? '↓' : '•';

  if (loading) {
    return (
      <div className="kpi" style={{ ...style, pointerEvents: 'none' }}>
        <div className="kpi-top">
          <div className="kpi-shimmer-bg" style={{ width: '55%', height: '12px' }} />
          <div className="kpi-shimmer-bg kpi-skeleton-circle" style={{ width: '32px', height: '32px' }} />
        </div>
        <div className="kpi-shimmer-bg" style={{ width: '75%', height: '28px', margin: '6px 0 12px 0' }} />
      </div>
    );
  }

  return (
    <div
      className={`kpi kpi-anim-wrapper ${onClick ? 'kpi-clickable' : ''}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', height: '100%' }}>
        {icon && (
          <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--kpi-ibg)', color: 'var(--kpi-ic)' }}>
            <i className={`ti ${icon}`} style={{ fontSize: '1.25rem' }} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span className="kpi-label" style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block', lineHeight: 1.2, textTransform: 'uppercase' }}>{label}</span>
          <div className="kpi-val" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px', lineHeight: 1 }}>{value}</div>
          {(hasTrend || Boolean(periodText)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: 'auto' }}>
              {hasTrend && t && (
                <div className={`kpi-trend ${trendClass}`} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600, fontSize: '0.7rem' }}>
                  <span>{trendIcon} {t.text}</span>
                </div>
              )}
              {periodText && (
                <span className="kpi-period" style={{ fontSize: '0.65rem', color: '#94A3B8', whiteSpace: 'nowrap' }}>{periodText}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KpiCard;
