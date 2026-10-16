import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { useQuery } from '../hooks/useQuery';
import { auditLogsService } from '../services/auditLogsService';
import { usersService } from '../services/usersService';
import type { AuditLog, AppUserRecord } from '../types/entities';
import { formatRelative } from '../utils/format';
import { useToast } from '../components/ToastContext';

const ROLE_LABEL_MAP: Record<string, string> = {
  FINANCIAL_MANAGER: 'Financial Manager',
  HEAD_ACCOUNTANT: 'Head Accountant',
  ACCOUNTANT: 'Accountant',
  ASSISTANT_FM: 'Assistant Financial Manager',
  'Finance Manager': 'Financial Manager',
  'Assistant of Financial Manager': 'Assistant Financial Manager',
};
const getRoleLabel = (r?: string) => (r && ROLE_LABEL_MAP[r]) || r || 'User';

const ALLOWED_ROLES = [
  'Financial Manager',
  'Head Accountant',
  'Accountant',
  'Assistant Financial Manager'
];

interface EmployeeFormData {
  employeeId: string;
  fullName: string;
  email: string;
  role: string;
  phone: string;
  salaryRate: string;
  dateHired: string;
  status: 'Active' | 'Inactive';
}

interface FormFieldErrors {
  employeeId?: string;
  fullName?: string;
  email?: string;
  role?: string;
  phone?: string;
  salaryRate?: string;
  dateHired?: string;
}

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Audit logs query
  const { data: auditData } = useQuery(
    `profile:audit:${user?.employeeId}`,
    () => auditLogsService.list({ pageSize: 50 }),
    { enabled: !!user }
  );

  // Live Staff / Users query
  const { data: usersData, refetch: refetchUsers, isLoading: isLoadingUsers } = useQuery(
    'users:all',
    () => usersService.list({ pageSize: 100 }),
    { enabled: !!user }
  );

  const staffList = useMemo(() => {
    if (!usersData) return [];
    const items = Array.isArray(usersData) ? usersData : usersData.items || [];
    return [...items].sort((a: AppUserRecord, b: AppUserRecord) => 
      (a.employeeNumber || a.id).localeCompare(b.employeeNumber || b.id)
    );
  }, [usersData]);

  // Modal State for Add / Edit Employee
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<AppUserRecord | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>({
    employeeId: '',
    fullName: '',
    email: '',
    role: 'Accountant',
    phone: '',
    salaryRate: '',
    dateHired: '',
    status: 'Active',
  });
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation rules
  const validateField = (name: keyof EmployeeFormData, val: string): string | undefined => {
    const trimmed = val.trim();
    switch (name) {
      case 'employeeId':
        if (!editingEmployee) {
          if (!trimmed) return 'Employee ID is required.';
          if (!/^EMP-\d{3}$/i.test(trimmed)) return 'Must match format EMP-### (e.g. EMP-001).';
          if (trimmed.length > 10) return 'Cannot exceed 10 characters.';
          const exists = staffList.some(e => (e.employeeNumber || e.id).toUpperCase() === trimmed.toUpperCase());
          if (exists) return 'This Employee ID is already registered.';
        }
        return undefined;
      case 'fullName':
        if (!trimmed) return 'Full Name is required.';
        if (trimmed.length > 200) return 'Cannot exceed 200 characters.';
        if (!/^[a-zA-Z\s\.\-]+$/.test(trimmed)) return 'Name contains invalid characters.';
        return undefined;
      case 'email':
        if (!trimmed) return 'Email is required.';
        if (trimmed.length > 255) return 'Cannot exceed 255 characters.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Invalid email format.';
        const emailExists = staffList.some(e => 
          e.email?.toLowerCase() === trimmed.toLowerCase() && 
          (!editingEmployee || (editingEmployee.employeeNumber || editingEmployee.id) !== (e.employeeNumber || e.id))
        );
        if (emailExists) return 'This email is already in use.';
        return undefined;
      case 'role':
        if (!trimmed) return 'Role is required.';
        return undefined;
      case 'phone':
        if (trimmed && !/^(\+63|0)9\d{9}$/.test(trimmed.replace(/[\s-]/g, ''))) {
          return 'Valid format: 09171234567 or +639171234567.';
        }
        if (trimmed.length > 20) return 'Cannot exceed 20 characters.';
        return undefined;
      case 'salaryRate':
        if (trimmed) {
          const num = parseFloat(trimmed);
          if (isNaN(num)) return 'Must be a valid number.';
          if (num < 0) return 'Salary cannot be negative.';
          if (num > 10000000) return 'Exceeds maximum allowable rate (₱10,000,000).';
        }
        return undefined;
      case 'dateHired':
        if (trimmed && isNaN(Date.parse(trimmed))) return 'Must be a valid date.';
        return undefined;
      default:
        return undefined;
    }
  };

  const isFormValid = useMemo(() => {
    const errId = validateField('employeeId', formData.employeeId);
    const errName = validateField('fullName', formData.fullName);
    const errEmail = validateField('email', formData.email);
    const errRole = validateField('role', formData.role);
    const errPhone = validateField('phone', formData.phone);
    const errSalary = validateField('salaryRate', formData.salaryRate);
    const errDate = validateField('dateHired', formData.dateHired);

    return !errId && !errName && !errEmail && !errRole && !errPhone && !errSalary && !errDate;
  }, [formData, editingEmployee, staffList]);

  const handleOpenAddModal = () => {
    setEditingEmployee(null);
    setFormData({
      employeeId: '',
      fullName: '',
      email: '',
      role: 'Accountant',
      phone: '',
      salaryRate: '',
      dateHired: new Date().toISOString().split('T')[0],
      status: 'Active',
    });
    setFieldErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (emp: AppUserRecord) => {
    setEditingEmployee(emp);
    setFormData({
      employeeId: emp.employeeNumber || emp.id,
      fullName: emp.fullName || '',
      email: emp.email || '',
      role: emp.role || 'Accountant',
      phone: emp.phone || '',
      salaryRate: emp.salaryRate ? String(emp.salaryRate) : '',
      dateHired: emp.dateHired ? emp.dateHired.split('T')[0] : '',
      status: (emp.status as 'Active' | 'Inactive') || 'Active',
    });
    setFieldErrors({});
    setIsModalOpen(true);
  };

  const handleFormChange = (field: keyof EmployeeFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    const error = validateField(field, value);
    setFieldErrors(prev => ({ ...prev, [field]: error }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const payload = {
        employeeId: formData.employeeId.trim().toUpperCase(),
        username: formData.employeeId.trim().toUpperCase(),
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role.trim(),
        password: 'Password@123',
        phone: formData.phone.trim() || undefined,
        salaryRate: formData.salaryRate ? parseFloat(formData.salaryRate) : undefined,
        dateHired: formData.dateHired ? new Date(formData.dateHired).toISOString() : undefined,
        status: formData.status,
      };

      if (editingEmployee) {
        await usersService.update(editingEmployee.id, {
          fullName: payload.fullName,
          email: payload.email,
          role: payload.role,
          phone: payload.phone,
          salaryRate: payload.salaryRate,
          status: payload.status,
        });
        toast.success(`Employee ${formData.employeeId} updated successfully.`);
      } else {
        await usersService.create(payload);
        toast.success(`Employee ${formData.employeeId} registered successfully.`);
      }

      setIsModalOpen(false);
      refetchUsers();
    } catch (err: any) {
      const respData = err?.response?.data;
      if (respData?.errors) {
        const backendErrors: FormFieldErrors = {};
        for (const [k, msgs] of Object.entries(respData.errors)) {
          const key = k.charAt(0).toLowerCase() + k.slice(1);
          if (Array.isArray(msgs) && msgs.length > 0) {
            backendErrors[key as keyof FormFieldErrors] = msgs[0] as string;
          }
        }
        setFieldErrors(backendErrors);
        toast.error('Validation failed. Please check field errors.');
      } else {
        toast.error(err?.message || 'Failed to save employee record.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const loginHistoryFeed = useMemo(() => {
    if (!user) return [];
    const logs = auditData?.items || [];
    const loginLogs = logs.filter((log: AuditLog) => log.userId === user.employeeId && log.action === 'USER_LOGIN');

    return loginLogs.map((log: AuditLog, idx: number) => ({
      id: log.id,
      timeAgo: idx === 0 ? 'Just now' : formatRelative(log.timestamp),
      deviceInfo: log.ipAddress ? `IP: ${log.ipAddress}` : 'Web Session',
      isCurrent: idx === 0,
    }));
  }, [user, auditData]);

  if (!user) return null;

  const email = user.email || `${user.fullName.toLowerCase().replace(/\s+/g, '.')}@foms.global`;
  const initials = user.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Card: User Info */}
      <Card noPadding>
        <div style={{ padding: '24px 32px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#0D9488', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
            {initials}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>{user.fullName}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FAF5FF', color: '#9333EA', padding: '4px 10px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 600, width: 'fit-content' }}>
              <i className="ti ti-check" style={{ fontSize: '0.85rem' }} />
              {getRoleLabel(user.role)}
            </div>
          </div>
        </div>
        <div style={{ padding: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EMPLOYEE ID</p>
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#0F172A', fontWeight: 600 }}>{user.employeeId}</p>
              </div>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FULL LEGAL NAME</p>
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#0F172A', fontWeight: 500 }}>{user.fullName}</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ASSIGNED ROLE</p>
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#0F172A', fontWeight: 500 }}>{getRoleLabel(user.role)}</p>
              </div>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EMAIL ADDRESS</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-mail" style={{ color: '#94A3B8', fontSize: '1.1rem' }} />
                  <p style={{ margin: 0, fontSize: '0.95rem', color: '#0F172A', fontWeight: 500 }}>{email}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Middle Card: Staff Directory & Personnel Records (EMP-001 through EMP-005) */}
      <Card noPadding>
        <div style={{ padding: '24px 32px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-users" style={{ fontSize: '1.25rem' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>Personnel Directory & Roles</h2>
              <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Verified staff records (EMP-001 through EMP-005)</span>
            </div>
          </div>
          <button
            onClick={handleOpenAddModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#0D9488',
              color: '#FFF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(13, 148, 136, 0.2)'
            }}
          >
            <i className="ti ti-user-plus" />
            Add Staff Member
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>
                <th style={{ padding: '14px 24px' }}>Employee ID</th>
                <th style={{ padding: '14px 24px' }}>Full Name</th>
                <th style={{ padding: '14px 24px' }}>Company Role</th>
                <th style={{ padding: '14px 24px' }}>Email Address</th>
                <th style={{ padding: '14px 24px' }}>Contact</th>
                <th style={{ padding: '14px 24px' }}>Monthly Rate</th>
                <th style={{ padding: '14px 24px' }}>Status</th>
                <th style={{ padding: '14px 24px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingUsers ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>Loading personnel roster...</td>
                </tr>
              ) : staffList.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>No employee records found.</td>
                </tr>
              ) : (
                staffList.map((emp: AppUserRecord) => {
                  const empId = emp.employeeNumber || emp.id;
                  const isCurrent = empId === user.employeeId;
                  return (
                    <tr 
                      key={emp.id} 
                      style={{ 
                        borderBottom: '1px solid #F1F5F9',
                        background: isCurrent ? 'rgba(13, 148, 136, 0.03)' : '#FFF'
                      }}
                    >
                      <td style={{ padding: '16px 24px', fontWeight: 700, color: '#0F172A' }}>
                        <span style={{ 
                          fontFamily: 'monospace', 
                          background: '#F1F5F9', 
                          padding: '3px 8px', 
                          borderRadius: '4px',
                          border: '1px solid #E2E8F0'
                        }}>
                          {empId}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px', fontWeight: 600, color: '#1E293B' }}>
                        {emp.fullName}
                        {isCurrent && (
                          <span style={{ marginLeft: '8px', fontSize: '0.7rem', background: '#CCFBF1', color: '#0F766E', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            YOU
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '16px 24px', color: '#475569' }}>
                        <span style={{ 
                          background: '#F3E8FF', 
                          color: '#7E22CE', 
                          padding: '3px 10px', 
                          borderRadius: '100px', 
                          fontSize: '0.75rem', 
                          fontWeight: 600 
                        }}>
                          {emp.role}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px', color: '#64748B' }}>{emp.email || '—'}</td>
                      <td style={{ padding: '16px 24px', color: '#64748B' }}>{emp.phone || '—'}</td>
                      <td style={{ padding: '16px 24px', color: '#0F172A', fontWeight: 600 }}>
                        {emp.salaryRate != null ? `₱${emp.salaryRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 8px',
                          borderRadius: '100px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: emp.status === 'Active' ? '#DCFCE7' : '#F1F5F9',
                          color: emp.status === 'Active' ? '#166534' : '#64748B'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: emp.status === 'Active' ? '#22C55E' : '#94A3B8' }} />
                          {emp.status}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenEditModal(emp)}
                          style={{
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            padding: '5px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bottom Card: Login History */}
      <Card noPadding>
        <div style={{ padding: '24px 32px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-history" style={{ fontSize: '1.1rem' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Recent Login History</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 500 }}>Last 30 days</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loginHistoryFeed.length === 0 ? (
            <p style={{ color: '#94A3B8', fontSize: '0.875rem', textAlign: 'center', padding: '24px 0' }}>No recent login history.</p>
          ) : (
            loginHistoryFeed.map((log, idx) => (
              <div key={log.id} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '16px 32px', borderBottom: idx < loginHistoryFeed.length - 1 ? '1px solid #F1F5F9' : 'none', background: '#FFF' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: log.isCurrent ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
                <i className="ti ti-device-desktop" style={{ color: '#94A3B8', fontSize: '1.1rem' }} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>{log.timeAgo} · </span>
                  <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>{log.deviceInfo}</span>
                </div>
                {log.isCurrent && (
                  <div style={{ background: '#F0FDF4', color: '#10B981', padding: '2px 8px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Current
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* ADD / EDIT EMPLOYEE MODAL */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#FFF', borderRadius: '14px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>
                  {editingEmployee ? `Edit Employee (${editingEmployee.employeeNumber || editingEmployee.id})` : 'Register New Personnel'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                  Enforces 3-layer validation (EMP-### pattern, regex, email, and salary constraints)
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94A3B8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFormSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Employee ID {!editingEmployee && <span style={{ color: '#EF4444' }}>*</span>}
                  </label>
                  <input
                    type="text"
                    disabled={!!editingEmployee}
                    maxLength={10}
                    value={formData.employeeId}
                    onChange={e => handleFormChange('employeeId', e.target.value)}
                    placeholder="EMP-006"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${fieldErrors.employeeId ? '#EF4444' : '#CBD5E1'}`,
                      background: editingEmployee ? '#F1F5F9' : '#FFF',
                      fontSize: '0.9rem',
                      fontFamily: 'monospace'
                    }}
                  />
                  {fieldErrors.employeeId && (
                    <span style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.employeeId}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Assigned Role <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={formData.role}
                    onChange={e => handleFormChange('role', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${fieldErrors.role ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '0.9rem',
                      background: '#FFF'
                    }}
                  >
                    {ALLOWED_ROLES.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Full Legal Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={formData.fullName}
                  onChange={e => handleFormChange('fullName', e.target.value)}
                  placeholder="e.g. Maria Santos"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${fieldErrors.fullName ? '#EF4444' : '#CBD5E1'}`,
                    fontSize: '0.9rem'
                  }}
                />
                {fieldErrors.fullName && (
                  <span style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.fullName}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Email Address <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="email"
                    maxLength={255}
                    value={formData.email}
                    onChange={e => handleFormChange('email', e.target.value)}
                    placeholder="santos@foms.local"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${fieldErrors.email ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '0.9rem'
                    }}
                  />
                  {fieldErrors.email && (
                    <span style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.email}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={formData.phone}
                    onChange={e => handleFormChange('phone', e.target.value)}
                    placeholder="09171234567"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${fieldErrors.phone ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '0.9rem'
                    }}
                  />
                  {fieldErrors.phone && (
                    <span style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.phone}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Monthly Salary Rate (₱)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10000000"
                    value={formData.salaryRate}
                    onChange={e => handleFormChange('salaryRate', e.target.value)}
                    placeholder="45000.00"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${fieldErrors.salaryRate ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '0.9rem'
                    }}
                  />
                  {fieldErrors.salaryRate && (
                    <span style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.salaryRate}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Date Hired
                  </label>
                  <input
                    type="date"
                    value={formData.dateHired}
                    onChange={e => handleFormChange('dateHired', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${fieldErrors.dateHired ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '0.9rem',
                      background: '#FFF'
                    }}
                  />
                  {fieldErrors.dateHired && (
                    <span style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.dateHired}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    color: '#475569',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isFormValid || isSubmitting}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isFormValid ? '#0D9488' : '#94A3B8',
                    color: '#FFF',
                    fontWeight: 600,
                    cursor: isFormValid && !isSubmitting ? 'pointer' : 'not-allowed',
                    boxShadow: isFormValid ? '0 2px 4px rgba(13, 148, 136, 0.25)' : 'none'
                  }}
                >
                  {isSubmitting ? 'Saving...' : editingEmployee ? 'Update Employee' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
