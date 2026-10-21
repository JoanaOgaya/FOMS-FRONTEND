import React, { useState, useEffect } from 'react';

export interface ComparisonCandidate {
  matchId: string;
  matchedDocumentId: string;
  documentNumber: string;
  clientName: string;
  date: string;
  amount: number;
  referenceNumber: string;
  paymentMethod: string;
  sourceModule: string;
  uploadedBy: string;
  fileUrl: string;
  similarityScore: number;
  matchedFields: string[];
}

export interface ScannedDocDetails {
  documentNumber: string;
  clientName: string;
  date: string;
  amount: number;
  referenceNumber: string;
  paymentMethod: string;
  fileUrl: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  scannedDoc: ScannedDocDetails;
  candidates: ComparisonCandidate[];
  onDecide?: (candidate: ComparisonCandidate) => void;
  isReviewMode?: boolean;
}

export const DuplicateComparisonModal: React.FC<Props> = ({
  isOpen,
  onClose,
  scannedDoc,
  candidates,
  onDecide,
  isReviewMode = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoomLeft, setZoomLeft] = useState(1);
  const [zoomRight, setZoomRight] = useState(1);

  const activeCandidate = candidates[currentIndex] || candidates[0];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && currentIndex < candidates.length - 1) setCurrentIndex(i => i + 1);
      if (e.key === 'ArrowLeft' && currentIndex > 0) setCurrentIndex(i => i - 1);
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, candidates.length, onClose]);

  if (!isOpen || !activeCandidate) return null;

  const compareField = (uploadedVal: string | number, existingVal: string | number, fieldKey: string) => {
    const isMatched =
      activeCandidate.matchedFields.includes(fieldKey) ||
      String(uploadedVal).trim().toLowerCase() === String(existingVal).trim().toLowerCase();
    return {
      isMatched,
      style: isMatched
        ? { background: '#D1FAE5', color: '#065F46', fontWeight: 700 }
        : { background: '#FEE2E2', color: '#991B1B', fontWeight: 600 },
    };
  };

  const fields = [
    { label: 'Document Number', key: 'documentNumber', val1: scannedDoc.documentNumber, val2: activeCandidate.documentNumber },
    { label: 'Client Name', key: 'clientName', val1: scannedDoc.clientName, val2: activeCandidate.clientName },
    { label: 'Date Issued', key: 'date', val1: scannedDoc.date, val2: activeCandidate.date },
    {
      label: 'Amount (PHP)',
      key: 'amount',
      val1: `₱${Number(scannedDoc.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      val2: `₱${Number(activeCandidate.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    },
    { label: 'Reference Number', key: 'referenceNumber', val1: scannedDoc.referenceNumber, val2: activeCandidate.referenceNumber },
    { label: 'Payment Method', key: 'paymentMethod', val1: scannedDoc.paymentMethod, val2: activeCandidate.paymentMethod },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1180px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#FFFFFF',
          }}
        >
          <div>
            <h2 id="comparison-modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
              Side-by-Side Document Comparison {isReviewMode ? '(Finance Manager Review)' : ''}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
              Review visual discrepancies and extracted field values before submitting validation.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {candidates.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex(i => i - 1)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <i className="ti ti-chevron-left" /> Previous
                </button>
                <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                  Match {currentIndex + 1} of {candidates.length}
                </span>
                <button
                  type="button"
                  disabled={currentIndex === candidates.length - 1}
                  onClick={() => setCurrentIndex(i => i + 1)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    cursor: currentIndex === candidates.length - 1 ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Next <i className="ti ti-chevron-right" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comparison view"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748B',
                fontSize: '20px',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="ti ti-x" />
            </button>
          </div>
        </div>

        {/* Dual Document Viewport */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            padding: '16px 24px',
            background: '#F8FAFC',
            flex: 1,
            overflowY: 'auto',
          }}
        >
          {/* Left: Newly Scanned Document */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase' }}>
                Newly Scanned Upload
              </span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setZoomLeft(z => Math.max(z - 0.2, 0.6))}
                  style={{ padding: '2px 8px', border: '1px solid #CBD5E1', borderRadius: '4px', background: '#fff' }}
                >
                  -
                </button>
                <span style={{ fontSize: '0.75rem', padding: '2px 6px', fontWeight: 600 }}>
                  {Math.round(zoomLeft * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLeft(z => Math.min(z + 0.2, 2.0))}
                  style={{ padding: '2px 8px', border: '1px solid #CBD5E1', borderRadius: '4px', background: '#fff' }}
                >
                  +
                </button>
              </div>
            </div>
            <div
              style={{
                overflow: 'auto',
                height: '280px',
                background: '#0F172A',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={scannedDoc.fileUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' fill='none' viewBox='0 0 24 24' stroke='%2394A3B8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'/%3E%3C/svg%3E"}
                alt="Newly Scanned Document"
                style={{
                  transform: `scale(${zoomLeft})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>

          {/* Right: Existing Matched Document */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#C2410C', textTransform: 'uppercase' }}>
                  Existing Record
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    background: '#FFEDD5',
                    color: '#9A3412',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  {(activeCandidate.similarityScore * 100).toFixed(1)}% Match
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setZoomRight(z => Math.max(z - 0.2, 0.6))}
                  style={{ padding: '2px 8px', border: '1px solid #CBD5E1', borderRadius: '4px', background: '#fff' }}
                >
                  -
                </button>
                <span style={{ fontSize: '0.75rem', padding: '2px 6px', fontWeight: 600 }}>
                  {Math.round(zoomRight * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomRight(z => Math.min(z + 0.2, 2.0))}
                  style={{ padding: '2px 8px', border: '1px solid #CBD5E1', borderRadius: '4px', background: '#fff' }}
                >
                  +
                </button>
              </div>
            </div>
            <div
              style={{
                overflow: 'auto',
                height: '280px',
                background: '#0F172A',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={activeCandidate.fileUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' fill='none' viewBox='0 0 24 24' stroke='%2394A3B8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'/%3E%3C/svg%3E"}
                alt="Existing Matched Document"
                style={{
                  transform: `scale(${zoomRight})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>
        </div>

        {/* Field-by-Field Comparison Table */}
        <div style={{ padding: '16px 24px', background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
            Field-by-Field Comparison Table
          </h3>
          <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Field Name</th>
                  <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Scanned Document</th>
                  <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Existing Matched Document</th>
                  <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {fields.map(f => {
                  const diff = compareField(f.val1, f.val2, f.key);
                  return (
                    <tr key={f.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#334155' }}>{f.label}</td>
                      <td style={{ padding: '8px 12px', color: '#0F172A' }}>{f.val1 || 'N/A'}</td>
                      <td style={{ padding: '8px 12px', color: '#0F172A' }}>{f.val2 || 'N/A'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{ ...diff.style, padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                          {diff.isMatched ? 'Exact Match' : 'Discrepancy'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            background: '#FFFFFF',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#475569',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close View
          </button>
          {onDecide && (
            <button
              type="button"
              onClick={() => {
                onDecide(activeCandidate);
                onClose();
              }}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: '#0D9488',
                color: '#FFFFFF',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Proceed to Decision
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
