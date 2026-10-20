import React, { useEffect, useState } from 'react';
import { riskService } from '../../services/ai/risk.service';
import type { RiskConfig } from '../../types/ai';

export interface RiskConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RiskConfigModal: React.FC<RiskConfigModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<RiskConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    riskService
      .getConfig()
      .then(setConfig)
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          maxWidth: 540,
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '8px',
                background: '#F0FDFA',
                border: '1px solid #CCFBF1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0D9488',
              }}
            >
              <i className="ti ti-calculator" style={{ fontSize: 18 }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                How is Risk Scored?
              </h3>
              <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                Backend Risk Formula &amp; Scoring Bands (Read-Only)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 20 }}
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8' }}>
              <i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite', fontSize: 24 }} />
              <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>Loading scoring formula...</p>
            </div>
          ) : (
            <>
              <div
                style={{
                  background: '#F8FAFC',
                  borderRadius: 10,
                  padding: '14px 16px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  color: '#334155',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                  Formula Engine: {config?.formulaVersion || 'v1.0'}
                </div>
                {config?.description ||
                  'The risk score is computed by the backend model using historical payment timeliness, aging bracket, outstanding balance magnitude, and dispute history. Risk thresholds are managed centrally in server configuration.'}
              </div>

              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.82rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Risk Classification Bands
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {config?.bands.map((band) => (
                    <div
                      key={band.level}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: band.badgeBg || '#F8FAFC',
                        border: `1px solid ${band.color ? band.color + '40' : '#E2E8F0'}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            color: band.color || '#0F172A',
                            minWidth: 70,
                          }}
                        >
                          {band.level}
                        </span>
                        <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                          {band.description || `${band.level} Risk Profile`}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: band.color || '#0F172A',
                          background: '#fff',
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        {band.min} – {band.max} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  fontSize: '0.78rem',
                  color: '#64748B',
                  background: '#F0FDFA',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #CCFBF1',
                  lineHeight: 1.4,
                }}
              >
                <i className="ti ti-info-circle" style={{ marginRight: 6, color: '#0D9488' }} />
                <em>Note:</em> Threshold bands and factor weights are controlled via backend environment configuration and cannot be modified from the frontend UI.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
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
  );
};

export default RiskConfigModal;
