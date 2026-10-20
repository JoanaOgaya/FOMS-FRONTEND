import React, { useState, useEffect } from 'react';
import type { DocumentExtractionResult, ConfirmExtractionPayload } from '../../types/ai';
import { AiDisclaimer } from './AiDisclaimer';

export interface ExtractedFieldsFormProps {
  extraction: DocumentExtractionResult;
  onConfirm: (payload: ConfirmExtractionPayload) => Promise<void>;
  isSubmitting?: boolean;
}

export const ExtractedFieldsForm: React.FC<ExtractedFieldsFormProps> = ({
  extraction,
  onConfirm,
  isSubmitting = false,
}) => {
  const [formValues, setFormValues] = useState<Record<string, string | number>>({});
  const [remarks, setRemarks] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    const initial: Record<string, string | number> = {};
    extraction.fields.forEach((f) => {
      initial[f.key] = f.value;
    });
    setFormValues(initial);
    setRemarks(extraction.remarks || '');
    setHasChanges(false);
  }, [extraction]);

  const handleFieldChange = (key: string, value: string | number) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasChanges && !remarks.trim()) {
      setValidationError('Reviewer remarks are required when correcting extracted fields.');
      return;
    }
    setValidationError('');

    await onConfirm({
      id: extraction.id,
      confirmedFields: formValues,
      reviewer: extraction.uploadedBy || 'Current Reviewer',
      remarks: remarks.trim(),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Banner: Status & Completeness */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: '0.78rem',
                fontWeight: 800,
                background: extraction.status === 'DONE' ? '#F0FDF4' : '#FEF2F2',
                color: extraction.status === 'DONE' ? '#16A34A' : '#DC2626',
                border: `1px solid ${extraction.status === 'DONE' ? '#BBF7D0' : '#FECACA'}`,
              }}
            >
              {extraction.status === 'DONE' ? 'Extraction Complete' : extraction.status}
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
              {extraction.fileName}
            </span>
          </div>

          <AiDisclaimer />
        </div>

        {/* Completeness Checklist */}
        {extraction.completeness && extraction.completeness.length > 0 && (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Document Completeness Checklist
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {extraction.completeness.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: item.isPresent ? '#F0FDF4' : '#FEF2F2',
                    color: item.isPresent ? '#16A34A' : '#DC2626',
                    border: `1px solid ${item.isPresent ? '#BBF7D0' : '#FECACA'}`,
                  }}
                >
                  <i className={item.isPresent ? 'ti ti-check' : 'ti ti-x'} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Form: Extracted Fields & Preview */}
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
              Extracted Information &amp; Manual Verification
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Yellow highlights denote low AI confidence
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748B', fontWeight: 700 }}>FIELD</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748B', fontWeight: 700 }}>VERIFIED VALUE</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', color: '#64748B', fontWeight: 700, width: 130 }}>AI CONFIDENCE</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B', fontWeight: 700, width: 100 }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {extraction.fields.map((field) => {
                  const isLow = field.isLowConfidence;
                  return (
                    <tr
                      key={field.key}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: isLow ? '#FFFBEB' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>
                        {field.label}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input
                          type="text"
                          value={formValues[field.key] !== undefined ? String(formValues[field.key]) : ''}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: `1px solid ${isLow ? '#F59E0B' : '#CBD5E1'}`,
                            fontSize: '0.85rem',
                            background: isLow ? '#FEF3C7' : '#fff',
                            color: '#0F172A',
                            fontFamily: 'inherit',
                            boxSizing: 'border-box',
                          }}
                        />
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            color: isLow ? '#D97706' : '#16A34A',
                            background: isLow ? '#FEF3C7' : '#F0FDF4',
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          {field.confidence}%
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        {isLow ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#D97706' }}>
                            <i className="ti ti-alert-triangle" style={{ marginRight: 4 }} />
                            Verify
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16A34A' }}>
                            <i className="ti ti-check" style={{ marginRight: 4 }} />
                            High
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Remarks Section */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
              Reviewer Notes / Correction Remarks {hasChanges && <span style={{ color: '#DC2626' }}>*</span>}
            </label>
            <textarea
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                if (validationError) setValidationError('');
              }}
              placeholder={
                hasChanges
                  ? 'Required: Explain corrections made to extracted values...'
                  : 'Optional reviewer remarks or notes...'
              }
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${validationError ? '#EF4444' : '#CBD5E1'}`,
                fontSize: '0.85rem',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            {validationError && (
              <span style={{ color: '#DC2626', fontSize: '0.78rem', fontWeight: 600, marginTop: 4, display: 'block' }}>
                {validationError}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: isSubmitting ? '#94A3B8' : '#0F172A',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <i className="ti ti-circle-check" />
              {isSubmitting ? 'Saving Confirmation…' : 'Confirm & Validate Extraction'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ExtractedFieldsForm;
