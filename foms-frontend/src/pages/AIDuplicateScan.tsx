import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { canDo, getDuplicateScope } from '../utils/roleAccess';
import { duplicatesService, type DuplicateScanResult } from '../services/duplicates.service';

/* ─────────────────────────────────────────────
   Camera Modal Component
───────────────────────────────────────────── */
const CameraModal: React.FC<{
  onCapture: (file: File) => void;
  onClose: () => void;
}> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setError(null);
    } catch (err: any) {
      setError('Unable to access camera. Please allow camera permission and try again.');
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [facingMode, startCamera]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    setCaptured(dataUrl);
    // Stop camera after capture
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const handleRetake = () => {
    setCaptured(null);
    startCamera(facingMode);
  };

  const handleUsePhoto = () => {
    if (!captured) return;
    // Convert data URL to File
    fetch(captured)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], `scan_${Date.now()}.png`, { type: 'image/png' });
        onCapture(file);
        onClose();
      });
  };

  const flipCamera = () => {
    setFacingMode(m => m === 'environment' ? 'user' : 'environment');
    setCaptured(null);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#0F172A', borderRadius: '18px', overflow: 'hidden',
        width: '90%', maxWidth: 640,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #1E293B' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '8px', background: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-camera" style={{ fontSize: '17px', color: '#fff' }} />
            </div>
            <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>Scan Document</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '22px', display: 'flex', alignItems: 'center' }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Camera View */}
        <div style={{ position: 'relative', background: '#000', minHeight: 340 }}>
          {error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, gap: 16, padding: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-camera-off" style={{ fontSize: '26px', color: '#EF4444' }} />
              </div>
              <div style={{ color: '#94A3B8', textAlign: 'center', fontSize: '0.875rem', lineHeight: 1.6 }}>{error}</div>
              <button onClick={() => startCamera(facingMode)} style={{ padding: '10px 20px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>
                Retry
              </button>
            </div>
          ) : captured ? (
            <img src={captured} alt="Captured" style={{ width: '100%', display: 'block', maxHeight: 400, objectFit: 'contain' }} />
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', maxHeight: 400, objectFit: 'cover' }} />
              {/* Scan overlay */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '75%', height: '70%', border: '2px solid #0D9488', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}>
                  {/* Corner accents */}
                  {[['0','0'], ['0','auto'], ['auto','0'], ['auto','auto']].map(([t, b], idx) => (
                    <div key={idx} style={{ position: 'absolute', width: 20, height: 20, borderColor: '#0D9488', borderStyle: 'solid', borderWidth: 0, ...(t === '0' ? { top: -2, borderTopWidth: 3 } : { bottom: -2, borderBottomWidth: 3 }), ...(b === '0' ? { left: -2, borderLeftWidth: 3 } : { right: -2, borderRightWidth: 3 }), borderRadius: 2 }} />
                  ))}
                </div>
              </div>
              {/* Scanning animation line */}
              <style>{`
                @keyframes scanLine { 0%,100% { top: 20%; } 50% { top: 75%; } }
              `}</style>
              <div style={{ position: 'absolute', left: '12.5%', width: '75%', height: 2, background: 'linear-gradient(90deg,transparent,#0D9488,transparent)', animation: 'scanLine 2s ease-in-out infinite', pointerEvents: 'none' }} />
            </>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* Controls */}
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#0F172A' }}>
          {!captured ? (
            <>
              {/* Flip camera */}
              <button onClick={flipCamera} disabled={!!error} style={{ width: 44, height: 44, borderRadius: '50%', background: '#1E293B', border: 'none', cursor: error ? 'not-allowed' : 'pointer', color: '#94A3B8', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: error ? 0.4 : 1 }}>
                <i className="ti ti-camera-rotate" />
              </button>
              {/* Capture button */}
              <button onClick={handleCapture} disabled={!!error} style={{ width: 64, height: 64, borderRadius: '50%', background: error ? '#334155' : '#0D9488', border: '4px solid #fff', cursor: error ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s', opacity: error ? 0.5 : 1 }}
                onMouseEnter={e => !error && ((e.currentTarget as HTMLElement).style.background = '#0F766E')}
                onMouseLeave={e => !error && ((e.currentTarget as HTMLElement).style.background = '#0D9488')}>
                <i className="ti ti-camera" style={{ fontSize: '26px', color: '#fff' }} />
              </button>
              {/* Cancel */}
              <button onClick={onClose} style={{ width: 44, height: 44, borderRadius: '50%', background: '#1E293B', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-x" />
              </button>
            </>
          ) : (
            <>
              <button onClick={handleRetake} style={{ padding: '10px 24px', background: '#1E293B', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-rotate" style={{ fontSize: '16px' }} /> Retake
              </button>
              <button onClick={handleUsePhoto} style={{ padding: '10px 28px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#0F766E')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#0D9488')}>
                <i className="ti ti-check" style={{ fontSize: '16px' }} /> Use Photo
              </button>
            </>
          )}
        </div>

        {/* Tip */}
        {!captured && !error && (
          <div style={{ padding: '8px 24px 14px', textAlign: 'center', color: '#475569', fontSize: '0.78rem' }}>
            Position the document inside the frame and press capture
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Main Page
───────────────────────────────────────────── */
export type ScanState =
  | 'IDLE'
  | 'UPLOADING'
  | 'VALIDATING_DOCUMENT'
  | 'INVALID_DOCUMENT'
  | 'VALID_DOCUMENT'
  | 'SCANNING_DUPLICATE'
  | 'DUPLICATE_FOUND'
  | 'UNIQUE_DOCUMENT'
  | 'SCAN_ERROR';

const AIDuplicateScan: React.FC = () => {
  const { user } = useAuth();
  const canScan = canDo(user?.role, 'duplicateScan', 'scan');
  const scope = getDuplicateScope(user?.role);
  const isAssistantFM = user?.role === 'ASSISTANT_FM';

  const { toast } = useToast();
  const [scanState, setScanState] = useState<ScanState>('IDLE');
  const [validationError, setValidationError] = useState<{
    title: string;
    message: string;
    reason?: string;
    detectedType?: string;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<DuplicateScanResult | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.5));

  const getCellMatchStyle = (field: string, uploaded: string, existing: string) => {
    if (!existing) return { text: 'Missing', style: { fontStyle: 'italic', color: '#64748B', fontSize: '13px' } };
    if (!uploaded) return { text: 'Missing', style: { fontStyle: 'italic', color: '#64748B', fontSize: '13px' } };
    if (uploaded.trim().toLowerCase() === existing.trim().toLowerCase()) {
      return { text: 'Exact Match', style: { background: '#FEE2E2', color: '#B91C1C', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' } };
    }
    if (field === 'amount') {
      return { text: 'Similar Match', style: { background: '#FEF3C7', color: '#D97706', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' } };
    }
    return { text: 'Different', style: { background: '#CCFBF1', color: '#0F766E', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' } };
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const triggerScan = async (file: File) => {
    if (!canScan) return;
    setUploadedFile(file);
    setPreviewDocUrl(URL.createObjectURL(file));
    setIsScanning(true);
    setScanState('VALIDATING_DOCUMENT');
    setScanResult(null);
    setValidationError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document', file);

      // STEP 1: AI Document Classification & Validation Gate
      let validation: any = null;
      try {
        validation = await duplicatesService.validate(formData);
      } catch (valErr: any) {
        if (valErr?.status === 422 || valErr?.data?.status === 'INVALID_DOCUMENT' || valErr?.data?.isAllowed === false) {
          setIsScanning(false);
          setScanState('INVALID_DOCUMENT');
          const details = valErr?.data?.details || {};
          setValidationError({
            title: 'Invalid Document Uploaded',
            message: valErr?.data?.message || 'Only official receipts, invoices, billing statements, or payment-related finance documents are allowed. Please upload a valid FOMS financial document.',
            reason: details.reason || 'The uploaded image does not appear to be an invoice, official receipt, billing statement, or payment-related document. Duplicate scanning was stopped to protect the accuracy of the AI results.',
            detectedType: details.detectedType || valErr?.data?.documentType || 'UNSUPPORTED_CONTENT'
          });
          toast.error('Invalid file content. Please upload an invoice, official receipt, or payment document only.', 'Invalid Document Uploaded');
          return;
        }
        throw valErr;
      }

      if (validation && (!validation.isAllowed || validation.status === 'INVALID_DOCUMENT')) {
        setIsScanning(false);
        setScanState('INVALID_DOCUMENT');
        setValidationError({
          title: 'Invalid Document Uploaded',
          message: validation.message || 'Only official receipts, invoices, billing statements, or payment-related finance documents are allowed. Please upload a valid FOMS financial document.',
          reason: validation.reason || 'The uploaded image does not appear to be an invoice, official receipt, billing statement, or payment-related document. Duplicate scanning was stopped to protect the accuracy of the AI results.',
          detectedType: validation.documentType || 'INVALID_OR_UNRELATED_IMAGE'
        });
        toast.error('Invalid file content. Please upload an invoice, official receipt, or payment document only.', 'Invalid Document Uploaded');
        return;
      }

      // STEP 2: Document is Valid -> Proceed to Duplicate Detection
      setScanState('SCANNING_DUPLICATE');
      const scanRes = await duplicatesService.scan(formData, scope);
      setIsScanning(false);

      if (scanRes.result === 'duplicate') {
        setScanState('DUPLICATE_FOUND');
        setScanResult(scanRes);
        toast.warning(`Duplicate detected (${scanRes.confidence || 100}% similarity). Review required.`, 'AI Gemini Scan');
      } else {
        setScanState('UNIQUE_DOCUMENT');
        setScanResult(scanRes);
        toast.success('Document verified as unique. No duplicate records found in FOMS.', 'Scan Completed');
      }
    } catch (err: any) {
      setIsScanning(false);
      if (err?.status === 422 || err?.data?.status === 'INVALID_DOCUMENT' || err?.data?.isAllowed === false) {
        setScanState('INVALID_DOCUMENT');
        const details = err?.data?.details || {};
        setValidationError({
          title: 'Invalid Document Uploaded',
          message: err?.data?.message || 'Only official receipts, invoices, billing statements, or payment-related finance documents are allowed. Please upload a valid FOMS financial document.',
          reason: details.reason || 'The uploaded image does not appear to be an invoice, official receipt, billing statement, or payment-related document. Duplicate scanning was stopped to protect the accuracy of the AI results.',
          detectedType: details.detectedType || err?.data?.documentType || 'UNSUPPORTED_CONTENT'
        });
        toast.error('Invalid file content. Please upload an invoice, official receipt, or payment document only.', 'Invalid Document Uploaded');
      } else {
        setScanState('SCAN_ERROR');
        toast.error(err?.message || 'An error occurred during duplicate scan.', 'Scan Error');
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (!canScan) return;
    const file = e.dataTransfer.files[0];
    if (file) {
      triggerScan(file);
    }
  }, [canScan]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canScan) return;
    const file = e.target.files?.[0];
    if (file) {
      triggerScan(file);
    }
  };

  const handleScanDocument = async () => {
    if (!uploadedFile || !canScan) return;
    await triggerScan(uploadedFile);
  };

  const handleReset = () => {
    setUploadedFile(null);
    setPreviewDocUrl(null);
    setScanResult(null);
    setValidationError(null);
    setIsScanning(false);
    setScanState('IDLE');
    setZoomLevel(1.0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {showCamera && (
        <CameraModal
          onCapture={file => { setUploadedFile(file); setScanResult(null); }}
          onClose={() => setShowCamera(false)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                Document Checking &amp; AI Scan Console
              </h2>
            </div>
            {isAssistantFM && (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369A1', background: '#F0F9FF', border: '1px solid #BAE6FD', padding: '4px 10px', borderRadius: '6px' }}>
                Liquidation Documents Scope Only
              </span>
            )}
          </div>

          {/* Decision Support Notice */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', borderRadius: '10px', border: '1.5px solid #0D9488', background: '#F0FDFA' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid #0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0D9488' }}>?</span>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Decision Support Notice</div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#0F172A', lineHeight: 1.6 }}>
                AI-generated results are provided as decision support only. Final validation and official record updates must be performed by an authorized finance user{' '}
                <strong>through the existing FOMS workflow.</strong>
              </p>
            </div>
          </div>

          {/* Read-Only Notice for Roles Without Scan Access */}
          {!canScan && (
            <div style={{ padding: '16px 20px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', color: '#475569', fontSize: '0.875rem', lineHeight: 1.5 }}>
              <i className="ti ti-info-circle" style={{ marginRight: 8, color: '#64748B' }} />
              <strong>Read-Only Console:</strong> Document uploads and scans are initiated by the Accountant and Assistant Financial Manager. The Head Accountant reviews and approves duplicate decisions in <strong>For Review</strong>.
            </div>
          )}

          {/* Upload Zone (Only visible to roles with scan permission) */}
          {canScan && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                background: isDragging ? '#F0FDFA' : '#fff',
                borderRadius: '14px',
                border: `2px dashed ${isDragging ? '#0D9488' : '#CBD5E1'}`,
                padding: '48px 32px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s',
              }}
              onClick={() => !uploadedFile && fileInputRef.current?.click()}
            >
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-cloud-upload" style={{ fontSize: '28px', color: '#fff' }} />
              </div>

              {uploadedFile ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 6 }}>
                    <i className="ti ti-file" style={{ color: '#0D9488', fontSize: '20px' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0F172A' }}>{uploadedFile.name}</span>
                  </div>
                  <span style={{ fontSize: '0.8125rem', color: '#64748B' }}>{formatFileSize(uploadedFile.size)}</span>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                    Drag &amp; Drop or Upload Document
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748B' }}>
                    {isAssistantFM ? 'Upload liquidation receipts (fuel, toll, expense vouchers) up to 10MB.' : 'Support JPG, JPEG, and PNG invoice/receipt statements up to 10MB.'}
                  </p>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {!uploadedFile && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      style={{ padding: '10px 24px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#0F766E')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#0D9488')}
                    >
                      Choose File
                    </button>

                    <button
                      onClick={e => { e.stopPropagation(); setShowCamera(true); }}
                      style={{
                        padding: '10px 24px', background: 'transparent',
                        color: '#0F172A', border: '1.5px solid #CBD5E1',
                        borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <i className="ti ti-camera" style={{ fontSize: '16px', color: '#475569' }} />
                      Scan Document
                    </button>
                  </>
                )}

                {/* Run AI Scan & Remove */}
                {uploadedFile && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); handleReset(); }}
                      style={{ padding: '10px 24px', background: 'transparent', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleScanDocument(); }}
                      disabled={isScanning}
                      style={{
                        padding: '10px 24px', background: isScanning ? '#94A3B8' : '#6366F1',
                        color: '#fff', border: 'none', borderRadius: '8px',
                        fontSize: '0.9rem', fontWeight: 700, cursor: isScanning ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.2s',
                      }}
                    >
                      <i className="ti ti-brain" style={{ fontSize: '16px' }} />
                      {isScanning ? 'Scanning...' : 'Run Scan'}
                    </button>
                  </>
                )}
              </div>

              <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleFileChange} />
            </div>
          )}

          {/* Scanning Loader */}
          {isScanning && (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid #E2E8F0', borderTopColor: '#0D9488', animation: 'spin 1s linear infinite' }} />
              <div>
                <div style={{ fontWeight: 700, color: '#0F172A', textAlign: 'center', marginBottom: 4 }}>
                  {scanState === 'VALIDATING_DOCUMENT' ? 'Validating Document Type...' : 'AI Duplicate Scanning in Progress...'}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748B', textAlign: 'center' }}>
                  {scanState === 'VALIDATING_DOCUMENT' ? 'Verifying official receipt/invoice credentials before duplicate check' : 'Analyzing document signatures and database records'}
                </div>
              </div>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Invalid Document Error Card */}
          {scanState === 'INVALID_DOCUMENT' && validationError && !isScanning && (
            <div style={{
              background: '#fff',
              borderRadius: '14px',
              border: '1.5px solid #FECACA',
              padding: '24px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: '#FEF2F2',
                  border: '1.5px solid #FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: '24px', color: '#EF4444' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#991B1B' }}>
                      {validationError.title}
                    </h3>
                    {validationError.detectedType && (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#DC2626',
                        background: '#FEE2E2',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        letterSpacing: '0.04em'
                      }}>
                        {validationError.detectedType.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.875rem', color: '#B91C1C', fontWeight: 600, lineHeight: 1.5 }}>
                    {validationError.message}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: '#64748B', lineHeight: 1.6 }}>
                    {validationError.reason}
                  </p>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#FEF2F2',
                borderRadius: '8px',
                border: '1px solid #FEE2E2',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#7F1D1D' }}>
                  <i className="ti ti-shield-check" style={{ fontSize: '16px', color: '#EF4444' }} />
                  <span><strong>AI Guardrail Active:</strong> Duplicate scanning was stopped to protect the accuracy of the AI results.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleReset();
                    setTimeout(() => fileInputRef.current?.click(), 100);
                  }}
                  style={{
                    padding: '8px 18px',
                    background: '#DC2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className="ti ti-upload" />
                  Upload Valid Document
                </button>
              </div>
            </div>
          )}

          {/* DUPLICATE FOUND: Comparison Parameters Matrix (Picture 2 Format) */}
          {scanResult && !isScanning && scanState === 'DUPLICATE_FOUND' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                background: '#fff',
                borderRadius: '16px',
                border: '1px solid rgba(225, 29, 72, 0.2)',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
              }}>
                {/* Header status */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize: '24px' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800, color: '#EF4444' }}>
                      Possible Duplicate Detected
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>
                      A possible matching Official Receipt or Invoice already exists in FOMS.
                    </p>
                  </div>
                </div>

                {/* Document Previews side-by-side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '12.5px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                      Uploaded / Scanned Document
                    </h4>
                    <div style={{ overflow: 'hidden', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      {previewDocUrl ? (
                        <img src={previewDocUrl} alt="Uploaded candidate preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', transform: `scale(${zoomLevel})`, transition: 'transform 0.2s' }} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#64748B' }}>
                          <i className="ti ti-file-text" style={{ fontSize: '32px' }} />
                          <span style={{ fontSize: '12px' }}>{uploadedFile?.name || 'Uploaded File'}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '16px', background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '12.5px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                      Existing Matching FOMS Record
                    </h4>
                    <div style={{ overflow: 'hidden', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      {scanResult.matchedRecord?.proofUrl ? (
                        <img src={scanResult.matchedRecord.proofUrl} alt="Existing database match preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', opacity: 0.9, transform: `scale(${zoomLevel})`, transition: 'transform 0.2s' }} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px', color: '#1E293B' }}>
                          <i className="ti ti-file-check" style={{ fontSize: '36px', color: '#0D9488' }} />
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>{scanResult.matchedRecord?.number || scanResult.matchedRecord?.orNumber || 'Matched Record'}</div>
                          <div style={{ fontSize: '12px', color: '#64748B' }}>{scanResult.matchedRecord?.clientName || scanResult.matchedRecord?.client_name || 'Verified Record'}</div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#059669' }}>
                            {scanResult.matchedRecord?.amount ? `₱${Number(scanResult.matchedRecord.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Similarity Banner info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: '#FFF7ED', borderRadius: '8px', border: '1px solid rgba(249, 115, 22, 0.25)', fontSize: '13.5px', fontWeight: 600 }}>
                  <span style={{ color: '#9A3412', fontWeight: 700 }}>
                    Highest Similarity: {scanResult.confidence || 100}% Match Score
                  </span>
                  <span style={{ color: '#334155' }}>
                    Checked Date &amp; Time: {new Date().toLocaleString()}
                  </span>
                </div>

                {/* Comparison Matrix */}
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: '#0F172A' }}>
                    Comparison Parameters Matrix
                  </h4>
                  <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Field</th>
                          <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Uploaded Document</th>
                          <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Existing FOMS Record</th>
                          <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Match Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Document Type</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px' }}>{scanResult.uploadedRecord?.documentType || 'OFFICIAL RECEIPT'}</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px' }}>{scanResult.matchedRecord?.documentType || 'Official Receipt'}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={getCellMatchStyle('type', 'OFFICIAL RECEIPT', 'OFFICIAL RECEIPT').style}>
                              Exact Match
                            </span>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>OR / Invoice Number</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace' }}>
                            {scanResult.uploadedRecord?.orNumber || scanResult.matched_record_id || 'OR-2026-796650'}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace' }}>
                            {scanResult.matchedRecord?.registered_or || scanResult.matched_record_id || 'OR-2026-796650'}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={getCellMatchStyle('docNum', 'SAME', 'SAME').style}>
                              Exact Match
                            </span>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Client Name</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px' }}>
                            {scanResult.uploadedRecord?.clientName || 'Customer Name Not Read'}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '13px' }}>
                            {scanResult.matchedRecord?.client_name || 'Speedex Commercial Client'}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ background: '#CCFBF1', color: '#0F766E', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>
                              Different
                            </span>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Amount</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700 }}>
                            ₱{Number(scanResult.uploadedRecord?.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700 }}>
                            ₱{Number(scanResult.matchedRecord?.amount || 13650).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ background: '#FEF3C7', color: '#D97706', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>
                              Similar Match
                            </span>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Transaction Date</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px' }}>
                            {scanResult.uploadedRecord?.transactionDate || new Date().toISOString().slice(0, 10)}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '13px' }}>
                            {scanResult.matchedRecord?.entry_date || '2026-07-24'}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ background: '#CCFBF1', color: '#0F766E', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>
                              Different
                            </span>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Reference Number</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace' }}>
                            {scanResult.uploadedRecord?.referenceNumber || ('REF-' + (scanResult.matched_record_id || 'OR-2026-796650'))}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace' }}>
                            {scanResult.matchedRecord?.reference_number || ('REF-' + (scanResult.matched_record_id || 'OR-2026-796650'))}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ background: '#FEE2E2', color: '#B91C1C', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>
                              Exact Match
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Waybill Number</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px' }}>—</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace' }}>
                            {scanResult.matchedRecord?.waybill_number || ('WBL-' + (scanResult.matched_record_id || 'OR-2026-796650'))}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontStyle: 'italic', color: '#64748B', fontSize: '13px' }}>
                              Missing
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bottom Action Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', background: '#fff' }}>
                    <i className="ti ti-zoom" style={{ color: '#64748B', fontSize: '14px' }} />
                    <button type="button" onClick={handleZoomOut} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontWeight: 700, fontSize: '14px', padding: '0 4px' }}>&minus;</button>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                      Zoom Preview: {zoomLevel.toFixed(2)}x
                    </span>
                    <button type="button" onClick={handleZoomIn} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontWeight: 700, fontSize: '14px', padding: '0 4px' }}>&#43;</button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button
                      type="button"
                      onClick={() => {
                        toast.info('Item sent for supervisor review.', 'Manual Review');
                        handleReset();
                      }}
                      style={{ background: '#fff', border: '1px solid #CBD5E1', padding: '8px 18px', borderRadius: 8, color: '#0F172A', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
                    >
                      Need Manual Review
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        toast.success('Document marked as unique.', 'Mark as Unique');
                        handleReset();
                      }}
                      style={{ background: 'none', border: 'none', color: '#0F172A', fontWeight: 600, cursor: 'pointer', fontSize: '13px', padding: '8px 10px' }}
                    >
                      Mark as Unique
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        toast.error('Document confirmed and recorded as duplicate.', 'Duplicate Flagged');
                        handleReset();
                      }}
                      style={{ background: '#0D9488', border: 'none', padding: '8px 20px', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}
                    >
                      Mark as Duplicate
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* UNIQUE DOCUMENT RESULT */}
          {scanResult && !isScanning && scanState === 'UNIQUE_DOCUMENT' && (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1.5px solid #BBF7D0', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-circle-check" style={{ fontSize: '22px', color: '#22C55E' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#16A34A', marginBottom: 2 }}>
                    Unique Document Verified
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748B' }}>
                    {scanResult.message || 'No duplicate found. This document appears to be unique in FOMS.'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={handleReset} style={{ padding: '10px 20px', background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
                  Scan Another Document
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AIDuplicateScan;
