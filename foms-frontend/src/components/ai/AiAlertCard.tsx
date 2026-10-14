import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AiDisclaimer } from './AiDisclaimer';
import { useAuth } from '../../context/AuthContext';
import { canAccessPath } from '../../utils/roleAccess';
import type { DashboardAiAlert } from '../../types/ai';

export interface AiAlertCardProps {
  alert?: DashboardAiAlert;
  id?: string;
  type?: 'duplicate' | 'risk' | 'collection' | 'document' | 'liquidation' | string;
  title?: string;
  message?: string;
  score?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  targetRoute?: string;
  actionLabel?: string;
  timestamp?: string;
  style?: React.CSSProperties;
}

export const AiAlertCard: React.FC<AiAlertCardProps> = (props) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const alertType = props.alert?.type ?? props.type ?? '';
  const title = props.alert?.title ?? props.title ?? '';
  const message = props.alert?.message ?? props.message ?? '';
  const score = props.alert?.score ?? props.score;
  const severity = props.alert?.severity ?? props.severity ?? 'medium';
  const actionLabel = props.actionLabel ?? 'Review in Workflow →';
  const timestamp = props.alert?.createdAt ?? props.timestamp;
  const style = props.style;

  // Resolve target route by alert type (A3)
  let rawRoute = props.alert?.targetRoute ?? props.targetRoute;
  if (!rawRoute) {
    if (alertType === 'duplicate') {
      rawRoute = '/flagged-duplicates';
    } else if (alertType === 'risk' || alertType === 'collection') {
      rawRoute = props.alert?.entityId ? `/accounts-receivable?invoice=${encodeURIComponent(props.alert.entityId)}` : '/accounts-receivable';
    } else if (alertType === 'ocr' || alertType === 'document') {
      rawRoute = '/duplicate-scan';
    }
  } else {
    // If route was duplicate-scan or not accessible, adapt or verify
    if (alertType === 'duplicate' && rawRoute.includes('/duplicate-scan') && !canAccessPath(user?.role, '/duplicate-scan')) {
      rawRoute = '/flagged-duplicates';
    }
  }

  // Check if role has access to the target route (A3 & A4)
  const routeBase = rawRoute ? rawRoute.split('?')[0] : '';
  const isAllowed = Boolean(routeBase && canAccessPath(user?.role, routeBase));
  const targetRoute = isAllowed ? rawRoute : undefined;

  const isCritical = severity === 'critical' || severity === 'high';
  const isMed = severity === 'medium';

  const iconColor = isCritical ? '#DC2626' : isMed ? '#D97706' : '#0D9488';
  const iconBg = isCritical ? '#FEF2F2' : isMed ? '#FFFBEB' : '#F0FDFA';
  const borderColor = isCritical ? '#FECACA' : isMed ? '#FDE68A' : '#CCFBF1';

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              background: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: iconColor,
              flexShrink: 0,
            }}
          >
            <i
              className={
                isCritical ? 'ti ti-alert-triangle' : isMed ? 'ti ti-alert-circle' : 'ti ti-sparkles'
              }
              style={{ fontSize: 18 }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0F172A' }}>
                {title}
              </h4>
              {score !== undefined && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: iconColor,
                    background: iconBg,
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  Score: {score}%
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
        </div>

        <AiDisclaimer />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F1F5F9', paddingTop: 10, fontSize: '0.8rem' }}>
        <span style={{ color: '#94A3B8' }}>
          {timestamp ? new Date(timestamp).toLocaleDateString('en-PH') : 'Active intelligence signal'}
        </span>
        {targetRoute && (
          <button
            type="button"
            onClick={() => navigate(targetRoute)}
            style={{
              background: 'none',
              border: 'none',
              color: '#0D9488',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default AiAlertCard;
