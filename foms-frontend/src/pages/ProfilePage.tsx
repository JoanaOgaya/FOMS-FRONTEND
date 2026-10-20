import React, { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { useQuery } from '../hooks/useQuery';
import { auditLogsService } from '../services/auditLogsService';
import type { AuditLog } from '../types/entities';
import { formatRelative } from '../utils/format';

const ROLE_LABEL_MAP: Record<string, string> = {
  FINANCIAL_MANAGER: 'Financial Manager',
  HEAD_ACCOUNTANT: 'Head Accountant',
  ACCOUNTANT: 'Accountant',
  ASSISTANT_FM: 'Assistant Financial Manager',
};
const getRoleLabel = (r?: string) => (r && ROLE_LABEL_MAP[r]) || r || 'User';

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { data: auditData } = useQuery(
    `profile:audit:${user?.employeeId}`,
    () => auditLogsService.list({ pageSize: 50 }),
    { enabled: !!user }
  );

  const loginHistoryFeed = useMemo(() => {
    if (!user) return [];
    const logs = auditData?.items || [];
    const loginLogs = logs.filter((log: AuditLog) => log.userId === user.employeeId && log.action === 'USER_LOGIN');

    return loginLogs.map((log: AuditLog, idx: number) => ({
      id: log.id,
      timeAgo: idx === 0 ? 'Just now' : formatRelative(log.timestamp),
      deviceInfo: log.ipAddress ? `IP: ${log.ipAddress}` : 'Web Session',
      isCurrent: idx === 0,
    }));
  }, [user, auditData]);

  if (!user) return null;

  const email = user.email || `${user.fullName.toLowerCase().replace(/\s+/g, '.')}@foms.global`;
  const initials = user.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Card: User Info */}
      <Card noPadding>
        <div style={{ padding: '24px 32px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#0D9488', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
            {initials}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>{user.fullName}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FAF5FF', color: '#9333EA', padding: '4px 10px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 600, width: 'fit-content' }}>
              <i className="ti ti-check" style={{ fontSize: '0.85rem' }} />
              {getRoleLabel(user.role)}
            </div>
          </div>
        </div>
        <div style={{ padding: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FULL LEGAL NAME</p>
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#0F172A', fontWeight: 500 }}>{user.fullName}</p>
              </div>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ASSIGNED ROLE</p>
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#0F172A', fontWeight: 500 }}>{getRoleLabel(user.role)}</p>
              </div>
            </div>
            <div>
              <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EMAIL ADDRESS</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti ti-mail" style={{ color: '#94A3B8', fontSize: '1.1rem' }} />
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#0F172A', fontWeight: 500 }}>{email}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Bottom Card: Login History */}
      <Card noPadding>
        <div style={{ padding: '24px 32px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-history" style={{ fontSize: '1.1rem' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Recent Login History</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 500 }}>Last 30 days</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loginHistoryFeed.length === 0 ? (
            <p style={{ color: '#94A3B8', fontSize: '0.875rem', textAlign: 'center', padding: '24px 0' }}>No recent login history.</p>
          ) : (
            loginHistoryFeed.map((log, idx) => (
              <div key={log.id} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '16px 32px', borderBottom: idx < loginHistoryFeed.length - 1 ? '1px solid #F1F5F9' : 'none', background: '#FFF' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: log.isCurrent ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
                <i className="ti ti-device-desktop" style={{ color: '#94A3B8', fontSize: '1.1rem' }} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>{log.timeAgo} · </span>
                  <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>{log.deviceInfo}</span>
                </div>
                {log.isCurrent && (
                  <div style={{ background: '#F0FDF4', color: '#10B981', padding: '2px 8px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Current
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

export default ProfilePage;
