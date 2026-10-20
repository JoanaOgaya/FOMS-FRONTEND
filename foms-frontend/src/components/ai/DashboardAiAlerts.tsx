import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useDashboardAiAlerts } from '../../hooks/useDashboardAiAlerts';
import { AiAlertCard } from './AiAlertCard';
import { AiErrorBoundary } from './ErrorBoundary';

interface DashboardAiAlertsInnerProps {
  limit?: number;
}

const DashboardAiAlertsInner: React.FC<DashboardAiAlertsInnerProps> = ({ limit = 3 }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { alerts, isLoading, error, refetch } = useDashboardAiAlerts(user?.role);

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-sparkles" style={{ color: '#0D9488', fontSize: 18 }} />
          <h3
            style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-0.01em',
            }}
          >
            AI Financial Insights &amp; Intelligence
          </h3>
        </div>

        <button
          type="button"
          onClick={() => navigate('/ai-history')}
          style={{
            background: 'none',
            border: 'none',
            color: '#0D9488',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          View all <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
        </button>
      </div>

      {isLoading ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 16,
            border: '1px solid #E2E8F0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#E2E8F0' }} />
            <div style={{ width: 140, height: 14, background: '#E2E8F0', borderRadius: 4 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: '100%', height: 48, background: '#F8FAFC', borderRadius: 8 }} />
          </div>
        </div>
      ) : error ? (
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="ti ti-alert-triangle" style={{ color: '#DC2626', fontSize: 20 }} />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#991B1B' }}>
                Failed to load AI alerts
              </div>
              <div style={{ fontSize: '0.8rem', color: '#B91C1C' }}>
                {error.message || 'Service unavailable'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            style={{
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : alerts.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: '24px 20px',
            border: '1px dashed #CBD5E1',
            textAlign: 'center',
            color: '#64748B',
            fontSize: '0.88rem',
            fontWeight: 500,
          }}
        >
          No alerts
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.slice(0, limit).map((alert) => (
            <AiAlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
};

export const DashboardAiAlerts: React.FC<DashboardAiAlertsInnerProps> = (props) => (
  <AiErrorBoundary moduleName="Dashboard AI Intelligence">
    <DashboardAiAlertsInner {...props} />
  </AiErrorBoundary>
);

export default DashboardAiAlerts;
