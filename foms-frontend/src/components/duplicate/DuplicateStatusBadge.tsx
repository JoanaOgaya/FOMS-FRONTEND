import React from 'react';
import type { DuplicateWorkflowStatus } from '../../utils/duplicateStatusMap';

interface Props {
  status: DuplicateWorkflowStatus;
  className?: string;
}

export const DuplicateStatusBadge: React.FC<Props> = ({ status, className = '' }) => {
  const configMap: Record<
    DuplicateWorkflowStatus,
    { label: string; bg: string; color: string; border: string; icon: string }
  > = {
    PENDING_SCAN: {
      label: 'Pending Scan',
      bg: '#F1F5F9',
      color: '#475569',
      border: '#CBD5E1',
      icon: 'ti-clock',
    },
    SCANNED: {
      label: 'Scanned',
      bg: '#F0FDFA',
      color: '#0F766E',
      border: '#99F6E4',
      icon: 'ti-scan',
    },
    UNDER_MANUAL_REVIEW: {
      label: 'Under Manual Review',
      bg: '#FEF3C7',
      color: '#92400E',
      border: '#FDE68A',
      icon: 'ti-user-check',
    },
    RETURNED: {
      label: 'Returned',
      bg: '#FFF7ED',
      color: '#C2410C',
      border: '#FFEDD5',
      icon: 'ti-rotate-2',
    },
    UNIQUE: {
      label: 'Unique Document',
      bg: '#ECFDF5',
      color: '#047857',
      border: '#A7F3D0',
      icon: 'ti-circle-check',
    },
    FLAGGED: {
      label: 'Flagged (Duplicate)',
      bg: '#FEF2F2',
      color: '#B91C1C',
      border: '#FECACA',
      icon: 'ti-alert-octagon',
    },
  };

  const current = configMap[status] || configMap.PENDING_SCAN;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${className}`}
      style={{
        backgroundColor: current.bg,
        color: current.color,
        border: `1px solid ${current.border}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 700,
      }}
      role="status"
      aria-label={`Status: ${current.label}`}
    >
      <i className={`ti ${current.icon}`} style={{ fontSize: '13px' }} aria-hidden="true" />
      {current.label}
    </span>
  );
};
