import React from 'react';

export interface PriorityBadgeProps {
  level: string;
  rank?: number;
  score?: number;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ level, rank, score }) => {
  const p = (level || '').toUpperCase();
  const isHigh = p.includes('HIGH') || p.includes('CRITICAL');
  const isMed = p.includes('MEDIUM') || p.includes('MODERATE');
  
  const badgeColor = isHigh ? '#DC2626' : isMed ? '#D97706' : '#16A34A';
  const badgeBg = isHigh ? '#FEF2F2' : isMed ? '#FFFBEB' : '#F0FDF4';
  const borderColor = isHigh ? '#FECACA' : isMed ? '#FDE68A' : '#BBF7D0';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: '0.78rem',
        fontWeight: 700,
        background: badgeBg,
        color: badgeColor,
        border: `1px solid ${borderColor}`,
        whiteSpace: 'nowrap',
      }}
    >
      {rank !== undefined && (
        <span
          style={{
            background: badgeColor,
            color: '#fff',
            borderRadius: '50%',
            width: 16,
            height: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.65rem',
          }}
        >
          {rank}
        </span>
      )}
      <span>{level || 'Normal Priority'}</span>
      {score !== undefined && (
        <span style={{ opacity: 0.85, fontWeight: 800 }}>({score} pts)</span>
      )}
    </span>
  );
};

export default PriorityBadge;
