import React, { useState } from 'react';
import { Eye, EyeOff, User, Lock, AlertCircle, Mail, Phone } from 'lucide-react';
import { useClientContext } from '../context/ClientContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import './Login.css';

interface FormErrors {
  clientId?: string;
  password?: string;
}

interface CreateAccountErrors {
  clientId?: string;
  companyName?: string;
  email?: string;
  name?: string;
  contact?: string;
}

export const Login: React.FC = () => {
  const { login, createAccount, changePassword } = useClientContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [clientId, setClientId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Modals state
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Create Account State
  const [newClientId, setNewClientId] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [createErrors, setCreateErrors] = useState<CreateAccountErrors>({});
  const [createError, setCreateError] = useState<string | null>(null);

  // Change Password State
  const [changePasswordVal, setChangePasswordVal] = useState('');
  const [showChangePasswordVal, setShowChangePasswordVal] = useState(false);

  // Validation helpers
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isValidPhone = (phone: string) => /^(\+63|0)9\d{9}$/.test(phone.trim().replace(/[\s-]/g, ''));
  const isValidClientId = (id: string) => /^[a-zA-Z0-9_-]{3,20}$/.test(id.trim());

  // Form validity computations
  const isLoginFormValid = clientId.trim().length >= 3 && password.length >= 6;

  const isCreateFormValid = 
    newClientId.trim().length >= 3 &&
    isValidClientId(newClientId) &&
    newCompany.trim().length >= 2 &&
    newCompany.trim().length <= 200 &&
    isValidEmail(newEmail) &&
    newName.trim().length >= 2 &&
    isValidPhone(newContact);

  const FEATURE_HIGHLIGHTS = [
    { step: '1', title: 'Secure Payment Gateway', description: 'Experience fast, reliable, and secure transactions powered by PayMongo.' },
    { step: '2', title: 'Real-time Tracking', description: 'Monitor your invoices and see immediate updates on payment statuses.' },
    { step: '3', title: 'Seamless Records', description: 'Access a complete history of all your past payments and official receipts.' },
  ];

  const validateLoginFields = (): boolean => {
    const errors: FormErrors = {};
    const trimmedId = clientId.trim();

    if (!trimmedId) {
      errors.clientId = 'Client ID is required.';
    } else if (trimmedId.length > 50) {
      errors.clientId = 'Client ID cannot exceed 50 characters.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    } else if (password.length > 100) {
      errors.password = 'Password cannot exceed 100 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalSuccess(null);

    if (!validateLoginFields()) return;

    const result = login(clientId.trim(), password);
    if (!result.success && result.error) {
      toast.error(result.error, 'Login Failed');
    } else if (result.success && result.requirePasswordChange) {
      setShowChangePassword(true);
    } else if (result.success) {
      navigate('/');
    }
  };

  const validateCreateAccountFields = (): boolean => {
    const errors: CreateAccountErrors = {};
    const trimmedId = newClientId.trim();
    const trimmedCompany = newCompany.trim();
    const trimmedEmail = newEmail.trim();
    const trimmedName = newName.trim();
    const cleanPhone = newContact.trim().replace(/[\s-]/g, '');

    if (!trimmedId) {
      errors.clientId = 'Client ID is required.';
    } else if (!isValidClientId(trimmedId)) {
      errors.clientId = 'Client ID must be 3-20 characters (letters, numbers, hyphens).';
    }

    if (!trimmedCompany) {
      errors.companyName = 'Company name is required.';
    } else if (trimmedCompany.length > 200) {
      errors.companyName = 'Company name cannot exceed 200 characters.';
    }

    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!isValidEmail(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    } else if (trimmedEmail.length > 255) {
      errors.email = 'Email cannot exceed 255 characters.';
    }

    if (!trimmedName) {
      errors.name = 'Contact person name is required.';
    } else if (trimmedName.length > 200) {
      errors.name = 'Name cannot exceed 200 characters.';
    }

    if (!cleanPhone) {
      errors.contact = 'Contact number is required.';
    } else if (!isValidPhone(newContact)) {
      errors.contact = 'Format must be a valid PH mobile number (e.g., 09171234567 or +639171234567).';
    }

    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!validateCreateAccountFields()) {
      setCreateError("Please fix the errors indicated below.");
      return;
    }

    const result = createAccount({ 
      id: newClientId.trim().toUpperCase(),
      companyName: newCompany.trim(),
      email: newEmail.trim().toLowerCase(),
      name: newName.trim(),
      contactNumber: newContact.trim()
    });

    if (!result.success && result.error) {
      setCreateError(result.error);
      return;
    }

    toast.success('Account created successfully! You can now log in.');
    setClientId(newClientId.trim().toUpperCase());
    setPassword('');
    setShowCreateAccount(false);
    
    // Reset fields
    setNewClientId('');
    setNewCompany('');
    setNewEmail('');
    setNewName('');
    setNewContact('');
    setCreateErrors({});
  };

  const handleChangePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (changePasswordVal.length < 8) {
      toast.warning("Password must be at least 8 characters.");
      return;
    }
    changePassword(clientId.trim(), changePasswordVal);
    toast.success('Password changed successfully.');
    setShowChangePassword(false);
    navigate('/');
  };

  const clearFieldError = (field: keyof FormErrors) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotClientId, setForgotClientId] = useState('');
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = forgotClientId.trim();
    if (!trimmed) {
      setForgotError('Please enter your Client ID or Email.');
      return;
    }
    if (trimmed.length > 255) {
      setForgotError('Input cannot exceed 255 characters.');
      return;
    }
    setForgotError(null);
    setForgotSuccess(true);
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
          <span className="login-logo-tagline">Client Payment Portal</span>
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

          <p className="login-card-label">Client Access</p>
          <h1 className="login-card-title">
            Login to SpeedPay Portal
          </h1>
          <p className="login-card-subtitle">Enter your Email and password below.</p>
          <div className="login-card-divider" />

          {/* Form */}
          <form className="login-form" onSubmit={handleLoginSubmit} noValidate>

            <div className="login-field">
              <label htmlFor="speedpay-clientid" className="login-label">
                Client ID
              </label>
              <div className={`login-input-wrap ${fieldErrors.clientId ? 'has-error' : ''}`}>
                <span className="login-input-icon">
                  <User size={16} />
                </span>
                <input
                  id="speedpay-clientid"
                  type="text"
                  className="login-input"
                  placeholder="e.g. C-1001"
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    clearFieldError('clientId');
                  }}
                  autoFocus
                />
              </div>
              {fieldErrors.clientId && (
                <span className="login-field-error">
                  <AlertCircle size={13} />
                  {fieldErrors.clientId}
                </span>
              )}
            </div>

            <div className="login-field">
              <label htmlFor="speedpay-password" className="login-label">
                Password
              </label>
              <div className={`login-input-wrap ${fieldErrors.password ? 'has-error' : ''}`}>
                <span className="login-input-icon">
                  <Lock size={16} />
                </span>
                <input
                  id="speedpay-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError('password');
                  }}
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && (
                <span className="login-field-error">
                  <AlertCircle size={13} />
                  {fieldErrors.password}
                </span>
              )}
            </div>

            <div className="login-options-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  className="login-remember-checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="login-remember-label">Remember me</span>
              </label>
              <button
                type="button"
                className="login-forgot-link"
                onClick={() => {
                  setShowForgotModal(true);
                  setForgotSuccess(false);
                  setForgotError(null);
                  setForgotClientId('');
                }}
              >
                Forgot password?
              </button>
            </div>

            {globalSuccess && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px', padding: '10px 14px', fontSize: '12.5px', color: '#047857',
                fontFamily: '"Inter", sans-serif'
              }}>
                {globalSuccess}
              </div>
            )}

            <button 
              type="submit" 
              className="login-btn" 
              disabled={!isLoginFormValid}
              style={{
                opacity: isLoginFormValid ? 1 : 0.5,
                cursor: isLoginFormValid ? 'pointer' : 'not-allowed'
              }}
            >
              Log In
            </button>
            
            <div style={{ textAlign: 'center', marginTop: '0', fontSize: '12.5px', color: '#64748B' }}>
              New client?{' '}
              <button
                type="button"
                onClick={() => setShowCreateAccount(true)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'transparent',
                  border: '1.5px solid #1B254B',
                  borderRadius: '8px',
                  fontFamily: '"Inter", sans-serif',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#1B254B',
                  cursor: 'pointer',
                  marginTop: '6px'
                }}
              >
                Create Account
              </button>
            </div>
          </form>
        </div>

        <div className="login-card-footer">
          © {new Date().getFullYear()}{' '}
          <strong>SpeedPay</strong> — Client Payment Portal. All rights reserved.
        </div>
      </main>

      {/* CREATE ACCOUNT MODAL */}
      {showCreateAccount && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: '20px' }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '550px', fontFamily: '"Inter", sans-serif', margin: 'auto' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0F172A' }}>Create Account</h2>
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#64748B' }}>Fill in your details below.</p>
            
            {createError && (
              <div className="login-global-error" style={{ marginBottom: '16px' }}>
                <AlertCircle size={15} />
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateAccountSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} noValidate>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Client ID</label>
                  <div className={`login-input-wrap ${createErrors.clientId ? 'has-error' : ''}`} style={{ height: '38px', padding: '0 10px' }}>
                    <input 
                      type="text" 
                      className="login-input" 
                      required 
                      maxLength={20}
                      value={newClientId} 
                      onChange={e => {
                        setNewClientId(e.target.value);
                        setCreateErrors(prev => ({ ...prev, clientId: undefined }));
                      }} 
                      placeholder="e.g. C-1001" 
                      style={{ fontSize: '13px' }} 
                    />
                  </div>
                  {createErrors.clientId && (
                    <span style={{ color: '#DC2626', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={11} /> {createErrors.clientId}
                    </span>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Company Name</label>
                  <div className={`login-input-wrap ${createErrors.companyName ? 'has-error' : ''}`} style={{ height: '38px', padding: '0 10px' }}>
                    <input 
                      type="text" 
                      className="login-input" 
                      required 
                      maxLength={200}
                      value={newCompany} 
                      onChange={e => {
                        setNewCompany(e.target.value);
                        setCreateErrors(prev => ({ ...prev, companyName: undefined }));
                      }} 
                      placeholder="Company Inc." 
                      style={{ fontSize: '13px' }} 
                    />
                  </div>
                  {createErrors.companyName && (
                    <span style={{ color: '#DC2626', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={11} /> {createErrors.companyName}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Email Address</label>
                <div className={`login-input-wrap ${createErrors.email ? 'has-error' : ''}`} style={{ height: '38px', padding: '0 10px' }}>
                  <Mail size={14} className="login-input-icon" />
                  <input 
                    type="email" 
                    className="login-input" 
                    required 
                    maxLength={255}
                    value={newEmail} 
                    onChange={e => {
                      setNewEmail(e.target.value);
                      setCreateErrors(prev => ({ ...prev, email: undefined }));
                    }} 
                    placeholder="name@company.com" 
                    style={{ fontSize: '13px' }} 
                  />
                </div>
                {createErrors.email && (
                  <span style={{ color: '#DC2626', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={11} /> {createErrors.email}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Contact Person</label>
                  <div className={`login-input-wrap ${createErrors.name ? 'has-error' : ''}`} style={{ height: '38px', padding: '0 10px' }}>
                    <User size={14} className="login-input-icon" />
                    <input 
                      type="text" 
                      className="login-input" 
                      required 
                      maxLength={200}
                      value={newName} 
                      onChange={e => {
                        setNewName(e.target.value);
                        setCreateErrors(prev => ({ ...prev, name: undefined }));
                      }} 
                      placeholder="Juan Dela Cruz" 
                      style={{ fontSize: '13px' }} 
                    />
                  </div>
                  {createErrors.name && (
                    <span style={{ color: '#DC2626', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={11} /> {createErrors.name}
                    </span>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Contact Number</label>
                  <div className={`login-input-wrap ${createErrors.contact ? 'has-error' : ''}`} style={{ height: '38px', padding: '0 10px' }}>
                    <Phone size={14} className="login-input-icon" />
                    <input 
                      type="text" 
                      className="login-input" 
                      required 
                      maxLength={20}
                      value={newContact} 
                      onChange={e => {
                        setNewContact(e.target.value);
                        setCreateErrors(prev => ({ ...prev, contact: undefined }));
                      }} 
                      placeholder="09171234567" 
                      style={{ fontSize: '13px' }} 
                    />
                  </div>
                  {createErrors.contact && (
                    <span style={{ color: '#DC2626', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={11} /> {createErrors.contact}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '8px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: '1.5' }}>
                  <strong>Notice:</strong> Your default login credentials will be your Client ID and the initial password <code>Password@123</code>. You will be required to change this password upon your first login.
                </p>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="button" onClick={() => setShowCreateAccount(false)} style={{ flex: 1, padding: '12px', background: '#F1F5F9', border: 'none', borderRadius: '8px', fontWeight: 600, color: '#475569', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                <button 
                  type="submit" 
                  disabled={!isCreateFormValid}
                  style={{ 
                    flex: 1, 
                    padding: '12px', 
                    background: isCreateFormValid ? '#00A99D' : '#94A3B8', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontWeight: 600, 
                    color: '#FFF', 
                    cursor: isCreateFormValid ? 'pointer' : 'not-allowed', 
                    fontSize: '13px' 
                  }}
                >
                  Sign Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {showChangePassword && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '400px', fontFamily: '"Inter", sans-serif' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0F172A' }}>Change Default Password</h2>
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#64748B' }}>For security reasons, you must change your password before logging in for the first time.</p>
            
            <form onSubmit={handleChangePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>New Password</label>
                <div className="login-input-wrap">
                  <Lock size={16} className="login-input-icon" />
                  <input 
                    type={showChangePasswordVal ? 'text' : 'password'} 
                    minLength={8} 
                    className="login-input" 
                    required 
                    value={changePasswordVal} 
                    onChange={e => setChangePasswordVal(e.target.value)} 
                    placeholder="Minimum 8 characters" 
                  />
                  <button
                    type="button"
                    className="login-eye-btn"
                    onClick={() => setShowChangePasswordVal((v) => !v)}
                  >
                    {showChangePasswordVal ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              
              <button type="submit" style={{ width: '100%', padding: '12px', background: '#1B254B', border: 'none', borderRadius: '8px', fontWeight: 600, color: '#FFF', cursor: 'pointer', marginTop: '8px' }}>
                Change Password & Continue
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '440px', fontFamily: '"Inter", sans-serif' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0F172A' }}>Reset Client Password</h2>
            
            {forgotSuccess ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>✅</div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#10B981' }}>Reset Instructions Sent</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5', margin: 0 }}>
                  Password reset instructions for <strong>{forgotClientId}</strong> have been sent to your registered email address and SpeedEx Account Coordinator.
                </p>
                <button
                  onClick={() => setShowForgotModal(false)}
                  style={{ width: '100%', padding: '12px', background: '#00A99D', border: 'none', borderRadius: '8px', fontWeight: 600, color: '#FFF', cursor: 'pointer', marginTop: '20px', fontSize: '13px' }}
                >
                  Return to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
                  Enter your Client ID or registered email address. We will verify your account and send reset instructions.
                </p>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Client ID or Email</label>
                  <div className="login-input-wrap">
                    <User size={16} className="login-input-icon" />
                    <input
                      type="text"
                      className="login-input"
                      required
                      maxLength={255}
                      value={forgotClientId}
                      onChange={e => {
                        setForgotClientId(e.target.value);
                        setForgotError(null);
                      }}
                      placeholder="e.g. JD-001 or client@company.com"
                    />
                  </div>
                  {forgotError && (
                    <span style={{ fontSize: '12px', color: '#EF4444', marginTop: '6px', display: 'block' }}>
                      {forgotError}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    style={{ flex: 1, padding: '12px', background: '#F1F5F9', border: 'none', borderRadius: '8px', fontWeight: 600, color: '#475569', cursor: 'pointer', fontSize: '13px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!forgotClientId.trim()}
                    style={{ 
                      flex: 1, 
                      padding: '12px', 
                      background: forgotClientId.trim() ? '#00A99D' : '#94A3B8', 
                      border: 'none', 
                      borderRadius: '8px', 
                      fontWeight: 600, 
                      color: '#FFF', 
                      cursor: forgotClientId.trim() ? 'pointer' : 'not-allowed', 
                      fontSize: '13px' 
                    }}
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
