import React from 'react';
import type { ApprovalStep } from '../../types/approvals';
import { formatDateTime } from '../../utils/format';
import { StatusBadge } from '../shared/StatusBadge';

export interface ApprovalHistoryTimelineProps {
  history: ApprovalStep[];
  isLoading?: boolean;
  requestedBy?: string;
  requestedById?: string;
}

export const ApprovalHistoryTimeline: React.FC<ApprovalHistoryTimelineProps> = ({
  history,
  isLoading = false,
  requestedBy,
  requestedById,
}) => {
  if (isLoading) {
    return (
      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[1, 2].map((i) => (
          <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#E2E8F0', animation: 'pulse 1.5s infinite' }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: '40%', height: '14px', background: '#E2E8F0', borderRadius: '4px', marginBottom: '6px' }} />
              <div style={{ width: '60%', height: '12px', background: '#F1F5F9', borderRadius: '4px' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
        <i className="ti ti-history" style={{ fontSize: '20px', display: 'block', marginBottom: '6px' }} />
        No approval history recorded yet.
      </div>
    );
  }

  // Ensure chronological order (earliest to latest)
  const sortedHistory = [...history].sort((a, b) => {
    const timeA = new Date(a.actedAt).getTime();
    const timeB = new Date(b.actedAt).getTime();
    return timeA - timeB;
  });

  const formatActor = (step: ApprovalStep): string => {
    const isEscalation = step.action?.toLowerCase().includes('escalat');
    // Steps created by automatic escalation must be shown as "System"
    // Never label an escalation as performed by the requester
    if (isEscalation) {
      if (
        !step.approverName ||
        step.approverName.toLowerCase() === 'system' ||
        (requestedBy && step.approverName === requestedBy) ||
        (requestedById && step.approverName === requestedById)
      ) {
        return 'System';
      }
    }

    const name = step.actorName || step.approverName || step.actorUserId;
    const role = step.actorRole || step.role;

    if (name && role) {
      return `${name} · ${role}`;
    }

    return name || 'System';
  };

  const formatLevel = (level?: string | number, role?: string): string | null => {
    if (!level) return null;
    const lvlStr = String(level).trim();
    if (lvlStr === 'Level 1' || lvlStr === '1') {
      return 'Level 1 · Asst. Finance Manager';
    }
    if (lvlStr === 'Level 2' || lvlStr === '2') {
      return 'Level 2 · Finance Manager';
    }
    if (role) {
      return `${lvlStr} · ${role}`;
    }
    return lvlStr;
  };

  return (
    <div style={{ position: 'relative', padding: '8px 0 8px 12px' }} role="list" aria-label="Approval History Timeline">
      {/* Vertical connection line */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          bottom: '20px',
          left: '23px',
          width: '2px',
          background: '#E2E8F0',
          zIndex: 0,
        }}
        aria-hidden="true"
      />

      {sortedHistory.map((step, idx) => {
        const actorLabel = formatActor(step);
        const levelLabel = formatLevel(step.level, step.actorRole || step.role);

        return (
          <div
            key={`${step.actedAt}-${idx}`}
            role="listitem"
            style={{
              position: 'relative',
              display: 'flex',
              gap: '14px',
              marginBottom: idx === sortedHistory.length - 1 ? 0 : '20px',
              zIndex: 1,
            }}
          >
            {/* Step Icon circle */}
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: '#FFFFFF',
                border: '2px solid #3B82F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 0 0 2px #EFF6FF',
                color: '#3B82F6',
                fontSize: '11px',
                fontWeight: 700,
              }}
              aria-hidden="true"
            >
              {idx + 1}
            </div>

            {/* Step content */}
            <div
              style={{
                flex: 1,
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '10px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#1E293B' }}>
                    {actorLabel}
                  </span>
                  {levelLabel && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#475569',
                        background: '#F1F5F9',
                        border: '1px solid #E2E8F0',
                        padding: '1px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                      }}
                    >
                      {levelLabel}
                    </span>
                  )}
                </div>
                <StatusBadge status={step.action} />
              </div>

              <div style={{ fontSize: '11px', color: '#64748B', marginBottom: step.remarks ? '6px' : 0 }}>
                {formatDateTime(step.actedAt)}
              </div>

              {step.remarks && (
                <div
                  style={{
                    marginTop: '6px',
                    padding: '6px 10px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#334155',
                    fontStyle: 'italic',
                    lineHeight: '1.4',
                  }}
                >
                  &ldquo;{step.remarks}&rdquo;
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
