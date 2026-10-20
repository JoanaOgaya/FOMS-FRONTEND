import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Invoice } from '../types/entities';
import { invoicesService } from '../services/invoicesService';
import { InvoiceDocument } from './InvoiceDocument';
import { Button } from './Buttons';

export interface InvoiceModalProps {
  invoiceId: string | null;
  initialInvoice?: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  autoPrint?: boolean;
  onSendToStars?: (invoice: Invoice) => void;
}

/**
 * Centered modal dialog for viewing an invoice with focus trap, backdrop dismissal,
 * scroll locking, loading and error states, and a print trigger.
 */
export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  invoiceId,
  initialInvoice,
  isOpen,
  onClose,
  autoPrint = false,
  onSendToStars,
}) => {
  const [invoice, setInvoice] = useState<Invoice | null>(initialInvoice || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  // Fetch invoice details when opened if needed
  const fetchInvoice = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await invoicesService.get(id);
      setInvoice(data);
    } catch {
      setError('Unable to load invoice details. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !invoiceId) {
      if (!isOpen) {
        setInvoice(null);
        setError(null);
      }
      return;
    }

    if (initialInvoice && (initialInvoice.id === invoiceId || initialInvoice.invoiceNumber === invoiceId)) {
      setInvoice(initialInvoice);
      setIsLoading(false);
      setError(null);
    } else {
      fetchInvoice(invoiceId);
    }
  }, [isOpen, invoiceId, initialInvoice, fetchInvoice]);

  // Lock background scroll while modal is mounted
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Handle focus trapping and keyboard shortcuts (Escape and Tab)
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedElement.current = document.activeElement as HTMLElement | null;

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(focusableSelector);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus on modal dialog
    setTimeout(() => {
      if (modalRef.current) {
        const firstFocusable = modalRef.current.querySelector<HTMLElement>(focusableSelector);
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElement.current?.focus?.();
    };
  }, [isOpen, onClose]);

  const handleDownloadPdf = async () => {
    const element = document.getElementById('printable-invoice-document');
    if (!element) {
      window.print();
      return;
    }

    setIsDownloading(true);
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = (html2pdfModule as any).default || html2pdfModule;
      const cleanInvNum = (invoice?.invoiceNumber || invoice?.id || 'Invoice').replace(/[^a-zA-Z0-9-_]/g, '_');
      const clientName = (invoice?.clientName || 'Client').replace(/[^a-zA-Z0-9-_]/g, '_');
      const filename = `Invoice_${cleanInvNum}_${clientName}.pdf`;

      const opt = {
        margin: [8, 8, 8, 8],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
          scrollX: 0,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };

      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.warn('html2pdf generation error, falling back to window.print():', err);
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Trigger PDF or print if requested
  useEffect(() => {
    if (isOpen && autoPrint && invoice && !isLoading && !error) {
      const timer = setTimeout(() => {
        handleDownloadPdf();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoPrint, invoice, isLoading, error]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="invoice-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-modal-title"
        tabIndex={-1}
        className="invoice-modal-container"
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          width: '100%',
          maxWidth: 920,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          className="invoice-modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid #E2E8F0',
            background: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#CCFBF1',
                color: '#0D9488',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="ti ti-file-invoice" style={{ fontSize: '1.15rem' }} />
            </div>
            <div>
              <h3
                id="invoice-modal-title"
                style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}
              >
                {invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice Preview'}
              </h3>
              {invoice?.clientName && (
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{invoice.clientName}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#E2E8F0';
              e.currentTarget.style.color = '#0F172A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#64748B';
            }}
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div
          className="invoice-modal-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            background: '#F8FAFC',
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 20px',
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  border: '3px solid #E2E8F0',
                  borderTopColor: '#0D9488',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span style={{ color: '#64748B', fontSize: '0.9rem', fontWeight: 600 }}>
                Loading invoice details...
              </span>
            </div>
          ) : error ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 20px',
                textAlign: 'center',
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#FEF2F2',
                  color: '#DC2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.75rem',
                }}
              >
                <i className="ti ti-alert-triangle" />
              </div>
              <div style={{ maxWidth: 420 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: '#991B1B' }}>
                  Failed to Load Invoice
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#7F1D1D' }}>{error}</p>
              </div>
              {invoiceId && (
                <Button
                  title="Retry"
                  variant="primary"
                  icon="ti-reload"
                  onClick={() => fetchInvoice(invoiceId)}
                />
              )}
            </div>
          ) : invoice ? (
            <div
              id="printable-invoice-document"
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}
            >
              <InvoiceDocument invoice={invoice} compact={true} />
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          className="invoice-modal-footer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            background: '#FFFFFF',
          }}
        >
          <Button title="Close" variant="secondary" onClick={onClose} />
          {invoice && !isLoading && !error && (
            <>
              {(invoice.status === 'Approved' || invoice.status === 'Sent' || invoice.status === 'Paid') && (
                <Button
                  title="Send to STARS for Integration"
                  variant="primary"
                  icon="ti-cloud-upload"
                  onClick={async () => {
                    if (onSendToStars) {
                      onSendToStars(invoice);
                    } else {
                      try {
                        await invoicesService.sendToStars(invoice.invoiceNumber);
                      } catch (err) {
                        console.warn('STARS integration fallback:', err);
                      }
                    }
                  }}
                />
              )}
              <Button
                title={isDownloading ? "Generating PDF..." : "Download PDF"}
                variant="primary"
                icon={isDownloading ? "ti-loader-2 ti-spin" : "ti-file-type-pdf"}
                onClick={handleDownloadPdf}
                disabled={isDownloading}
              />
              <Button
                title="Print"
                variant="secondary"
                icon="ti-printer"
                onClick={handlePrint}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default InvoiceModal;
