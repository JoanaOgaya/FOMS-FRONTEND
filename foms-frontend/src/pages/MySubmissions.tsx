/**
 * src/pages/MySubmissions.tsx
 * Screen D: Accountant My Submissions & Finance Review Decisions
 * Shows full verification results, Financial Manager decisions (Duplicate, Unique, Returned),
 * audit notes, status badges, and rescan/resubmit actions.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { ROLES } from '../types/auth';
import { duplicateScanService } from '../services/duplicateScanService';
import type { DuplicateAlert } from '../types/duplicateScan';

export const MySubmissions: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const isAccountant =
    user?.role === ROLES.ACCOUNTANT ||
    user?.role === ROLES.ASSISTANT_FM;

  const [submissions, setSubmissions] = useState<DuplicateAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<'ALL' | 'RETURNED' | 'DECIDED' | 'PENDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Read-only Comparison Modal
  const [activeAlert, setActiveAlert] = useState<DuplicateAlert | null>(null);

  // Resubmit Modal for Returned Items
  const [resubmitAlert, setResubmitAlert] = useState<DuplicateAlert | null>(null);
  const [resubmitNote, setResubmitNote] = useState('');
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [resubmitReasonTag, setResubmitReasonTag] = useState<string>('Clearer Re-scan');
  const [rescanFile, setRescanFile] = useState<File | null>(null);
  const [rescanPreview, setRescanPreview] = useState<string | null>(null);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadSubmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await duplicateScanService.getMySubmissions(user?.employeeId);
      setSubmissions(items);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch your document submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, [user]);

  const counts = useMemo(() => {
    const returned = submissions.filter((s) => s.status === 'Returned').length;
    const decided = submissions.filter(
      (s) => s.status === 'Confirmed Duplicate' || s.status === 'Cleared as Unique' || s.status === 'AI Cleared'
    ).length;
    const pending = submissions.filter((s) => s.status === 'Pending Review').length;
    return {
      all: submissions.length,
      returned,
      decided,
      pending,
    };
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((item) => {
      if (activeTab === 'RETURNED' && item.status !== 'Returned') return false;
      if (
        activeTab === 'DECIDED' &&
        item.status !== 'Confirmed Duplicate' &&
        item.status !== 'Cleared as Unique' &&
        item.status !== 'AI Cleared'
      ) {
        return false;
      }
      if (activeTab === 'PENDING' && item.status !== 'Pending Review') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.alertId.toLowerCase().includes(q) ||
          item.documentNo.toLowerCase().includes(q) ||
          item.clientName.toLowerCase().includes(q) ||
          (item.reviewedBy && item.reviewedBy.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [submissions, activeTab, searchQuery]);

  const handleOpenResubmit = (alert: DuplicateAlert, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setResubmitAlert(alert);
    setResubmitNote('');
    setResubmitReasonTag('Clearer Re-scan');
    setRescanFile(null);
    setRescanPreview(null);
    setRescanError(null);
  };

  const handleFileSelect = (file: File) => {
    setRescanError(null);
    const validExtensions = ['jpg', 'jpeg', 'png'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (!validExtensions.includes(ext)) {
      setRescanError('Invalid file type. Please upload a JPG, JPEG, or PNG receipt statement.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setRescanError('File size exceeds 10MB limit. Please upload a smaller image.');
      return;
    }

    setRescanFile(file);
    const previewUrl = URL.createObjectURL(file);
    setRescanPreview(previewUrl);
  };

  const handleConfirmResubmit = async () => {
    if (!resubmitAlert) return;
    if (!resubmitNote.trim() && !rescanFile) {
      toast.error('Please enter a clarification note or upload a replacement scan.', 'Validation');
      return;
    }

    setIsResubmitting(true);
    try {
      const res = await duplicateScanService.resubmitReturnedAlert(
        resubmitAlert.alertId,
        resubmitNote,
        user?.fullName || 'Maria Mariel Jane Anonuevo',
        user?.employeeId || 'EMP-004',
        resubmitReasonTag,
        rescanPreview || undefined,
        rescanFile?.name || undefined
      );
      toast.success(res.message, 'Document Resubmitted');
      setResubmitAlert(null);
      if (activeAlert?.alertId === resubmitAlert.alertId) {
        setActiveAlert(null);
      }
      await loadSubmissions();
    } catch (err: any) {
      toast.error(err.message || 'Failed to resubmit alert.', 'Error');
    } finally {
      setIsResubmitting(false);
    }
  };

  const formatStatusBadge = (status: DuplicateAlert['status']) => {
    switch (status) {
      case 'Pending Review':
        return (
          <span style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FCD34D', padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
            Pending Review
          </span>
        );
      case 'Confirmed Duplicate':
        return (
          <span style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
            Confirmed Duplicate
          </span>
        );
      case 'Cleared as Unique':
      case 'AI Cleared':
        return (
          <span style={{ background: '#DCFCE7', color: '#16A34A', border: '1px solid #86EFAC', padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
            {status === 'AI Cleared' ? 'AI Cleared' : 'Cleared as Unique'}
          </span>
        );
      case 'Returned':
        return (
          <span style={{ background: '#DBEAFE', color: '#2563EB', border: '1px solid #93C5FD', padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
            Returned
          </span>
        );
      default:
        return (
          <span style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
            {status}
          </span>
        );
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      {/* Decision Support Notice */}
      <div
        style={{
          background: '#F0FDFA',
          border: '1px solid #99F6E4',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0D9488', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-shield-check" style={{ fontSize: '18px' }} />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
            Decision Support Notice
          </div>
          <div style={{ fontSize: '0.875rem', color: '#134E4A', lineHeight: 1.5 }}>
            AI-generated results are provided as decision support only. Final validation and official record updates must be performed by an authorized finance user through the existing FOMS workflow.
          </div>
        </div>
      </div>

      {/* Header and Title */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>
            My Submissions &amp; Finance Review Decisions
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#64748B', margin: 0 }}>
            Track duplicate review status, view Financial Manager decisions, and resubmit returned files.
          </p>
        </div>
        <button
          onClick={loadSubmissions}
          style={{ padding: '8px 18px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', color: '#0F172A', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <i className="ti ti-refresh" /> Refresh Decisions
        </button>
      </div>

      {/* Action Required Banner for Returned items */}
      {counts.returned > 0 && (
        <div
          style={{
            background: '#EFF6FF',
            border: '1.5px solid #93C5FD',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2563EB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-arrow-back-up" style={{ fontSize: '20px' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1E3A8A' }}>
                Action Required: {counts.returned} document(s) returned by Financial Manager
              </div>
              <div style={{ fontSize: '0.8rem', color: '#2563EB' }}>
                Finance requested rescans or clarifications. Review their audit notes and resubmit when ready.
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('RETURNED')}
            style={{
              padding: '8px 16px',
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            View Returned Documents
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Total Submissions</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{counts.all}</div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Tracked in your console</span>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase' }}>Returned by Finance</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: counts.returned > 0 ? '#2563EB' : '#0F172A', marginTop: '4px' }}>{counts.returned}</div>
          <span style={{ fontSize: '0.75rem', color: counts.returned > 0 ? '#DC2626' : '#94A3B8', fontWeight: counts.returned > 0 ? 700 : 500 }}>
            {counts.returned > 0 ? 'Requires accountant rescan' : 'None pending rescan'}
          </span>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>Confirmed Duplicates</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
            {submissions.filter((s) => s.status === 'Confirmed Duplicate').length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Validated by Financial Manager</span>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16A34A', textTransform: 'uppercase' }}>Cleared as Unique</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
            {submissions.filter((s) => s.status === 'Cleared as Unique' || s.status === 'AI Cleared').length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Approved for payment processing</span>
        </div>
      </div>

      {/* Permission Denied state */}
      {!isAccountant && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center' }}>
          <i className="ti ti-lock" style={{ fontSize: '32px', color: '#DC2626', marginBottom: '12px', display: 'inline-block' }} />
          <h3 style={{ margin: '0 0 8px', color: '#0F172A' }}>Permission Denied</h3>
          <p style={{ margin: 0, color: '#64748B', fontSize: '0.9rem' }}>
            My Submissions is restricted to Accountants who submit documents for review.
          </p>
        </div>
      )}

      {isAccountant && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
          {/* Controls: Tabs & Search */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: '#F8FAFC' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { key: 'ALL', label: `All Submissions (${counts.all})` },
                { key: 'RETURNED', label: `Returned to Me (${counts.returned})`, badgeColor: counts.returned > 0 ? '#2563EB' : undefined },
                { key: 'DECIDED', label: `Finance Decisions (${counts.decided})` },
                { key: 'PENDING', label: `Pending Review (${counts.pending})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as any)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: activeTab === tab.key ? '#0D9488' : '#CBD5E1',
                    background: activeTab === tab.key ? '#0D9488' : '#FFFFFF',
                    color: activeTab === tab.key ? '#FFFFFF' : '#475569',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ minWidth: 260 }}>
              <input
                type="text"
                placeholder="Search Alert ID, Document No, Client, Reviewer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.825rem',
                }}
              />
            </div>
          </div>

          {/* Loading Skeleton */}
          {loading && (
            <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ height: '48px', background: '#F1F5F9', borderRadius: '8px', animation: 'pulse 1.5s infinite ease-in-out' }} />
              ))}
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: '32px', color: '#DC2626', marginBottom: '12px', display: 'inline-block' }} />
              <h3 style={{ margin: '0 0 8px', color: '#0F172A' }}>Unable to Load Submissions</h3>
              <p style={{ margin: '0 0 16px', color: '#64748B', fontSize: '0.85rem' }}>{error}</p>
              <button
                onClick={loadSubmissions}
                style={{ padding: '8px 20px', background: '#0D9488', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredSubmissions.length === 0 && (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F8FAFC', color: '#94A3B8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <i className="ti ti-inbox" style={{ fontSize: '28px' }} />
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                No Document Submissions Found
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#64748B' }}>
                {activeTab === 'RETURNED'
                  ? 'No documents currently returned by Financial Manager.'
                  : activeTab === 'DECIDED'
                  ? 'No finalized review decisions recorded yet.'
                  : 'You have not submitted any flagged documents for manual review yet.'}
              </p>
            </div>
          )}

          {/* Submissions Table */}
          {!loading && !error && filteredSubmissions.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '14px 18px' }}>Alert ID</th>
                    <th style={{ padding: '14px 18px' }}>Document No.</th>
                    <th style={{ padding: '14px 18px' }}>Match Score</th>
                    <th style={{ padding: '14px 18px' }}>Submitted At</th>
                    <th style={{ padding: '14px 18px' }}>Finance Decision</th>
                    <th style={{ padding: '14px 18px' }}>Decided By</th>
                    <th style={{ padding: '14px 18px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map((item) => (
                    <React.Fragment key={item.alertId}>
                      <tr
                        onClick={() => setActiveAlert(item)}
                        style={{
                          borderBottom: item.status === 'Pending Review' ? '1px solid #F1F5F9' : 'none',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                          background: '#FFFFFF',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                      >
                        <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0F172A' }}>
                          {item.alertId}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#0F172A' }}>
                          <span style={{ fontWeight: 700 }}>{item.documentNo}</span>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B' }}>
                            {item.clientName}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span
                            style={{
                              fontWeight: 800,
                              color: item.matchScore >= 90 ? '#DC2626' : item.matchScore >= 60 ? '#D97706' : '#16A34A',
                            }}
                          >
                            {item.matchScore}%
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', color: '#64748B' }}>
                          {new Date(item.submittedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          {formatStatusBadge(item.status)}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#334155' }}>
                          {item.reviewedBy ? (
                            <div>
                              <span style={{ fontWeight: 600, color: '#0F172A', display: 'block' }}>{item.reviewedBy}</span>
                              {item.reviewedAt && (
                                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                  {new Date(item.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Awaiting Finance Review</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          {item.status === 'Returned' ? (
                            <button
                              type="button"
                              onClick={(e) => handleOpenResubmit(item, e)}
                              style={{
                                padding: '6px 14px',
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Rescan / Resubmit
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveAlert(item);
                              }}
                              style={{
                                padding: '6px 12px',
                                background: '#F1F5F9',
                                color: '#0F172A',
                                border: '1px solid #CBD5E1',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Inspect Decision →
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expandable Decision Card for Returned items */}
                      {item.status === 'Returned' && (
                        <tr style={{ background: '#EFF6FF', borderBottom: '1px solid #DBEAFE' }}>
                          <td colSpan={7} style={{ padding: '12px 18px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.825rem', color: '#1E40AF' }}>
                                <i className="ti ti-info-circle" style={{ marginTop: '2px', fontSize: '18px', flexShrink: 0 }} />
                                <div>
                                  <strong style={{ color: '#1E3A8A' }}>Financial Manager Return Feedback:</strong>{' '}
                                  {item.auditNotes || 'Image unclear or requires clarification.'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => handleOpenResubmit(item, e)}
                                style={{
                                  padding: '5px 12px',
                                  background: '#2563EB',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Respond / Resubmit
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Expandable Decision Card for Confirmed Duplicates */}
                      {item.status === 'Confirmed Duplicate' && (
                        <tr style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
                          <td colSpan={7} style={{ padding: '10px 18px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.825rem', color: '#991B1B' }}>
                              <i className="ti ti-alert-triangle" style={{ marginTop: '2px', fontSize: '17px', flexShrink: 0 }} />
                              <div>
                                <strong style={{ color: '#7F1D1D' }}>Validated as Duplicate by {item.reviewedBy || 'Financial Manager'}:</strong>{' '}
                                {item.duplicateReason && <span>Reason: {item.duplicateReason} • </span>}
                                {item.recommendedAction && <span>Action: {item.recommendedAction} • </span>}
                                <span>Remarks: "{item.auditNotes || 'Verified duplicate by Finance'}"</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Expandable Decision Card for Cleared as Unique */}
                      {item.status === 'Cleared as Unique' && (
                        <tr style={{ background: '#F0FDF4', borderBottom: '1px solid #BBF7D0' }}>
                          <td colSpan={7} style={{ padding: '10px 18px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.825rem', color: '#166534' }}>
                              <i className="ti ti-check" style={{ marginTop: '2px', fontSize: '17px', flexShrink: 0 }} />
                              <div>
                                <strong style={{ color: '#14532D' }}>Cleared as Unique by {item.reviewedBy || 'Financial Manager'}:</strong>{' '}
                                <span>"{item.auditNotes || 'Approved as legitimate unique document.'}"</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Full Finance Decision & Comparison Modal */}
      {activeAlert && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setActiveAlert(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: 900,
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                  Finance Review Decision: Alert #{activeAlert.alertId}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  Document {activeAlert.documentNo} • Client: {activeAlert.clientName}
                </span>
              </div>
              <button
                onClick={() => setActiveAlert(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#64748B', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Highlight status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '14px 18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                    Final Review Status:
                  </span>
                  {formatStatusBadge(activeAlert.status)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                    Match Score
                  </span>
                  <strong style={{ color: '#0F172A', fontSize: '1.25rem' }}>{activeAlert.matchScore}%</strong>
                </div>
              </div>

              {/* Financial Manager Review Notes */}
              {activeAlert.reviewedBy && (
                <div
                  style={{
                    background: activeAlert.status === 'Returned' ? '#EFF6FF' : activeAlert.status === 'Confirmed Duplicate' ? '#FEF2F2' : '#F0FDF4',
                    border: `1.5px solid ${activeAlert.status === 'Returned' ? '#BFDBFE' : activeAlert.status === 'Confirmed Duplicate' ? '#FECACA' : '#BBF7D0'}`,
                    borderRadius: '12px',
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: activeAlert.status === 'Returned' ? '#1E40AF' : activeAlert.status === 'Confirmed Duplicate' ? '#991B1B' : '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Financial Manager Official Decision
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      Decided by {activeAlert.reviewedBy} {activeAlert.reviewedAt ? `on ${new Date(activeAlert.reviewedAt).toLocaleString()}` : ''}
                    </span>
                  </div>

                  {activeAlert.duplicateReason && (
                    <div style={{ fontSize: '0.825rem', color: '#334155', marginBottom: '6px' }}>
                      <strong>Duplicate Reason:</strong> {activeAlert.duplicateReason}
                    </div>
                  )}

                  {activeAlert.recommendedAction && (
                    <div style={{ fontSize: '0.825rem', color: '#334155', marginBottom: '6px' }}>
                      <strong>Recommended Legacy Action:</strong> {activeAlert.recommendedAction}
                    </div>
                  )}

                  <div style={{ fontSize: '0.875rem', color: '#0F172A', marginTop: '6px', fontStyle: 'italic', background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    "{activeAlert.auditNotes || 'No notes entered.'}"
                  </div>
                </div>
              )}

              {/* Accountant Submission Note */}
              {activeAlert.submissionNote && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 18px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                    Original Accountant Submission Note ({activeAlert.submittedBy})
                  </span>
                  <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                    "{activeAlert.submissionNote}"
                  </div>
                </div>
              )}

              {/* Comparison Parameters Matrix */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                  Comparison Parameters Matrix
                </h4>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                        <th style={{ padding: '10px 14px' }}>Field</th>
                        <th style={{ padding: '10px 14px' }}>Uploaded Document</th>
                        <th style={{ padding: '10px 14px' }}>Existing Record</th>
                        <th style={{ padding: '10px 14px' }}>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeAlert.matrix.map((row) => (
                        <tr key={row.fieldKey} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>{row.fieldLabel}</td>
                          <td style={{ padding: '10px 14px', color: '#0F172A' }}>{row.uploadedValue !== null ? String(row.uploadedValue) : 'Not read'}</td>
                          <td style={{ padding: '10px 14px', color: '#0F172A' }}>{row.existingValue !== null ? String(row.existingValue) : 'None'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontWeight: 600, color: row.matchResult === 'EXACT_MATCH' ? '#DC2626' : row.matchResult === 'PARTIAL_MATCH' ? '#D97706' : '#64748B' }}>
                              {row.matchResult.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {activeAlert.status === 'Returned' && (
                  <button
                    onClick={() => handleOpenResubmit(activeAlert)}
                    style={{ padding: '8px 18px', background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    Rescan / Resubmit This Document
                  </button>
                )}
              </div>
              <button
                onClick={() => setActiveAlert(null)}
                style={{ padding: '8px 20px', background: '#0F172A', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right Slide-Over Drawer: Resubmit Document Console */}
      {resubmitAlert && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'flex-end',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => setResubmitAlert(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              width: '100%',
              maxWidth: 580,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(15, 23, 42, 0.2)',
              animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header (Sticky Top) */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid #DBEAFE',
                  }}
                >
                  <i className="ti ti-arrow-back-up" style={{ fontSize: '20px' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                      Resubmit for Review
                    </h3>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        border: '1px solid #DBEAFE',
                      }}
                    >
                      {resubmitAlert.alertId}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '0.775rem', color: '#64748B' }}>
                    Doc <strong style={{ color: '#1E293B' }}>{resubmitAlert.documentNo}</strong> • {resubmitAlert.clientName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setResubmitAlert(null)}
                style={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  background: '#F1F5F9',
                  border: 'none',
                  fontSize: '16px',
                  color: '#64748B',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#E2E8F0')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#F1F5F9')}
              >
                ✕
              </button>
            </div>

            {/* Drawer Body (Scrollable Single Column) */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                background: '#FAFAFA',
              }}
            >
              {/* SECTION 1: Financial Manager Return Feedback */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1.5px solid #BFDBFE',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(37,99,235,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#2563EB',
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ fontSize: '0.725rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Financial Manager Remarks
                    </span>
                  </div>
                  <span style={{ fontSize: '0.725rem', color: '#64748B' }}>
                    {resubmitAlert.reviewedBy || 'Financial Manager'}
                  </span>
                </div>

                <div
                  style={{
                    background: '#F8FAFC',
                    borderLeft: '3px solid #2563EB',
                    borderRadius: '0 8px 8px 0',
                    padding: '12px 14px',
                    fontSize: '0.875rem',
                    color: '#1E293B',
                    fontStyle: 'italic',
                    lineHeight: '1.5',
                  }}
                >
                  "{resubmitAlert.auditNotes || 'Image unclear or requires clarification before approval.'}"
                </div>
              </div>

              {/* SECTION 2: Document Quick Context Pills */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '14px 16px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center' }}>
                  <div style={{ borderRight: '1px solid #F1F5F9', paddingRight: '8px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, display: 'block' }}>DOCUMENT NO</span>
                    <strong style={{ fontSize: '0.85rem', color: '#0F172A', display: 'block', marginTop: '2px' }}>
                      {resubmitAlert.documentNo}
                    </strong>
                  </div>
                  <div style={{ borderRight: '1px solid #F1F5F9', paddingRight: '8px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, display: 'block' }}>TYPE</span>
                    <strong style={{ fontSize: '0.85rem', color: '#0F172A', display: 'block', marginTop: '2px' }}>
                      {resubmitAlert.documentType}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, display: 'block' }}>AI SIMILARITY</span>
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: '2px',
                        padding: '1px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: resubmitAlert.matchScore >= 90 ? '#DC2626' : '#D97706',
                        background: resubmitAlert.matchScore >= 90 ? '#FEE2E2' : '#FEF3C7',
                      }}
                    >
                      {resubmitAlert.matchScore}%
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.775rem',
                  }}
                >
                  <span style={{ color: '#64748B' }}>Client: <strong style={{ color: '#1E293B' }}>{resubmitAlert.clientName}</strong></span>
                  <span style={{ color: '#0D9488', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="ti ti-file-check" />
                    Original scan stored on file
                  </span>
                </div>
              </div>

              {/* SECTION 3: Corrective Action Category */}
              <div>
                <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                  1. Corrective Action Category <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'Clearer Re-scan', label: 'Clearer Re-scan', icon: 'ti-scan' },
                    { id: 'Corrected Reference', label: 'Corrected Reference', icon: 'ti-edit' },
                    { id: 'Clarified Legitimate Transaction', label: 'Clarified Transaction', icon: 'ti-check' },
                    { id: 'Attached Complete POD', label: 'Attached Complete POD', icon: 'ti-paperclip' },
                  ].map((tag) => {
                    const isSelected = resubmitReasonTag === tag.id;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setResubmitReasonTag(tag.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `1.5px solid ${isSelected ? '#0D9488' : '#E2E8F0'}`,
                          background: isSelected ? '#F0FDFA' : '#FFFFFF',
                          color: isSelected ? '#0F766E' : '#475569',
                          fontSize: '0.775rem',
                          fontWeight: isSelected ? 800 : 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.15s ease',
                          textAlign: 'left',
                        }}
                      >
                        <i className={`ti ${tag.icon}`} style={{ color: isSelected ? '#0D9488' : '#94A3B8', fontSize: '15px' }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 4: Replacement File Upload (Clear & Compact) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.775rem', fontWeight: 800, color: '#0F172A' }}>
                    2. Upload Clearer Scan / Photo
                  </label>
                  <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Optional</span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".jpg,.jpeg,.png"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />

                {!rescanFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '1.5px dashed #CBD5E1',
                      background: '#FFFFFF',
                      borderRadius: '10px',
                      padding: '16px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '14px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#0D9488';
                      e.currentTarget.style.background = '#F0FDFA';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#CBD5E1';
                      e.currentTarget.style.background = '#FFFFFF';
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '8px',
                        background: '#CCFBF1',
                        color: '#0D9488',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <i className="ti ti-camera-plus" style={{ fontSize: '20px' }} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#0F172A', display: 'block' }}>
                        Attach Replacement Receipt Image
                      </strong>
                      <span style={{ fontSize: '0.725rem', color: '#64748B' }}>
                        Click to browse JPG or PNG (Up to 10MB)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: '#F0FDF4',
                      border: '1.5px solid #86EFAC',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                      {rescanPreview ? (
                        <img
                          src={rescanPreview}
                          alt="Preview"
                          style={{ width: 42, height: 42, borderRadius: '6px', objectFit: 'cover', border: '1px solid #BBF7D0' }}
                        />
                      ) : (
                        <i className="ti ti-file-check" style={{ fontSize: '24px', color: '#16A34A' }} />
                      )}
                      <div style={{ overflow: 'hidden' }}>
                        <strong style={{ fontSize: '0.825rem', color: '#14532D', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rescanFile.name}
                        </strong>
                        <span style={{ fontSize: '0.7rem', color: '#16A34A' }}>
                          {(rescanFile.size / 1024).toFixed(1)} KB • Attached for re-scan
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRescanFile(null);
                        setRescanPreview(null);
                      }}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #FECACA',
                        color: '#DC2626',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}

                {rescanError && (
                  <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '6px', padding: '8px 12px', color: '#DC2626', fontSize: '0.75rem', marginTop: '8px' }}>
                    <i className="ti ti-alert-circle" style={{ marginRight: '6px' }} />
                    {rescanError}
                  </div>
                )}
              </div>

              {/* SECTION 5: Clarification Note to FM */}
              <div>
                <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                  3. Clarification Note to Financial Manager <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  rows={4}
                  value={resubmitNote}
                  onChange={(e) => setResubmitNote(e.target.value)}
                  placeholder="Explain the corrective action taken (e.g. Uploaded a high-resolution rescan with clear invoice numbers and stamp dates to verify validity)..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                    lineHeight: '1.45',
                    background: '#FFFFFF',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#0D9488')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#CBD5E1')}
                />
                <span style={{ fontSize: '0.725rem', color: '#94A3B8', marginTop: '4px', display: 'block' }}>
                  This clarification will be shown directly in the Financial Manager queue.
                </span>
              </div>
            </div>

            {/* Drawer Footer (Sticky Bottom) */}
            <div
              style={{
                padding: '16px 24px',
                background: '#FFFFFF',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '0.725rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="ti ti-shield-check" style={{ color: '#0D9488', fontSize: '15px' }} />
                <span>Resubmission resets status to <strong>Pending Review</strong> for Financial Manager.</span>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setResubmitAlert(null)}
                  disabled={isResubmitting}
                  style={{
                    padding: '9px 18px',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#475569',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.825rem',
                    cursor: isResubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmResubmit}
                  disabled={isResubmitting || (!resubmitNote.trim() && !rescanFile)}
                  style={{
                    padding: '9px 22px',
                    background: isResubmitting || (!resubmitNote.trim() && !rescanFile) ? '#94A3B8' : '#0D9488',
                    border: 'none',
                    color: '#FFFFFF',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.825rem',
                    cursor: isResubmitting || (!resubmitNote.trim() && !rescanFile) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: isResubmitting || (!resubmitNote.trim() && !rescanFile) ? 'none' : '0 2px 4px rgba(13, 148, 136, 0.25)',
                  }}
                >
                  <i className="ti ti-send" />
                  {isResubmitting ? 'Resubmitting...' : 'Confirm & Resubmit to Finance'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MySubmissions;
