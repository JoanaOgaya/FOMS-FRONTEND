import React, { useState } from 'react';
import type { RiskLevel, RiskScoreResult } from '../../types/ai';
import { RiskConfigModal } from './RiskConfigModal';
import { AiDisclaimer } from './AiDisclaimer';

export interface RiskBadgeProps {
  score?: number | null;
  level?: RiskLevel | string | null;
  result?: RiskScoreResult | null;
  size?: 'sm' | 'md' | 'lg';
  showDetailsOnClick?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  score,
  level,
  result,
  size = 'md',
  showDetailsOnClick = true,
}) => {
  const [showDrawer, setShowDrawer] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Normalize inputs (result prop takes precedence if provided)
  const actualScore = result?.riskScore !== undefined ? result.riskScore : score;
  const rawLevel = (result?.riskLevel || level || '').toString().toUpperCase();

  const isLow = rawLevel === 'LOW' || rawLevel.includes('LOW');
  const isMed = rawLevel === 'MEDIUM' || rawLevel.includes('MED');
  const isHigh = rawLevel === 'HIGH' || rawLevel.includes('HIGH') || rawLevel.includes('CRITICAL');

  const normalizedLevel = isHigh ? 'High' : isMed ? 'Medium' : isLow ? 'Low' : 'N/A';

  const badgeColor = isHigh ? '#DC2626' : isMed ? '#D97706' : isLow ? '#16A34A' : '#64748B';
  const badgeBg = isHigh ? '#FEF2F2' : isMed ? '#FFFBEB' : isLow ? '#F0FDF4' : '#F1F5F9';
  const borderColor = isHigh ? '#FECACA' : isMed ? '#FDE68A' : isLow ? '#BBF7D0' : '#E2E8F0';

  const displayScore = actualScore !== null && actualScore !== undefined ? `${actualScore}` : 'N/A';
  const displayText = normalizedLevel === 'N/A' && displayScore === 'N/A' ? 'N/A' : `${normalizedLevel} — ${displayScore}`;

  const padding = size === 'sm' ? '2px 8px' : size === 'lg' ? '6px 14px' : '4px 10px';
  const fontSize = size === 'sm' ? '0.72rem' : size === 'lg' ? '0.875rem' : '0.78rem';

  return (
    <>
      <span
        onClick={() => {
          if (showDetailsOnClick) setShowDrawer(true);
        }}
        role={showDetailsOnClick ? 'button' : undefined}
        tabIndex={showDetailsOnClick ? 0 : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding,
          borderRadius: 20,
          fontSize,
          fontWeight: 700,
          background: badgeBg,
          color: badgeColor,
          border: `1px solid ${borderColor}`,
          cursor: showDetailsOnClick ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
          userSelect: 'none',
        }}
        title={showDetailsOnClick ? `Risk: ${displayText}. Click for breakdown.` : `Risk: ${displayText}`}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: badgeColor,
          }}
        />
        {displayText}
        {showDetailsOnClick && (
          <i className="ti ti-info-circle" style={{ fontSize: '0.85em', opacity: 0.8 }} />
        )}
      </span>

      {/* "Why is this High / Medium / Low?" Details Panel */}
      {showDrawer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 9998,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setShowDrawer(false)}
        >
          <div
            style={{
              background: '#fff',
              width: '100%',
              maxWidth: 460,
              height: '100%',
              boxShadow: '-4px 0 25px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '20px 24px',
                borderBottom: '1px solid #E2E8F0',
                background: '#F8FAFC',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                    Why is this {normalizedLevel}?
                  </h3>
                  <span
                    style={{
                      background: badgeBg,
                      color: badgeColor,
                      border: `1px solid ${borderColor}`,
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      fontWeight: 800,
                    }}
                  >
                    Score: {displayScore}
                  </span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <AiDisclaimer />
                </div>
              </div>
              <button
                onClick={() => setShowDrawer(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, color: '#64748B', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            {/* Factors List */}
            <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  Risk Contributing Factors
                </div>
                {result?.factors && result.factors.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {result.factors.map((f, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 8,
                          border: '1px solid #E2E8F0',
                          background: '#fff',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>
                            {f.name}
                          </span>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: f.points > 0 ? '#DC2626' : '#16A34A',
                              background: f.points > 0 ? '#FEF2F2' : '#F0FDF4',
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {f.points > 0 ? `+${f.points} pts` : `${f.points} pts`}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                          Input Value: <strong>{f.inputValue}</strong>
                        </div>
                        {f.description && (
                          <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontStyle: 'italic' }}>
                            {f.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '24px 16px', textAlign: 'center', background: '#F8FAFC', borderRadius: 8, color: '#64748B', fontSize: '0.85rem' }}>
                    <i className="ti ti-shield-check" style={{ fontSize: 24, display: 'block', marginBottom: 6, color: '#0D9488' }} />
                    No individual risk factor penalties assigned by scoring model.
                  </div>
                )}
              </div>

              {/* Formula & Computation Metadata */}
              <div
                style={{
                  background: '#F8FAFC',
                  borderRadius: 10,
                  padding: '14px 16px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Formula Version:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{result?.formulaVersion || 'v1.0 (Production)'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Computed At:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>
                    {result?.computedAt ? new Date(result.computedAt).toLocaleString('en-PH') : 'Recent'}
                  </span>
                </div>
                {result?.paymentLabel && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Payment Classification:</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{result.paymentLabel}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowConfigModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0D9488',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className="ti ti-settings" />
                  View Formula &amp; Scoring Thresholds
                </button>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowDrawer(false)}
                style={{
                  padding: '8px 18px',
                  background: '#0F172A',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Config Modal */}
      <RiskConfigModal isOpen={showConfigModal} onClose={() => setShowConfigModal(false)} />
    </>
  );
};

export default RiskBadge;
