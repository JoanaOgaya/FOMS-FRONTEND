/**
 * src/pages/ManualReviewQueue.tsx
 * Screen E & Screen F: Financial Manager Manual Review Queue & Comparison Modal
 * Enforces Separation of Duties, Decision Support Notice, Human Validation Form, and Audit Logging.
 * No em dashes anywhere in UI text.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { ROLES } from '../types/auth';
import { duplicateScanService } from '../services/duplicateScanService';
import type { DuplicateAlert, HumanValidationPayload } from '../types/duplicateScan';

export const ManualReviewQueue: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const isFinancialManager =
    user?.role === ROLES.FINANCIAL_MANAGER ||
    user?.role === ROLES.HEAD_ACCOUNTANT;

  const currentUserId = user?.employeeId || user?.id || 'EMP-001';
  const currentUserName = user?.fullName || 'Crystalyn Joyce C. Fajardo';
  const currentUserRole = user?.role || 'Financial Manager';

  const [queueItems, setQueueItems] = useState<DuplicateAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM'>('ALL');
  const [docTypeFilter, setDocTypeFilter] = useState<'ALL' | 'INVOICE' | 'RECEIPT'>('ALL');
  const [submitterFilter, setSubmitterFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');

  // Screen F: Comparison Modal State
  const [activeAlert, setActiveAlert] = useState<DuplicateAlert | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [decision, setDecision] = useState<'DUPLICATE' | 'UNIQUE' | 'RETURNED'>('DUPLICATE');
  const [duplicateReason, setDuplicateReason] = useState<
    'Same reference number' | 'Same invoice number' | 'Same amount and client' | 'Other'
  >('Same reference number');
  const [recommendedAction, setRecommendedAction] = useState<
    'Flag and Block New Submission' | 'Keep for Investigation'
  >('Flag and Block New Submission');
  const [remarks, setRemarks] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await duplicateScanService.getManualReviewQueue();
      setQueueItems(items);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch manual review queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  // Filtered and searched queue
  const filteredQueue = useMemo(() => {
    return queueItems.filter((item) => {
      // Search
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        item.alertId.toLowerCase().includes(q) ||
        item.documentNo.toLowerCase().includes(q) ||
        item.clientName.toLowerCase().includes(q) ||
        item.submittedBy.toLowerCase().includes(q);

      if (!matchSearch) return false;

      // Score filter
      if (scoreFilter === 'HIGH' && item.matchScore < 90) return false;
      if (scoreFilter === 'MEDIUM' && (item.matchScore < 60 || item.matchScore >= 90)) return false;

      // Doc Type filter
      if (docTypeFilter === 'INVOICE' && !item.documentType.toLowerCase().includes('invoice')) return false;
      if (docTypeFilter === 'RECEIPT' && !item.documentType.toLowerCase().includes('receipt')) return false;

      // Submitter filter
      if (submitterFilter !== 'ALL' && item.submittedBy !== submitterFilter) return false;

      // Date filter
      if (dateFilter && !item.submittedAt.startsWith(dateFilter)) return false;

      return true;
    });
  }, [queueItems, searchQuery, scoreFilter, docTypeFilter, submitterFilter, dateFilter]);

  // Unique list of submitters for dropdown filter
  const submittersList = useMemo(() => {
    const set = new Set(queueItems.map((i) => i.submittedBy).filter(Boolean));
    return Array.from(set);
  }, [queueItems]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Alert ID', 'Submitted By', 'Submitted At', 'Document No', 'Client', 'Match Score', 'Conflict Flag', 'Status'];
    const rows = filteredQueue.map((item) => [
      item.alertId,
      item.submittedBy,
      item.submittedAt,
      item.documentNo,
      item.clientName,
      `${item.matchScore}%`,
      item.conflictFlag ? 'YES' : 'NO',
      item.status,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `manual_review_queue_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Manual review queue exported successfully.', 'Export Complete');
  };

  // Open Screen F Modal
  const handleOpenReview = (alert: DuplicateAlert) => {
    setActiveAlert(alert);
    setZoomLevel(1);
    setDecision('DUPLICATE');
    setDuplicateReason('Same reference number');
    setRecommendedAction('Flag and Block New Submission');
    setRemarks('');
    setDecisionError(null);
  };

  // Submit Screen F Decision
  const handleSubmitDecision = async () => {
    if (!activeAlert) return;
    setDecisionError(null);

    if (!remarks.trim()) {
      const msg = 'Audit notes / remarks are required before submitting.';
      setDecisionError(msg);
      toast.error(msg, 'Validation Error');
      return;
    }

    // Segregation of Duties check: person who submitted cannot decide
    if (activeAlert.submittedById && activeAlert.submittedById === currentUserId) {
      const msg = 'Violation of Separation of Duties: You cannot review or decide a document you submitted yourself.';
      setDecisionError(msg);
      toast.error(msg, 'Separation of Duties');
      return;
    }

    setIsSubmittingDecision(true);
    try {
      const payload: HumanValidationPayload = {
        decision,
        duplicateReason: decision === 'DUPLICATE' ? duplicateReason : undefined,
        recommendedAction: decision === 'DUPLICATE' ? recommendedAction : undefined,
        remarks: remarks.trim(),
      };

      const res = await duplicateScanService.submitReviewDecision(
        activeAlert.alertId,
        payload,
        currentUserName,
        currentUserId,
        currentUserRole
      );

      toast.success(res.message, 'Decision Recorded');
      setActiveAlert(null);
      await loadQueue();
    } catch (err: any) {
      const msg = err.message || 'Failed to submit review decision.';
      setDecisionError(msg);
      toast.error(msg, 'Error');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Banner: Decision Support Notice */}
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

      {/* Header and Controls */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>
            Manual Review Queue
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#64748B', margin: 0 }}>
            Inspect flagged documents, verify parameters side by side, and log final validation decisions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleExportCSV}
            disabled={filteredQueue.length === 0}
            style={{
              padding: '9px 18px',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              color: '#0F172A',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: filteredQueue.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="ti ti-download" /> Export
          </button>
          <button
            onClick={loadQueue}
            style={{
              padding: '9px 18px',
              background: '#0D9488',
              border: 'none',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="ti ti-refresh" /> Refresh Queue
          </button>
        </div>
      </div>

      {/* Permission Denied state */}
      {!isFinancialManager && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center' }}>
          <i className="ti ti-lock" style={{ fontSize: '32px', color: '#DC2626', marginBottom: '12px', display: 'inline-block' }} />
          <h3 style={{ margin: '0 0 8px', color: '#0F172A' }}>Permission Denied</h3>
          <p style={{ margin: 0, color: '#64748B', fontSize: '0.9rem' }}>
            The Manual Review Queue is restricted to Financial Managers per segregation of duties.
          </p>
        </div>
      )}

      {isFinancialManager && (
        <>
          {/* Filter Bar */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            {/* Search */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                Search Documents
              </label>
              <input
                type="text"
                placeholder="Alert ID, Document No, Client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
              />
            </div>

            {/* Score Range Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                Score Range
              </label>
              <select
                value={scoreFilter}
                onChange={(e) => setScoreFilter(e.target.value as any)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
              >
                <option value="ALL">All Scores</option>
                <option value="HIGH">90 to 100% (High Confidence)</option>
                <option value="MEDIUM">60 to 89% (Needs Review)</option>
              </select>
            </div>

            {/* Document Type Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                Document Type
              </label>
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value as any)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
              >
                <option value="ALL">All Types</option>
                <option value="INVOICE">Invoices</option>
                <option value="RECEIPT">Official Receipts</option>
              </select>
            </div>

            {/* Submitted By Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                Submitted By
              </label>
              <select
                value={submitterFilter}
                onChange={(e) => setSubmitterFilter(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
              >
                <option value="ALL">All Submitters</option>
                {submittersList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SCREEN E: Queue Table */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)',
            }}
          >
            {/* Loading Skeleton */}
            {loading && (
              <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ height: '52px', background: '#F1F5F9', borderRadius: '8px', animation: 'pulse 1.5s infinite ease-in-out' }} />
                ))}
              </div>
            )}

            {/* Error State */}
            {!loading && error && (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: '32px', color: '#DC2626', marginBottom: '12px', display: 'inline-block' }} />
                <h3 style={{ margin: '0 0 8px', color: '#0F172A' }}>Error Loading Review Queue</h3>
                <p style={{ margin: '0 0 16px', color: '#64748B', fontSize: '0.85rem' }}>{error}</p>
                <button
                  onClick={loadQueue}
                  style={{ padding: '8px 20px', background: '#0D9488', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Empty State: "No documents waiting for review." */}
            {!loading && !error && filteredQueue.length === 0 && (
              <div style={{ padding: '64px 24px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0FDFA', color: '#0D9488', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <i className="ti ti-check" style={{ fontSize: '28px' }} />
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                  No documents waiting for review.
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                  All flagged items have been cleared, returned, or marked as confirmed duplicates.
                </p>
              </div>
            )}

            {/* Queue Table */}
            {!loading && !error && filteredQueue.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '14px 18px' }}>Alert ID</th>
                      <th style={{ padding: '14px 18px' }}>Submitted By</th>
                      <th style={{ padding: '14px 18px' }}>Submitted At</th>
                      <th style={{ padding: '14px 18px' }}>Document No.</th>
                      <th style={{ padding: '14px 18px' }}>Client</th>
                      <th style={{ padding: '14px 18px' }}>Match Score</th>
                      <th style={{ padding: '14px 18px', textAlign: 'center' }}>Conflict</th>
                      <th style={{ padding: '14px 18px' }}>Status</th>
                      <th style={{ padding: '14px 18px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueue.map((item) => (
                      <tr
                        key={item.alertId}
                        style={{ borderBottom: '1px solid #F1F5F9', background: '#FFFFFF', transition: 'background 0.15s ease' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                      >
                        <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0F172A' }}>
                          {item.alertId}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#334155' }}>
                          {item.submittedBy}
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
                        <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                          {item.documentNo}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#334155' }}>
                          {item.clientName}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span
                            style={{
                              fontWeight: 800,
                              color: item.matchScore >= 90 ? '#DC2626' : '#D97706',
                            }}
                          >
                            {item.matchScore}%
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          {item.conflictFlag ? (
                            <span title={item.conflictReason || 'Conflicting master record'} style={{ color: '#D97706', cursor: 'help' }}>
                              <i className="ti ti-flag-filled" style={{ fontSize: '17px' }} />
                            </span>
                          ) : (
                            <span style={{ color: '#CBD5E1' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FCD34D', padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenReview(item)}
                            style={{
                              padding: '7px 18px',
                              background: '#0D9488',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(13, 148, 136, 0.2)',
                            }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* SCREEN F: Duplicate Record Comparison Modal (Alert #ID) */}
      {activeAlert && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.85)',
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
              maxWidth: 1040,
              width: '100%',
              maxHeight: '94vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                  Duplicate Record Comparison (Alert #{activeAlert.alertId})
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  Document {activeAlert.documentNo} • Submitted by {activeAlert.submittedBy}
                </span>
              </div>
              <button
                onClick={() => setActiveAlert(null)}
                style={{ background: 'none', border: 'none', fontSize: '22px', color: '#64748B', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content Scrollable Area */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Top Banner: Matching Factors Confidence */}
              <div
                style={{
                  background: activeAlert.matchScore >= 90 ? '#FEF2F2' : '#FFFBEB',
                  border: `1.5px solid ${activeAlert.matchScore >= 90 ? '#FECACA' : '#FDE68A'}`,
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '1rem',
                      fontWeight: 800,
                      color: activeAlert.matchScore >= 90 ? '#DC2626' : '#D97706',
                      marginBottom: '2px',
                    }}
                  >
                    Matching Factors Confidence: {activeAlert.matchScore}%
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                    {activeAlert.conflictFlag
                      ? 'Conflicting records flag active: Client ID or Invoice ID mismatch.'
                      : activeAlert.matchScore >= 90
                      ? 'Exact parameters match detected against existing billing record in FOMS.'
                      : 'Partial similarity detected across amount and client fields. Requires human evaluation.'}
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                  Document Type: {activeAlert.documentType}
                </div>
              </div>

              {/* Accountant's Submission Note shown in a quote box with submitter name and time */}
              <div
                style={{
                  background: '#F8FAFC',
                  borderLeft: '4px solid #0D9488',
                  borderRadius: '0 10px 10px 0',
                  padding: '14px 18px',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Accountant Submission Note
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '0.875rem', fontStyle: 'italic', color: '#1E293B' }}>
                  "{activeAlert.submissionNote || 'No specific note entered during submission.'}"
                </p>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Submitted by {activeAlert.submittedBy} on{' '}
                  {new Date(activeAlert.submittedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              {/* Separation of Duties Warning if submitter is current user */}
              {activeAlert.submittedById === currentUserId && (
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1.5px solid #FCA5A5',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    color: '#991B1B',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <i className="ti ti-shield-alert" style={{ fontSize: '24px', flexShrink: 0 }} />
                  <div>
                    <strong>Separation of Duties Notice:</strong> You submitted this document ({activeAlert.submittedBy}).
                    Under Speedex governance policy, the person who submitted an item cannot decide it. Another Financial Manager must record the final decision.
                  </div>
                </div>
              )}

              {/* Image comparison with zoom controls (1.00x, plus/minus) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                    Document Image Comparison
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))}
                      style={{ padding: '3px 9px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', minWidth: '45px', textAlign: 'center' }}>
                      {zoomLevel.toFixed(2)}x
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.min(2.0, Number((z + 0.2).toFixed(1))))}
                      style={{ padding: '3px 9px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomLevel(1)}
                      style={{ padding: '3px 9px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Image 1: Uploaded */}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', background: '#0F172A', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <img
                      src={activeAlert.uploadedDocument.previewUrl}
                      alt="Uploaded Document"
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'center center',
                        transition: 'transform 0.1s ease',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                      }}
                    />
                    <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(15, 23, 42, 0.75)', color: '#FFFFFF', fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px' }}>
                      Uploaded: {activeAlert.uploadedDocument.fileName}
                    </div>
                  </div>

                  {/* Image 2: Existing */}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', background: '#0F172A', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <img
                      src={activeAlert.existingRecord?.previewUrl || '/mock-receipt.png'}
                      alt="Existing Matching Record"
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'center center',
                        transition: 'transform 0.1s ease',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                      }}
                    />
                    <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(15, 23, 42, 0.75)', color: '#FFFFFF', fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px' }}>
                      Existing FOMS: {activeAlert.existingRecord?.recordId || 'Record'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Two columns: "Original Record Details" and "Possible Matching Record" (differing values highlighted in amber) */}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', marginBottom: '10px', textTransform: 'uppercase' }}>
                  Side by Side Parameter Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Column 1: Original Uploaded */}
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0F172A', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                      Original Record Details (Uploaded)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                      <div>
                        <span style={{ color: '#64748B' }}>amount:</span>{' '}
                        <strong>
                          ₱
                          {activeAlert.uploadedDocument.extracted.amount.value !== null
                            ? activeAlert.uploadedDocument.extracted.amount.value.toLocaleString('en-PH', { minimumFractionDigits: 2 })
                            : 'Not read'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>dueDate / date:</span>{' '}
                        <strong>{activeAlert.uploadedDocument.extracted.transactionDate.value || 'Not read'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>clientId:</span>{' '}
                        <strong>CLI-0012</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>invoiceId / docNo:</span>{' '}
                        <strong>{activeAlert.documentNo}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>clientName:</span>{' '}
                        <strong>{activeAlert.clientName}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>updatedAt:</span>{' '}
                        <strong>{new Date(activeAlert.submittedAt).toLocaleDateString()}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Possible Matching Record */}
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0F172A', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                      Possible Matching Record (Existing FOMS)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                      {/* Highlight differing values in amber */}
                      <div>
                        <span style={{ color: '#64748B' }}>amount:</span>{' '}
                        <strong
                          style={{
                            background:
                              activeAlert.existingRecord?.amount !== activeAlert.uploadedDocument.extracted.amount.value
                                ? '#FEF3C7'
                                : 'transparent',
                            padding: '1px 4px',
                            borderRadius: '4px',
                          }}
                        >
                          ₱
                          {activeAlert.existingRecord?.amount !== null && activeAlert.existingRecord?.amount !== undefined
                            ? activeAlert.existingRecord.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })
                            : 'None'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>dueDate:</span>{' '}
                        <strong
                          style={{
                            background:
                              activeAlert.existingRecord?.dueDate !== activeAlert.uploadedDocument.extracted.transactionDate.value
                                ? '#FEF3C7'
                                : 'transparent',
                            padding: '1px 4px',
                            borderRadius: '4px',
                          }}
                        >
                          {activeAlert.existingRecord?.dueDate || 'None'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>clientId:</span>{' '}
                        <strong
                          style={{
                            background: activeAlert.conflictFlag ? '#FEF3C7' : 'transparent',
                            padding: '1px 4px',
                            borderRadius: '4px',
                          }}
                        >
                          {String(activeAlert.existingRecord?.clientId || 'None')}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>invoiceId:</span>{' '}
                        <strong>{String(activeAlert.existingRecord?.invoiceId || 'None')}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>clientName:</span>{' '}
                        <strong
                          style={{
                            background:
                              activeAlert.existingRecord?.clientName !== activeAlert.clientName ? '#FEF3C7' : 'transparent',
                            padding: '1px 4px',
                            borderRadius: '4px',
                          }}
                        >
                          {activeAlert.existingRecord?.clientName || 'None'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>updatedAt:</span>{' '}
                        <strong>{activeAlert.existingRecord?.updatedAt || 'None'}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Human Validation Form: "Log Human Validation Action" */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '12px',
                  padding: '20px',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F172A', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-checklist" style={{ fontSize: '18px', color: '#0D9488' }} />
                  Log Human Validation Action
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Review Decision */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Review Decision *
                    </label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {[
                        { key: 'DUPLICATE', label: 'Mark as Duplicate' },
                        { key: 'UNIQUE', label: 'Mark as Unique' },
                        { key: 'RETURNED', label: 'Return to Accountant' },
                      ].map((opt) => (
                        <label
                          key={opt.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: decision === opt.key ? '#F0FDFA' : '#FFFFFF',
                            border: `1.5px solid ${decision === opt.key ? '#0D9488' : '#CBD5E1'}`,
                            fontSize: '0.85rem',
                            fontWeight: decision === opt.key ? 700 : 500,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="radio"
                            name="reviewDecision"
                            checked={decision === opt.key}
                            onChange={() => setDecision(opt.key as any)}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Fields shown only for Mark as Duplicate */}
                  {decision === 'DUPLICATE' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                      {/* Duplicate Reason */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                          Duplicate Reason *
                        </label>
                        <select
                          value={duplicateReason}
                          onChange={(e) => setDuplicateReason(e.target.value as any)}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                        >
                          <option value="Same reference number">Same reference number</option>
                          <option value="Same invoice number">Same invoice number</option>
                          <option value="Same amount and client">Same amount and client</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      {/* Recommended Legacy Action */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                          Recommended Legacy Action *
                        </label>
                        <select
                          value={recommendedAction}
                          onChange={(e) => setRecommendedAction(e.target.value as any)}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                        >
                          <option value="Flag and Block New Submission">Flag and Block New Submission</option>
                          <option value="Keep for Investigation">Keep for Investigation</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Remarks / Audit Notes (Required) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Remarks / Audit Notes * <span style={{ color: '#DC2626' }}>(Required)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder={
                        decision === 'DUPLICATE'
                          ? 'Provide audit rationale for confirming duplicate status...'
                          : decision === 'UNIQUE'
                          ? 'Explain why this document is verified unique despite AI match score...'
                          : 'State required changes or rescan instructions for the submitting Accountant...'
                      }
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.85rem',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  {/* Warning note */}
                  <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-database-export" style={{ color: '#0D9488' }} />
                    Submitting writes the review decision to the legacy FOMS database.
                  </div>
                </div>
              </div>
            </div>

            {/* Inline Error Notice */}
            {decisionError && (
              <div style={{ padding: '0 24px 16px 24px' }}>
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1.5px solid #FECACA',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#DC2626',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className="ti ti-alert-circle" style={{ fontSize: '18px' }} />
                  <span>{decisionError}</span>
                </div>
              </div>
            )}

            {/* Modal Footer Buttons */}
            <div
              style={{
                padding: '16px 24px',
                background: '#F8FAFC',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveAlert(null)}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#64748B',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitDecision}
                disabled={isSubmittingDecision || activeAlert.submittedById === currentUserId}
                style={{
                  padding: '9px 26px',
                  borderRadius: '8px',
                  background: activeAlert.submittedById === currentUserId ? '#94A3B8' : '#0D9488',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  cursor: isSubmittingDecision || activeAlert.submittedById === currentUserId ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 4px rgba(13, 148, 136, 0.2)',
                }}
              >
                {isSubmittingDecision ? 'Submitting...' : 'Submit Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualReviewQueue;
