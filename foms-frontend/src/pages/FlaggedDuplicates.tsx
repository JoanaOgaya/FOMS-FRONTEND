/**
 * src/pages/FlaggedDuplicates.tsx
 * Screen G: Flagged Duplicate Documents
 * Table: Flag ID, Type, Uploaded Number, Existing Record, Client Name, Match Score, Submitted By, Decided By, Decided At.
 * Search, Document Type filter, Export.
 * Row click opens a read-only comparison modal.
 * States: loading skeleton, empty, error, low-confidence extraction, and permission denied.
 * No em dashes in any UI text.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { duplicateScanService } from '../services/duplicateScanService';
import type { DuplicateAlert } from '../types/duplicateScan';

export const FlaggedDuplicates: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [alerts, setAlerts] = useState<DuplicateAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'ALL' | 'INVOICE' | 'RECEIPT'>('ALL');

  // Read-only modal
  const [activeAlert, setActiveAlert] = useState<DuplicateAlert | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await duplicateScanService.getFlaggedDuplicates();
      setAlerts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load flagged duplicate documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered list
  const filteredList = useMemo(() => {
    return alerts.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        item.alertId.toLowerCase().includes(q) ||
        item.documentNo.toLowerCase().includes(q) ||
        item.clientName.toLowerCase().includes(q) ||
        item.submittedBy.toLowerCase().includes(q) ||
        (item.existingRecord?.recordId && item.existingRecord.recordId.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (docTypeFilter === 'INVOICE' && !item.documentType.toLowerCase().includes('invoice')) return false;
      if (docTypeFilter === 'RECEIPT' && !item.documentType.toLowerCase().includes('receipt')) return false;

      return true;
    });
  }, [alerts, searchQuery, docTypeFilter]);

  // Export CSV
  const handleExport = () => {
    const headers = [
      'Flag ID',
      'Type',
      'Uploaded Number',
      'Existing Record',
      'Client Name',
      'Match Score',
      'Submitted By',
      'Decided By',
      'Decided At',
    ];
    const rows = filteredList.map((item) => [
      item.alertId,
      item.documentType,
      item.documentNo,
      item.existingRecord?.recordId || 'None',
      item.clientName,
      `${item.matchScore}%`,
      item.submittedBy,
      item.reviewedBy || 'Pending Decision',
      item.reviewedAt ? new Date(item.reviewedAt).toLocaleDateString() : 'N/A',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((v) => `"${v}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `flagged_duplicates_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Flagged duplicate documents exported.', 'Export Complete');
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
            Flagged Duplicate Documents
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#64748B', margin: 0 }}>
            Archive of confirmed duplicate submissions and high-confidence alerts for operational reference.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleExport}
            disabled={filteredList.length === 0}
            style={{
              padding: '9px 18px',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              color: '#0F172A',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: filteredList.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="ti ti-download" /> Export
          </button>
          <button
            onClick={loadData}
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
            <i className="ti ti-refresh" /> Refresh
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
            Search Documents
          </label>
          <input
            type="text"
            placeholder="Flag ID, Uploaded Number, Existing Record, Client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
            Document Type
          </label>
          <select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value as any)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
          >
            <option value="ALL">All Document Types</option>
            <option value="INVOICE">Invoices</option>
            <option value="RECEIPT">Official Receipts</option>
          </select>
        </div>
      </div>

      {/* Screen G Table */}
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
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: '50px', background: '#F1F5F9', borderRadius: '8px', animation: 'pulse 1.5s infinite ease-in-out' }} />
            ))}
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: '32px', color: '#DC2626', marginBottom: '12px', display: 'inline-block' }} />
            <h3 style={{ margin: '0 0 8px', color: '#0F172A' }}>Failed to Load Flagged Duplicates</h3>
            <p style={{ margin: '0 0 16px', color: '#64748B', fontSize: '0.85rem' }}>{error}</p>
            <button
              onClick={loadData}
              style={{ padding: '8px 20px', background: '#0D9488', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredList.length === 0 && (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F8FAFC', color: '#94A3B8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <i className="ti ti-files" style={{ fontSize: '28px' }} />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
              No Flagged Duplicates Found
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
              There are no confirmed duplicate records matching your filter parameters.
            </p>
          </div>
        )}

        {/* Data Table */}
        {!loading && !error && filteredList.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '14px 18px' }}>Flag ID</th>
                  <th style={{ padding: '14px 18px' }}>Type</th>
                  <th style={{ padding: '14px 18px' }}>Uploaded Number</th>
                  <th style={{ padding: '14px 18px' }}>Existing Record</th>
                  <th style={{ padding: '14px 18px' }}>Client Name</th>
                  <th style={{ padding: '14px 18px' }}>Match Score</th>
                  <th style={{ padding: '14px 18px' }}>Submitted By</th>
                  <th style={{ padding: '14px 18px' }}>Decided By</th>
                  <th style={{ padding: '14px 18px' }}>Decided At</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((item) => (
                  <tr
                    key={item.alertId}
                    onClick={() => setActiveAlert(item)}
                    style={{ borderBottom: '1px solid #F1F5F9', background: '#FFFFFF', cursor: 'pointer', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                  >
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0F172A' }}>
                      {item.alertId}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#334155' }}>
                      {item.documentType}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                      {item.documentNo}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#475569' }}>
                      {item.existingRecord?.recordId || 'None'}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#0F172A' }}>
                      {item.clientName}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ fontWeight: 800, color: '#DC2626' }}>
                        {item.matchScore}%
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: '#64748B' }}>
                      {item.submittedBy}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#334155' }}>
                      {item.reviewedBy || <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Pending</span>}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#64748B' }}>
                      {item.reviewedAt
                        ? new Date(item.reviewedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Read-only comparison modal */}
      {activeAlert && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
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
                  Flagged Duplicate Review (Flag #{activeAlert.alertId})
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  Document {activeAlert.documentNo} • {activeAlert.clientName}
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
              {/* Decision Summary */}
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#DC2626', fontSize: '0.95rem', marginBottom: '2px' }}>
                    Confirmed Duplicate Record
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                    Reason: {activeAlert.duplicateReason || 'Matched existing invoice number and amount'} • Action: {activeAlert.recommendedAction || 'Flag and Block New Submission'}
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#DC2626' }}>
                  {activeAlert.matchScore}%
                </div>
              </div>

              {/* Audit Notes */}
              {activeAlert.auditNotes && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 18px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                    Financial Manager Audit Notes
                  </span>
                  <div style={{ fontSize: '0.85rem', color: '#1E293B', fontStyle: 'italic' }}>
                    "{activeAlert.auditNotes}"
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '6px' }}>
                    Decided by {activeAlert.reviewedBy || 'Financial Manager'} on{' '}
                    {activeAlert.reviewedAt ? new Date(activeAlert.reviewedAt).toLocaleString() : 'N/A'}
                  </div>
                </div>
              )}

              {/* Comparison Parameters Matrix */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px' }}>Field</th>
                      <th style={{ padding: '10px 14px' }}>Uploaded Document</th>
                      <th style={{ padding: '10px 14px' }}>Existing FOMS Record</th>
                      <th style={{ padding: '10px 14px' }}>Match Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeAlert.matrix.map((row) => (
                      <tr key={row.fieldKey} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>{row.fieldLabel}</td>
                        <td style={{ padding: '10px 14px', color: '#0F172A' }}>
                          {row.uploadedValue !== null ? String(row.uploadedValue) : 'Not read'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#0F172A' }}>
                          {row.existingValue !== null ? String(row.existingValue) : 'None'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontWeight: 700, color: row.matchResult === 'EXACT_MATCH' ? '#DC2626' : row.matchResult === 'PARTIAL_MATCH' ? '#D97706' : '#64748B' }}>
                            {row.matchResult.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: '14px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', textAlign: 'right' }}>
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
    </div>
  );
};

export default FlaggedDuplicates;
