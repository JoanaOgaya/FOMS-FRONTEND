import React from 'react';

export interface AiDisclaimerProps {
  style?: React.CSSProperties;
  className?: string;
  inline?: boolean;
}

/**
 * Standardized disclaimer tag required per FR-018 / NFR-023:
 * "AI suggestion, requires validation"
 */
export const AiDisclaimer: React.FC<AiDisclaimerProps> = ({ style, className }) => (
  <span
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '0.72rem',
      fontWeight: 600,
      background: '#F1F5F9',
      color: '#475569',
      border: '1px solid #E2E8F0',
      letterSpacing: '0.02em',
      ...style,
    }}
    title="Official action required: AI outputs serve as decision support only."
  >
    <i className="ti ti-sparkles" style={{ fontSize: '0.75rem', color: '#0D9488' }} />
    AI suggestion, requires validation
  </span>
);

export default AiDisclaimer;
