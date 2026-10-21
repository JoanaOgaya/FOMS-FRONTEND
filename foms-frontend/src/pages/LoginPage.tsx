/**
 * LoginPage — Authenticates via authService.login.
 * Allowed in code: static UI marketing text and layout only.
 */

import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, User, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { getCentralLoginUrl, getCentralForgotPasswordUrl } from '../services/centralAuth';
import { LANDING_PATH } from '../utils/roleAccess';
import './LoginPage.css';

interface FormErrors {
  employeeId?: string;
  password?: string;
}

const FEATURE_HIGHLIGHTS = [
  {
    step: 1,
    title: 'Enter Credentials',
    description: 'Use your assigned Employee ID and password to access the secure portal.'
  },
  {
    step: 2,
    title: 'Manage Receivables',
    description: 'Create invoices, track customer accounts, and monitor outstanding balances.'
  },
  {
    step: 3,
    title: 'Track Collections',
    description: 'Review real-time collection aging analytics, duplicates, and AI predictions.'
  }
];

export function LoginPage() {
  const { user, login, isLoading } = useAuth();
  const location = useLocation();
  const { triggerToast } = useToast();

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  if (user) {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const isLogoutAction = params.get('action') === 'logout';
    const wasLoggedOut = typeof window !== 'undefined' && sessionStorage.getItem('loggedOut') === 'true';
    if (!isLogoutAction && !wasLoggedOut) {
      const state = location.state as { from?: string } | null;
      const requestedFrom = state?.from && state.from !== '/login' && state.from !== '/'
        ? state.from
        : (LANDING_PATH[user.role] ?? '/dashboard');
      return <Navigate to={requestedFrom} replace />;
    }
  }

  const EMP_ID_REGEX = /^EMP-\d{3}$/i;

  const validateForm = (): FormErrors => {
    const errors: FormErrors = {};
    const trimmedEmpId = employeeId.trim();

    if (!trimmedEmpId) {
      errors.employeeId = 'Employee ID is required.';
    } else if (trimmedEmpId.length > 10) {
      errors.employeeId = 'Employee ID cannot exceed 10 characters.';
    } else if (!EMP_ID_REGEX.test(trimmedEmpId)) {
      errors.employeeId = 'Employee ID must follow pattern EMP-### (e.g., EMP-001).';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length > 100) {
      errors.password = 'Password cannot exceed 100 characters.';
    }

    return errors;
  };

  const isFormValid = EMP_ID_REGEX.test(employeeId.trim()) && password.trim().length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const result = await login({ employeeId: employeeId.trim().toUpperCase(), password });
    if (!result.success && result.error) {
      setGlobalError(result.error);
      triggerToast('error', 'Login Failed', result.error);
    } else if (result.success) {
      triggerToast('success', 'Authentication Successful', 'Welcome back!', undefined, undefined, 4);
    }
  };

  return (
    <div className="login-shell">
      {/* ── LEFT PANEL ── */}
      <aside className="login-left">
        <div className="login-logo-area">
          <img
            src="/logo.png"
            alt="Speedex Courier & Forwarder, Inc."
            className="login-logo-img"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="login-logo-tagline">Finance Operations Management System</span>
        </div>

        <div className="login-features">
          {FEATURE_HIGHLIGHTS.map((feature) => (
            <div key={feature.step} className="login-feature-item">
              <div className="login-feature-step">{feature.step}</div>
              <div className="login-feature-text">
                <div className="login-feature-title">{feature.title}</div>
                <div className="login-feature-desc">{feature.description}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── RIGHT PANEL ── */}
      <main className="login-right">
        <div className="login-card">
          <p className="login-card-label">Secure Access</p>
          <h1 className="login-card-title">
            Login to Finance Operations Management System (FOMS)
          </h1>
          <p className="login-card-subtitle">Enter your credentials below to continue.</p>
          <div className="login-card-divider" />

          {globalError && (
            <div className="login-global-error" role="alert" style={{ marginBottom: '16px' }}>
              <AlertCircle size={16} />
              <span>{globalError}</span>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="foms-employee-id" className="login-label">
                Employee ID
              </label>
              <div className={`login-input-wrap ${fieldErrors.employeeId ? 'has-error' : ''}`}>
                <span className="login-input-icon">
                  <User size={16} />
                </span>
                <input
                  id="foms-employee-id"
                  type="text"
                  maxLength={10}
                  className="login-input"
                  placeholder="Enter Employee ID (e.g. EMP-001)"
                  value={employeeId}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setEmployeeId(val);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.employeeId;
                      return next;
                    });
                    setGlobalError(null);
                  }}
                  onBlur={() => {
                    const trimmed = employeeId.trim();
                    if (!trimmed) {
                      setFieldErrors(prev => ({ ...prev, employeeId: 'Employee ID is required.' }));
                    } else if (!EMP_ID_REGEX.test(trimmed)) {
                      setFieldErrors(prev => ({ ...prev, employeeId: 'Employee ID must follow pattern EMP-### (e.g., EMP-001).' }));
                    }
                  }}
                  autoComplete="username"
                  autoFocus
                  aria-invalid={!!fieldErrors.employeeId}
                />
              </div>
              {fieldErrors.employeeId && (
                <span className="login-field-error" role="alert">
                  <AlertCircle size={13} />
                  {fieldErrors.employeeId}
                </span>
              )}
            </div>

            <div className="login-field">
              <label htmlFor="foms-password" className="login-label">
                Password
              </label>
              <div className={`login-input-wrap ${fieldErrors.password ? 'has-error' : ''}`}>
                <span className="login-input-icon">
                  <Lock size={16} />
                </span>
                <input
                  id="foms-password"
                  type={showPassword ? 'text' : 'password'}
                  maxLength={100}
                  className="login-input"
                  placeholder="Enter Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.password;
                      return next;
                    });
                    setGlobalError(null);
                  }}
                  onBlur={() => {
                    if (!password) {
                      setFieldErrors(prev => ({ ...prev, password: 'Password is required.' }));
                    }
                  }}
                  autoComplete="current-password"
                  aria-invalid={!!fieldErrors.password}
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && (
                <span className="login-field-error" role="alert">
                  <AlertCircle size={13} />
                  {fieldErrors.password}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <a
                href={getCentralForgotPasswordUrl()}
                className="login-forgot-link"
                style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}
              >
                Forgot Password?
              </a>
            </div>

            <button
              type="submit"
              className="login-btn"
              disabled={isLoading || !isFormValid}
              style={{
                opacity: (!isFormValid || isLoading) ? 0.6 : 1,
                cursor: (!isFormValid || isLoading) ? 'not-allowed' : 'pointer'
              }}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                'Sign In to FOMS'
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <a
                href={getCentralLoginUrl()}
                style={{
                  fontSize: '13px',
                  color: '#0D9488',
                  textDecoration: 'none',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Sign in via Speedex One-Login Portal →
              </a>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
