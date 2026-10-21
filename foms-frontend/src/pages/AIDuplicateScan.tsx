/**
 * src/pages/AIDuplicateScan.tsx
 * Screens A, B, and C of the AI Duplicate Scan module (AFIL).
 * Role: Accountant (Financial Managers do not upload documents in this module).
 * Speedex Design System: Teal primary (#0D9488), Navy headers, Red danger (#DC2626), Amber warning (#D97706).
 * No em dashes anywhere in UI text.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { useNavigate } from 'react-router-dom';
import { duplicateScanService } from '../services/duplicateScanService';
import type {
  DuplicateScanResult,
  ComparisonMatrixRow,
  MatchResultType,
} from '../types/duplicateScan';

/* ─────────────────────────────────────────────
   Camera Scanner Modal
───────────────────────────────────────────── */
const CameraScannerModal: React.FC<{
  onCapture: (file: File) => void;
  onClose: () => void;
}> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setError(null);
    } catch {
      setError('Camera access denied or device has no camera. Please choose a file from your device.');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const handleSnap = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    setCapturedUrl(dataUrl);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const handleRetake = () => {
    setCapturedUrl(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (!capturedUrl) return;
    fetch(capturedUrl)
      .then((r) => r.blob())
      .then((blob) => {
        const file = new File([blob], `receipt_scan_${Date.now()}.png`, { type: 'image/png' });
        onCapture(file);
        onClose();
      });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#0F172A',
          color: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: 640,
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1E293B' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-camera" style={{ fontSize: '18px', color: '#FFFFFF' }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Scan Receipt / Invoice</div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Position document within the camera frame</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '20px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px', textAlign: 'center' }}>
          {error ? (
            <div style={{ background: '#7F1D1D', color: '#FECACA', padding: '16px', borderRadius: '10px', fontSize: '0.85rem' }}>
              <i className="ti ti-alert-triangle" style={{ marginRight: '8px' }} />
              {error}
            </div>
          ) : (
            <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#020617', minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!capturedUrl ? (
                <>
                  <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxHeight: 420, objectFit: 'cover' }} />
                  <div
                    style={{
                      position: 'absolute',
                      inset: '24px',
                      border: '2px dashed rgba(13, 148, 136, 0.7)',
                      borderRadius: '12px',
                      pointerEvents: 'none',
                    }}
                  />
                </>
              ) : (
                <img src={capturedUrl} alt="Captured receipt" style={{ width: '100%', maxHeight: 420, objectFit: 'contain' }} />
              )}
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          )}
        </div>

        <div style={{ padding: '16px 20px', background: '#020617', borderTop: '1px solid #1E293B', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #334155', background: 'transparent', color: '#CBD5E1', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Cancel
          </button>
          {!capturedUrl ? (
            <button
              onClick={handleSnap}
              disabled={!!error}
              style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: '#0D9488', color: '#FFFFFF', fontWeight: 700, fontSize: '0.85rem', cursor: error ? 'not-allowed' : 'pointer' }}
            >
              Capture Document
            </button>
          ) : (
            <>
              <button
                onClick={handleRetake}
                style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #334155', background: '#1E293B', color: '#FFFFFF', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Retake
              </button>
              <button
                onClick={handleConfirm}
                style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: '#0D9488', color: '#FFFFFF', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Use This Image
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Zoom Modal for Document Cards
───────────────────────────────────────────── */
const ImageZoomModal: React.FC<{
  title: string;
  imageUrl: string;
  onClose: () => void;
}> = ({ title, imageUrl, onClose }) => {
  const [zoom, setZoom] = useState(1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0F172A',
          color: '#FFFFFF',
          borderRadius: '16px',
          width: '95%',
          maxWidth: 900,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #1E293B' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))}
              style={{ padding: '4px 10px', background: '#1E293B', border: '1px solid #334155', color: '#FFFFFF', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              -
            </button>
            <span style={{ fontSize: '0.8rem', color: '#94A3B8', minWidth: '45px', textAlign: 'center' }}>
              {(zoom * 100).toFixed(0)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.2).toFixed(1))))}
              style={{ padding: '4px 10px', background: '#1E293B', border: '1px solid #334155', color: '#FFFFFF', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              +
            </button>
            <button
              onClick={onClose}
              style={{ marginLeft: '12px', background: 'none', border: 'none', color: '#94A3B8', fontSize: '20px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>
        <div style={{ padding: '24px', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, background: '#020617' }}>
          <img
            src={imageUrl}
            alt={title}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/mock-receipt.png';
            }}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease',
              maxWidth: '100%',
              maxHeight: '65vh',
              objectFit: 'contain',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              borderRadius: '8px',
            }}
          />
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Main AIDuplicateScan Page Component
───────────────────────────────────────────── */
import { ROLES } from '../types/auth';

export const AIDuplicateScan: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Role verification: Only Accountant can scan/upload
  const isAccountant =
    user?.role === ROLES.ACCOUNTANT ||
    user?.role === ROLES.ASSISTANT_FM;

  const isAFM = user?.role === ROLES.ASSISTANT_FM || user?.employeeId === 'EMP-004';
  const effectiveRole = user?.role || (isAFM ? 'Assistant of Financial Manager' : 'Accountant');
  const effectiveName = user?.fullName || (isAFM ? 'Joana Marie Ogaya' : 'Maria Mariel Jane Anonuevo');
  const effectiveId = user?.employeeId || (isAFM ? 'EMP-004' : 'EMP-003');

  // Screen state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0); // 0: Uploading, 1: Extracting fields, 2: Searching records, 3: Scoring
  const [scanResult, setScanResult] = useState<DuplicateScanResult | null>(null);
  const [submissionNote, setSubmissionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingUnique, setIsConfirmingUnique] = useState(false);
  const [showConfirmUniqueModal, setShowConfirmUniqueModal] = useState(false);
  const [uniqueModalNote, setUniqueModalNote] = useState('');
  const [existingImgError, setExistingImgError] = useState(false);

  // Modals
  const [showCamera, setShowCamera] = useState(false);
  const [zoomModalData, setZoomModalData] = useState<{ title: string; url: string } | null>(null);

  const [returnedCount, setReturnedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<NodeJS.Timeout[]>([]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      scanTimerRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Fetch returned submissions count for Accountant alert notice
  useEffect(() => {
    if (isAccountant) {
      duplicateScanService
        .getMySubmissions(user?.employeeId)
        .then((items) => {
          setReturnedCount(items.filter((a) => a.status === 'Returned').length);
        })
        .catch(() => {});
    }
  }, [user, isAccountant]);

  // Allowed file validation
  const validateAndSelectFile = (file: File) => {
    setInlineError(null);
    const validExtensions = ['jpg', 'jpeg', 'png'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (!validExtensions.includes(ext)) {
      setInlineError('Unsupported file type. Please upload JPG, JPEG, or PNG receipt statements only.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setInlineError('File size exceeds the 10MB limit. Please upload a smaller receipt or invoice image.');
      return;
    }

    setSelectedFile(file);
    const preview = URL.createObjectURL(file);
    setFilePreview(preview);
    setScanResult(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Step B: Scanning state execution
  const handleStartScan = async () => {
    if (!selectedFile) return;
    setIsScanning(true);
    setScanStepIndex(0);
    setInlineError(null);

    // Simulate progressive step transitions for authentic UX
    const t1 = setTimeout(() => setScanStepIndex(1), 700);
    const t2 = setTimeout(() => setScanStepIndex(2), 1400);
    const t3 = setTimeout(() => setScanStepIndex(3), 2100);
    scanTimerRef.current = [t1, t2, t3];

    try {
      setExistingImgError(false);
      const result = await duplicateScanService.scanDocument(
        selectedFile,
        effectiveRole,
        effectiveName,
        effectiveId
      );

      setTimeout(() => {
        setIsScanning(false);
        setScanResult(result);

        // Toast by result
        if (result.matchScore >= 60) {
          toast.warning(`AI Gemini Scan: Duplicate detected (${result.matchScore}% similarity)`, 'Duplicate Alert');
        } else {
          toast.success(`AI Gemini Scan: Clean document (${result.matchScore}% similarity)`, 'Scan Complete');
        }
      }, 2600);
    } catch (err: any) {
      setIsScanning(false);
      setInlineError(err.message || 'An error occurred while scanning the document. Please try again.');
    }
  };

  const handleCancelScan = () => {
    scanTimerRef.current.forEach((t) => clearTimeout(t));
    setIsScanning(false);
    setScanStepIndex(0);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setScanResult(null);
    setInlineError(null);
    setSubmissionNote('');
    setExistingImgError(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Step 5 & 6: Submit for Manual Review (60+)
  const handleSubmitForReview = async () => {
    if (!scanResult) return;
    setIsSubmitting(true);
    try {
      const res = await duplicateScanService.submitForManualReview(
        scanResult,
        submissionNote,
        effectiveName,
        effectiveId
      );
      toast.success(res.message, 'Submitted for Review');
      navigate('/my-submissions');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit document for review.', 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 5: Confirm as Unique Document
  const handleConfirmUnique = async (customNote?: string) => {
    if (!scanResult) return;
    setIsConfirmingUnique(true);
    try {
      const noteToSave = customNote !== undefined ? customNote : (uniqueModalNote || submissionNote);
      const res = await duplicateScanService.confirmAsUniqueDocument(
        scanResult,
        effectiveName,
        effectiveId,
        noteToSave
      );
      toast.success(res.message, 'Saved to Unique Documents');
      setShowConfirmUniqueModal(false);
      navigate('/unique-documents');
    } catch (err: any) {
      toast.error(err.message || 'Failed to confirm document as unique.', 'Error');
    } finally {
      setIsConfirmingUnique(false);
    }
  };

  const formatBadge = (match: MatchResultType) => {
    switch (match) {
      case 'EXACT_MATCH':
        return (
          <span style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '3px 9px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
            Exact Match
          </span>
        );
      case 'PARTIAL_MATCH':
        return (
          <span style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FCD34D', padding: '3px 9px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
            Partial Match
          </span>
        );
      case 'NO_MATCH':
        return (
          <span style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', padding: '3px 9px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
            No Match
          </span>
        );
      case 'NOT_READ':
        return (
          <span style={{ background: '#FFFFFF', color: '#94A3B8', border: '1px dashed #CBD5E1', padding: '3px 9px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
            Not read
          </span>
        );
    }
  };

  const formatFieldValue = (val: string | number | null | undefined) => {
    if (val === null || val === undefined || val === '') {
      return <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Not read</span>;
    }
    if (typeof val === 'number') {
      return `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return String(val);
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
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0D9488', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
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

      {/* Returned Submissions Notification for Accountant */}
      {returnedCount > 0 && isAccountant && (
        <div
          style={{
            background: '#EFF6FF',
            border: '1.5px solid #93C5FD',
            borderRadius: '12px',
            padding: '14px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 1px 3px rgba(37,99,235,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2563EB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-arrow-back-up" style={{ fontSize: '20px' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1E3A8A' }}>
                Action Required: {returnedCount} document(s) returned by Financial Manager
              </div>
              <div style={{ fontSize: '0.8rem', color: '#2563EB' }}>
                Finance requested rescans or clarifications. Review their return feedback in My Submissions.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/my-submissions')}
            style={{
              padding: '8px 18px',
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.825rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Open My Submissions →
          </button>
        </div>
      )}

      {/* Permission Denied state if Financial Manager opens scan console */}
      {!isAccountant && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '48px 32px',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEF2F2', color: '#DC2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <i className="ti ti-lock" style={{ fontSize: '28px' }} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>
            Accountant Document Scanning Console
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#64748B', maxWidth: 480, margin: '0 auto 24px' }}>
            Financial Managers review the manual review queue and make decisions on flagged items. Document uploads and scans are restricted to Accountants per segregation of duties.
          </p>
          <button
            onClick={() => navigate('/manual-review-queue')}
            style={{ padding: '10px 24px', background: '#0D9488', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Go to Manual Review Queue
          </button>
        </div>
      )}

      {isAccountant && (
        <>
          {/* SCREEN A: Scan Console */}
          {!scanResult && !isScanning && (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '32px',
                marginBottom: '24px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              }}
            >
              <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>
                  Document Checking &amp; AI Scan Console
                </h1>
                <p style={{ fontSize: '0.9rem', color: '#64748B', margin: 0 }}>
                  Upload or scan invoice/receipt files to identify duplicate payments.
                </p>
              </div>

              {/* Dashed Dropzone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #0D9488',
                  borderRadius: '14px',
                  background: '#F8FAFC',
                  padding: '48px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: '#CCFBF1',
                    color: '#0D9488',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                  }}
                >
                  <i className="ti ti-cloud-upload" style={{ fontSize: '32px' }} />
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                  Drag &amp; Drop or Upload Document
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#64748B' }}>
                  Support JPG, JPEG, and PNG receipt statements up to 10MB.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    style={{
                      padding: '10px 24px',
                      background: '#0D9488',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(13, 148, 136, 0.2)',
                    }}
                  >
                    Choose File
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCamera(true);
                    }}
                    style={{
                      padding: '10px 22px',
                      background: '#FFFFFF',
                      color: '#0F172A',
                      border: '1.5px solid #CBD5E1',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <i className="ti ti-camera" style={{ fontSize: '18px', color: '#0D9488' }} />
                    Scan Document
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files?.[0] && validateAndSelectFile(e.target.files[0])}
                />
              </div>

              {/* Inline Error Message */}
              {inlineError && (
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <i className="ti ti-alert-circle" style={{ fontSize: '18px' }} />
                  {inlineError}
                </div>
              )}

              {/* File Selected Preview & Trigger Action */}
              {selectedFile && filePreview && (
                <div
                  style={{
                    background: '#F0FDFA',
                    border: '1px solid #99F6E4',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <img
                      src={filePreview}
                      alt="Selected preview"
                      style={{ width: 52, height: 52, borderRadius: '8px', objectFit: 'cover', border: '1px solid #CBD5E1' }}
                    />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F172A' }}>{selectedFile.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for Gemini vision extraction
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={handleReset}
                      style={{ padding: '9px 18px', background: '#FFFFFF', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleStartScan}
                      style={{ padding: '9px 24px', background: '#0D9488', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      Start AI Duplicate Scan
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SCREEN B: Scanning State */}
          {isScanning && (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '40px',
                marginBottom: '24px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                textAlign: 'center',
              }}
            >
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>
                Scanning Document...
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 28px' }}>
                Analyzing document credentials and comparing against existing FOMS records.
              </p>

              {/* Progress Steps */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
                {[
                  { step: 'Uploading', index: 0 },
                  { step: 'Extracting fields', index: 1 },
                  { step: 'Searching records', index: 2 },
                  { step: 'Scoring', index: 3 },
                ].map((item, idx) => {
                  const isDone = scanStepIndex > item.index;
                  const isCurrent = scanStepIndex === item.index;
                  return (
                    <div key={item.step} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: isDone ? '#0D9488' : isCurrent ? '#CCFBF1' : '#F1F5F9',
                          color: isDone ? '#FFFFFF' : isCurrent ? '#0D9488' : '#94A3B8',
                          border: isCurrent ? '2px solid #0D9488' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                        }}
                      >
                        {isDone ? '✓' : idx + 1}
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: isCurrent ? 800 : 600, color: isCurrent ? '#0F172A' : '#64748B' }}>
                        {item.step}
                      </span>
                      {idx < 3 && <span style={{ color: '#CBD5E1', margin: '0 4px' }}>→</span>}
                    </div>
                  );
                })}
              </div>

              {/* Document Preview in Scan State */}
              {filePreview && (
                <div style={{ display: 'inline-block', position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #CBD5E1', marginBottom: '24px', maxWidth: 320 }}>
                  <img src={filePreview} alt="Scanning preview" style={{ width: '100%', height: 220, objectFit: 'cover' }} />
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '4px',
                      background: 'linear-gradient(90deg, #0D9488, #2DD4BF, #0D9488)',
                      animation: 'scan-anim 1.5s infinite ease-in-out',
                    }}
                  />
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={handleCancelScan}
                  style={{
                    padding: '8px 24px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#64748B',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* SCREEN C: Scan Result Screen */}
          {scanResult && !isScanning && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Classification Header Banner */}
              <div
                style={{
                  background:
                    scanResult.classification === 'POSSIBLE_DUPLICATE'
                      ? '#FEF2F2'
                      : scanResult.classification === 'NEEDS_MANUAL_REVIEW'
                      ? '#FFFBEB'
                      : '#ECFDF5',
                  border: `1.5px solid ${
                    scanResult.classification === 'POSSIBLE_DUPLICATE'
                      ? '#FECACA'
                      : scanResult.classification === 'NEEDS_MANUAL_REVIEW'
                      ? '#FDE68A'
                      : '#A7F3D0'
                  }`,
                  borderRadius: '16px',
                  padding: '24px 28px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background:
                        scanResult.classification === 'POSSIBLE_DUPLICATE'
                          ? '#FEE2E2'
                          : scanResult.classification === 'NEEDS_MANUAL_REVIEW'
                          ? '#FEF3C7'
                          : '#D1FAE5',
                      color:
                        scanResult.classification === 'POSSIBLE_DUPLICATE'
                          ? '#DC2626'
                          : scanResult.classification === 'NEEDS_MANUAL_REVIEW'
                          ? '#D97706'
                          : '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i
                      className={
                        scanResult.classification === 'POSSIBLE_DUPLICATE'
                          ? 'ti ti-alert-triangle'
                          : scanResult.classification === 'NEEDS_MANUAL_REVIEW'
                          ? 'ti ti-eye-exclamation'
                          : 'ti ti-circle-check'
                      }
                      style={{ fontSize: '26px' }}
                    />
                  </div>
                  <div>
                    <h2
                      style={{
                        margin: '0 0 4px',
                        fontSize: '1.3rem',
                        fontWeight: 800,
                        color:
                          scanResult.classification === 'POSSIBLE_DUPLICATE'
                            ? '#DC2626'
                            : scanResult.classification === 'NEEDS_MANUAL_REVIEW'
                            ? '#D97706'
                            : '#059669',
                      }}
                    >
                      {scanResult.classificationLabel}
                    </h2>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                      {scanResult.classification === 'POSSIBLE_DUPLICATE'
                        ? 'High-confidence duplicate payment parameters detected against FOMS database records.'
                        : scanResult.classification === 'NEEDS_MANUAL_REVIEW'
                        ? 'Potential duplicate signals detected. Requires Financial Manager manual inspection.'
                        : 'Document fields checked against records with no duplicate match detected.'}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      fontSize: '1.6rem',
                      fontWeight: 800,
                      color:
                        scanResult.classification === 'POSSIBLE_DUPLICATE'
                          ? '#DC2626'
                          : scanResult.classification === 'NEEDS_MANUAL_REVIEW'
                          ? '#D97706'
                          : '#059669',
                      display: 'block',
                      lineHeight: 1,
                    }}
                  >
                    {scanResult.matchScore}%
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Match Score
                  </span>
                </div>
              </div>

              {/* Highlight Bar */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '14px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#334155',
                }}
              >
                <div>
                  <strong style={{ color: '#0F172A' }}>Highest Similarity:</strong> {scanResult.matchScore}% Match Score
                </div>
                <div>
                  <strong style={{ color: '#0F172A' }}>Checked Date &amp; Time:</strong> {scanResult.checkedDateTime}
                </div>
              </div>

              {/* Conflict Flag Warning Banner */}
              {scanResult.conflictFlag && (
                <div
                  style={{
                    background: '#FFFBEB',
                    border: '1px solid #FCD34D',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    color: '#92400E',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <i className="ti ti-flag-filled" style={{ fontSize: '18px', color: '#D97706' }} />
                  <div>
                    <strong>Conflicting records:</strong> {scanResult.conflictReason || 'Document metadata has mismatched client ID or invoice ID. Score capped at 89%.'}
                  </div>
                </div>
              )}

              {/* Low Extraction Quality Warning */}
              {scanResult.lowExtractionQuality && (
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    color: '#991B1B',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <i className="ti ti-alert-circle" style={{ fontSize: '18px', color: '#DC2626' }} />
                  <div>
                    <strong>Low extraction quality warning:</strong> Two or more key fields could not be clearly parsed from the uploaded image. Match score reduced accordingly.
                  </div>
                </div>
              )}

              {/* Two Image Cards: Uploaded Document and Existing FOMS Record */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                {/* Card 1: Uploaded Document */}
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    overflow: 'hidden',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Uploaded / Scanned Document
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {scanResult.uploadedDocument.fileName}
                    </span>
                  </div>
                  <div
                    onClick={() =>
                      setZoomModalData({
                        title: 'Uploaded Document Preview',
                        url: scanResult.uploadedDocument.previewUrl,
                      })
                    }
                    style={{ position: 'relative', cursor: 'zoom-in', background: '#0F172A', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <img
                      src={scanResult.uploadedDocument.previewUrl}
                      alt="Uploaded Document"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '10px',
                        right: '10px',
                        background: 'rgba(15, 23, 42, 0.75)',
                        color: '#FFFFFF',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <i className="ti ti-zoom-in" /> Click to zoom
                    </div>
                  </div>
                </div>

                {/* Card 2: Existing Matching Record */}
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    overflow: 'hidden',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Existing Matching FOMS Record
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {scanResult.existingRecord ? scanResult.existingRecord.recordId : 'None'}
                    </span>
                  </div>
                  <div
                    onClick={() =>
                      scanResult.existingRecord &&
                      setZoomModalData({
                        title: 'Existing FOMS Record Preview',
                        url: scanResult.existingRecord.previewUrl || '/mock-receipt.png',
                      })
                    }
                    style={{
                      position: 'relative',
                      cursor: scanResult.existingRecord ? 'zoom-in' : 'default',
                      background: '#0F172A',
                      height: 260,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {scanResult.existingRecord ? (
                      <>
                        {existingImgError ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', gap: '8px', padding: '20px', textAlign: 'center' }}>
                            <i className="ti ti-file-invoice" style={{ fontSize: '44px', color: '#64748B' }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1' }}>Existing Record: {scanResult.existingRecord.recordId}</span>
                            <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{scanResult.existingRecord.documentType} • ₱{scanResult.existingRecord.amount?.toLocaleString()}</span>
                          </div>
                        ) : (
                          <img
                            src={scanResult.existingRecord.previewUrl || '/mock-receipt.png'}
                            alt="Existing Record"
                            onError={() => setExistingImgError(true)}
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          />
                        )}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '10px',
                            right: '10px',
                            background: 'rgba(15, 23, 42, 0.75)',
                            color: '#FFFFFF',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <i className="ti ti-zoom-in" /> Click to zoom
                        </div>
                      </>
                    ) : (
                      <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                        No matching existing record found.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Comparison Parameters Matrix */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  overflow: 'hidden',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                    Comparison Parameters Matrix
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Weighted comparison across official receipt, invoice, and logistics parameters.
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <th style={{ padding: '12px 16px' }}>Field</th>
                        <th style={{ padding: '12px 16px' }}>Uploaded Document</th>
                        <th style={{ padding: '12px 16px' }}>Existing FOMS Record</th>
                        <th style={{ padding: '12px 16px' }}>Match Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResult.matrix.map((row) => (
                        <tr key={row.fieldKey} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0F172A' }}>
                            {row.fieldLabel}
                            <span style={{ display: 'block', fontSize: '0.7rem', color: '#94A3B8', fontWeight: 500 }}>
                              Weight: {row.weight} pts
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', color: '#0F172A' }}>
                            {formatFieldValue(row.uploadedValue)}
                            {row.uploadedConfidence > 0 && (
                              <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748B' }}>
                                Confidence: {(row.uploadedConfidence * 100).toFixed(0)}%
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px', color: '#0F172A' }}>
                            {formatFieldValue(row.existingValue)}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            {formatBadge(row.matchResult)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Optional Submission Note (for Score 60+) */}
              {scanResult.matchScore >= 60 && (
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '20px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                    Accountant Submission Note (Optional)
                  </label>
                  <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#64748B' }}>
                    Add helpful operational notes explaining why this document looks duplicate or why manual review is needed.
                  </p>
                  <textarea
                    rows={3}
                    value={submissionNote}
                    onChange={(e) => setSubmissionNote(e.target.value)}
                    placeholder="Enter observation notes for the Financial Manager..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      color: '#0F172A',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}

              {/* Footer Actions: Strictly enforce rules */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: '#FFFFFF',
                    border: '1.5px solid #CBD5E1',
                    color: '#0F172A',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Scan Another Document
                </button>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {scanResult.matchScore >= 60 ? (
                    <>
                      {/* Unique feature: allows Accountant to confirm as unique if not needed for duplication */}
                      <button
                        type="button"
                        onClick={() => {
                          setUniqueModalNote(submissionNote);
                          setShowConfirmUniqueModal(true);
                        }}
                        disabled={isConfirmingUnique || isSubmitting}
                        style={{
                          padding: '10px 22px',
                          borderRadius: '8px',
                          background: '#FFFFFF',
                          border: '1.5px solid #0D9488',
                          color: '#0D9488',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          cursor: (isConfirmingUnique || isSubmitting) ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          transition: 'all 0.2s ease',
                        }}
                        title="If this document is legitimate and does not require duplicate review, confirm it as unique directly."
                      >
                        <i className="ti ti-check" style={{ fontSize: '16px', strokeWidth: 2.5 }} />
                        {isConfirmingUnique ? 'Confirming...' : 'Confirm as Unique Document'}
                      </button>

                      <button
                        type="button"
                        onClick={handleSubmitForReview}
                        disabled={isSubmitting || isConfirmingUnique}
                        style={{
                          padding: '10px 26px',
                          borderRadius: '8px',
                          background: '#0D9488',
                          border: 'none',
                          color: '#FFFFFF',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          cursor: (isSubmitting || isConfirmingUnique) ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 4px rgba(13, 148, 136, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <i className="ti ti-send" style={{ fontSize: '16px' }} />
                        {isSubmitting ? 'Submitting...' : 'Submit for Manual Review'}
                      </button>
                    </>
                  ) : (
                    /* Score below 60: Confirm as Unique Document */
                    <button
                      type="button"
                      onClick={() => handleConfirmUnique()}
                      disabled={isConfirmingUnique}
                      style={{
                        padding: '10px 26px',
                        borderRadius: '8px',
                        background: '#0D9488',
                        border: 'none',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        cursor: isConfirmingUnique ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 4px rgba(13, 148, 136, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <i className="ti ti-file-check" style={{ fontSize: '16px' }} />
                      {isConfirmingUnique ? 'Confirming...' : 'Confirm as Unique Document'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirm as Unique Exemption Modal */}
      {showConfirmUniqueModal && scanResult && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '540px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: '#CCFBF1',
                    color: '#0D9488',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className="ti ti-shield-check" style={{ fontSize: '22px' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                    Confirm Document as Unique
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                    Exempt from duplicate escalation if verified distinct
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmUniqueModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748B',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Document Number:</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                    {scanResult.uploadedDocument.extracted.orInvoiceNumber.value || 'Not read'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Client Name:</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                    {scanResult.uploadedDocument.extracted.clientName.value || 'Speedex Client'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>AI Similarity Score:</span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: scanResult.matchScore >= 90 ? '#FEE2E2' : '#FEF3C7',
                      color: scanResult.matchScore >= 90 ? '#DC2626' : '#D97706',
                    }}
                  >
                    {scanResult.matchScore}% Match
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '0.825rem',
                  color: '#166534',
                  lineHeight: '1.45',
                }}
              >
                If this transaction is legitimate and does not require duplicate review (e.g. recurring payment with a different date, separate billing period, or valid re-issuance), you can clear it as unique. It will be saved directly to Unique Documents.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                  Operational Justification Note (Recommended)
                </label>
                <textarea
                  rows={3}
                  value={uniqueModalNote}
                  onChange={(e) => setUniqueModalNote(e.target.value)}
                  placeholder="Explain why this document is unique (e.g. Weekly recurring fuel expense, different delivery run)..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    color: '#0F172A',
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '0.725rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                  This note will be recorded in the Audit Trail and saved to Unique Documents.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              }}
            >
              <button
                type="button"
                onClick={() => setShowConfirmUniqueModal(false)}
                disabled={isConfirmingUnique}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: isConfirmingUnique ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmUnique(uniqueModalNote)}
                disabled={isConfirmingUnique}
                style={{
                  padding: '9px 22px',
                  borderRadius: '8px',
                  background: '#0D9488',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: isConfirmingUnique ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(13, 148, 136, 0.25)',
                }}
              >
                <i className="ti ti-check" style={{ fontSize: '16px' }} />
                {isConfirmingUnique ? 'Confirming...' : 'Confirm as Unique Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Scanner Modal */}
      {showCamera && (
        <CameraScannerModal
          onCapture={(file) => validateAndSelectFile(file)}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Image Zoom Modal */}
      {zoomModalData && (
        <ImageZoomModal
          title={zoomModalData.title}
          imageUrl={zoomModalData.url}
          onClose={() => setZoomModalData(null)}
        />
      )}
    </div>
  );
};

export default AIDuplicateScan;
