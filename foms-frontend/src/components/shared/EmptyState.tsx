import React from 'react';

export interface EmptyStateProps {
  message?: string;
  icon?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message = 'No records yet', icon = 'ti-inbox' }) => (
  <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8' }}>
    <i className={`ti ${icon}`} style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }} />
    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{message}</p>
  </div>
);

export default EmptyState;
