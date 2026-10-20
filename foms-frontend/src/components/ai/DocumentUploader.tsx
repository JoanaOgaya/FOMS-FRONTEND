import React, { useState, useRef, useCallback } from 'react';
import { documentsService } from '../../services/ai/documents.service';
import type { DocumentType } from '../../types/ai';

export interface DocumentUploaderProps {
  documentType: DocumentType;
  onUploadSuccess: (id: string) => void;
  allowedTypesDescription?: string;
  maxSizeMb?: number;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  documentType,
  onUploadSuccess,
  allowedTypesDescription = 'JPG, PNG, WEBP, or PDF up to 10MB',
  maxSizeMb = 10,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);

    // Validation
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File size exceeds maximum limit of ${maxSizeMb}MB.`);
      return;
    }

    const validExtensions = /\.(jpg|jpeg|png|webp|pdf)$/i;
    if (!validExtensions.test(file.name) && !file.type.match(/(image\/(jpeg|png|webp)|application\/pdf)/)) {
      setError('Unsupported file type. Please upload a JPG, PNG, WEBP, or PDF document.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const res = await documentsService.upload(file, documentType, (pct) => {
        setUploadProgress(pct);
      });
      setIsUploading(false);
      setUploadProgress(100);
      onUploadSuccess(res.id);
    } catch (err: any) {
      setIsUploading(false);
      setUploadProgress(0);
      setError(err instanceof Error ? err.message : 'Document upload failed. Please try again.');
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [documentType]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#0D9488' : '#CBD5E1'}`,
          borderRadius: 14,
          padding: '40px 24px',
          background: isDragging ? '#F0FDFA' : '#FAFAFA',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          textAlign: 'center',
          transition: 'all 0.2s',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: isDragging ? '#CCFBF1' : '#F1F5F9',
            color: '#0D9488',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
          }}
        >
          <i className="ti ti-cloud-upload" />
        </div>

        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A', marginBottom: 4 }}>
            Click to upload or drag &amp; drop document
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
            {allowedTypesDescription}
          </p>
        </div>

        {isUploading && (
          <div style={{ width: '100%', maxWidth: 300, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#475569', marginBottom: 4 }}>
              <span>Uploading &amp; checking…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div style={{ height: 6, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: '#0D9488',
                  width: `${uploadProgress}%`,
                  transition: 'width 0.2s',
                }}
              />
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {error && (
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid #F87171',
            borderRadius: 10,
            padding: '14px 18px',
            color: '#991B1B',
            fontSize: '0.875rem',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.95rem' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: '1.15rem', color: '#DC2626' }} />
            Invalid Document Uploaded
          </div>
          <div style={{ color: '#B91C1C', lineHeight: 1.45 }}>
            {error}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#7F1D1D', marginTop: 2, fontWeight: 500 }}>
            Only official receipts, invoices, billing statements, or payment-related finance documents are allowed.
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentUploader;
