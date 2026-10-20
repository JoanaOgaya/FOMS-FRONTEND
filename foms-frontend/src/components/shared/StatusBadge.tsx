import React from 'react';
import './StatusBadge.css';
import { statusIcon, statusTone } from '../../utils/status';
import { statusLabel } from '../../utils/workflow';

export interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

/** The only status badge. Tone and workflow label come from utils/status + utils/workflow. */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  if (status === null || status === undefined || status === '') return null;
  const tone = statusTone(status);
  return (
    <span className={`badge badge-${tone} ${className}`}>
      <i className={statusIcon(tone)} style={{ fontSize: '14px', strokeWidth: '2.5px' }} />
      {statusLabel(status)}
    </span>
  );
};

export default StatusBadge;
