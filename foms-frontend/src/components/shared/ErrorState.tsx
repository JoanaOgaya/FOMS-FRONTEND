import React from 'react';
import Button from '../Buttons';
import { ApiError } from '../../services/apiClient';
import { ForbiddenPage } from './ForbiddenPage';

export interface ErrorStateProps {
  error: Error;
  onRetry?: () => void;
}

/** Error with retry; a 403 from the API renders the forbidden page instead. */
export const ErrorState: React.FC<ErrorStateProps> = ({ error, onRetry }) => {
  if (error instanceof ApiError && error.isForbidden) return <ForbiddenPage />;
  const message = typeof error === 'string' ? error : (error as Error)?.message || 'An error occurred';
  return (
    <div style={{ padding: '40px 16px', textAlign: 'center', color: '#B91C1C' }} role="alert">
      <i className="ti ti-alert-circle" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }} />
      <p style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 600 }}>{message}</p>
      {onRetry && <Button title="Retry" variant="secondary" size="sm" icon="ti-refresh" onClick={onRetry} />}
    </div>
  );
};

export default ErrorState;
