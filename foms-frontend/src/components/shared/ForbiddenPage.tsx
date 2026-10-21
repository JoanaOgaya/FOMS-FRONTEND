import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_LANDING_ROUTE, LANDING_PATH } from '../../utils/roleAccess';

/** 
 * Silent redirect replacement for ForbiddenPage.
 * Per specification: Do not show a 403 Access denied screen anywhere.
 */
export const ForbiddenPage: React.FC = () => {
  const { user } = useAuth();
  return <Navigate to={user ? LANDING_PATH[user.role] || DEFAULT_LANDING_ROUTE : '/login'} replace />;
};

export default ForbiddenPage;
