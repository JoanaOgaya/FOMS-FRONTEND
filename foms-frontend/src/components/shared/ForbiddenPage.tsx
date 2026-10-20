import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../Buttons';
import { useAuth } from '../../context/AuthContext';
import { LANDING_PATH } from '../../utils/roleAccess';

/** 403 page — shown for forbidden URLs and for API 403 responses. */
export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div style={{ padding: '64px 16px', textAlign: 'center', color: '#64748B' }} role="alert">
      <i className="ti ti-lock" style={{ fontSize: '3rem', display: 'block', marginBottom: 12 }} />
      <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 800, color: '#0F172A' }}>403 — Access denied</h2>
      <p style={{ margin: '0 0 20px', fontSize: '0.95rem' }}>Your role does not have permission to view this page.</p>
      {user && <Button title="Go to my dashboard" onClick={() => navigate(LANDING_PATH[user.role], { replace: true })} />}
    </div>
  );
};

export default ForbiddenPage;
