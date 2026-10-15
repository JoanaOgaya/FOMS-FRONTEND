import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { Button } from '../components/Buttons';
import type { Receipt, Client, Invoice, Payment } from '../types/entities';

// Shared date formatter displaying dates consistently as "Oct 11, 2026"
export const formatReceiptDate = (dateVal?: string | Date | null): string => {
  if (!dateVal) return '-';
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? String(dateVal) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Converts numeric pesos amount into word representation (e.g. "Fifteen thousand pesos only")
export function numberToWords(amount: number): string {
  if (amount === 0) return 'Zero pesos only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function conv(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + conv(n % 100) : '');
    if (n < 1000000) return conv(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + conv(n % 1000) : '');
    return conv(Math.floor(n / 1000000)) + ' Million' + (n % 1000000 ? ' ' + conv(n % 1000000) : '');
  }
  const pesos = Math.floor(amount);
  const centavos = Math.round((amount - pesos) * 100);
  let result = conv(pesos) + ' Pesos';
  if (centavos > 0) result += ' and ' + conv(centavos) + '/100 Centavos';
  return result + ' Only';
}

export interface ReceiptModalProps {
  isOpen: boolean;
  receiptId: string | null;
  onClose: () => void;
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  receipts: Receipt[];
  isLoading?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  receiptId,
  onClose,
  clients,
  invoices,
  payments,
  receipts,
  isLoading,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const lastLoadedReceiptRef = useRef<any>(null);

  // Keep showing the loaded receipt while refetching so the modal never unmounts and remounts
  const resolvedReceipt = useMemo(() => {
    if (!receiptId) return null;
    const raw = receipts.find((r: Receipt) => r.id === receiptId) ||
      payments.find((p: Payment) => p.id === receiptId || p.referenceNumber === receiptId || p.orNumber === receiptId);
    if (raw) {
      lastLoadedReceiptRef.current = raw;
      return raw;
    }
    return lastLoadedReceiptRef.current;
  }, [receiptId, receipts, payments]);

  // If receiptId is invalid or not found, close the modal and show a short toast
  useEffect(() => {
    if (isOpen && receiptId && !resolvedReceipt && !isLoading) {
      toast.error('Receipt not found', 'Error');
      onClose();
    }
  }, [isOpen, receiptId, resolvedReceipt, isLoading, onClose, toast]);

  // Lock background scroll and trap Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !resolvedReceipt) return null;

  const rawPayment = payments.find((p: Payment) => p.id === (resolvedReceipt as any).paymentId || p.id === resolvedReceipt.id);
  const client = clients.find((c: Client) => c.id === resolvedReceipt.clientId || c.clientCode === resolvedReceipt.clientId) || {
    name: (resolvedReceipt as any).clientName || rawPayment?.clientName || resolvedReceipt.clientId,
    tin: (resolvedReceipt as any).tin || '000-123-456-000',
    address: (resolvedReceipt as any).address || 'Metro Manila, Philippines'
  };
  const invoice = invoices.find((i: Invoice) => i.id === resolvedReceipt.invoiceId || i.invoiceNumber === (resolvedReceipt as any).invoiceNumber);

  const or = {
    ...resolvedReceipt,
    receiptNumber: (resolvedReceipt as any).receiptNumber || (resolvedReceipt as any).orNumber || `OR-${resolvedReceipt.referenceNumber || resolvedReceipt.id.slice(0, 8).toUpperCase()}`,
    clientName: client?.name ?? (resolvedReceipt as any).clientName ?? 'Unknown',
    clientCode: resolvedReceipt.clientId || '-',
    invoiceNumber: invoice?.invoiceNumber ?? (resolvedReceipt as any).invoiceNumber ?? resolvedReceipt.invoiceId ?? 'N/A',
    paymentMethod: rawPayment?.paymentMethod ?? (resolvedReceipt as any).paymentMethod ?? 'SpeedPay (GCash)',
    referenceNumber: rawPayment?.referenceNumber ?? resolvedReceipt.referenceNumber ?? 'N/A',
    amount: Number(resolvedReceipt.amount) || 0,
    issuedAt: (resolvedReceipt as any).issuedAt || (resolvedReceipt as any).paymentDate || (resolvedReceipt as any).submittedAt || new Date().toISOString(),
  };

  const issuedByName = user?.fullName || 'Finance Accountant';
  const invoiceStatus = (invoice?.status || (invoice as any)?.paymentStatus || (or as any)?.invoiceStatus || 'Paid');
  const isPaid = String(invoiceStatus).toLowerCase() === 'paid' || rawPayment?.status === 'Validated' || rawPayment?.status === 'Approved';
  const isPartial = String(invoiceStatus).toLowerCase().includes('partial');
  const watermarkText = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : null;

  const [isDownloading, setIsDownloading] = useState(false);

  // Download PDF handler that renders the receipt to a PDF file, falling back to window.print()
  const handleDownloadPdf = async () => {
    const element = document.getElementById('printable-receipt-card');
    if (!element) {
      window.print();
      return;
    }

    setIsDownloading(true);
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = (html2pdfModule as any).default || html2pdfModule;
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Official_Receipt_${or.receiptNumber || 'Speedex'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Official Receipt Details"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(4px)',
        padding: '24px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      {/* Print stylesheet hiding backdrop, top bar, and background page */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-receipt-card, #printable-receipt-card * {
            visibility: visible !important;
          }
          #printable-receipt-card {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 16px !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            page-break-inside: avoid !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      {/* Centered modal container with 24px viewport margin */}
      <div
        style={{
          background: '#FFFFFF',
          width: '100%',
          maxWidth: '900px',
          maxHeight: 'calc(100vh - 48px)',
          margin: '24px auto',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky top bar with status info, Print action, and X close button */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            background: '#FFFFFF',
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #E2E8F0',
            zIndex: 20,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: '28px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>PAYMENT STATUS</span>
              <span style={{ color: '#D97706', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ background: '#FEF3C7', display: 'flex', padding: '2px', borderRadius: '50%' }}>
                  <i className="ti ti-alert-circle" style={{ color: '#D97706', fontSize: '14px' }} />
                </span>
                Issued OR
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>INVOICE STATUS</span>
              <span style={{ color: isPaid ? '#059669' : '#D97706', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ background: isPaid ? '#D1FAE5' : '#FEF3C7', display: 'flex', padding: '2px', borderRadius: '50%' }}>
                  <i className={`ti ${isPaid ? 'ti-check' : 'ti-clock'}`} style={{ color: isPaid ? '#059669' : '#D97706', fontSize: '14px' }} />
                </span>
                {isPaid ? 'Paid' : isPartial ? 'Partial' : String(invoiceStatus)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>DATE ISSUED</span>
              <span style={{ color: '#0F172A', fontWeight: 700, fontSize: '13px' }}>{formatReceiptDate(or.issuedAt)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                color: '#64748B',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F1F5F9';
                e.currentTarget.style.color = '#0F172A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = '#64748B';
              }}
            >
              <i className="ti ti-x" style={{ fontSize: '20px' }} />
            </button>
          </div>
        </div>

        {/* Scrollable receipt body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '24px', background: '#F8FAFC' }}>
          <div
            id="printable-receipt-card"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '36px',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            {/* Watermark conditioned strictly on invoice status */}
            {watermarkText && (
              <div
                style={{
                  position: 'absolute',
                  top: '35%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-20deg)',
                  pointerEvents: 'none',
                  border: watermarkText === 'PAID' ? '6px solid rgba(220, 38, 38, 0.15)' : '6px solid rgba(217, 119, 6, 0.15)',
                  color: watermarkText === 'PAID' ? 'rgba(220, 38, 38, 0.15)' : 'rgba(217, 119, 6, 0.15)',
                  padding: '10px 30px',
                  fontSize: '5rem',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  zIndex: 0,
                }}
              >
                {watermarkText}
              </div>
            )}

            {/* Receipt Header */}
            <div style={{ textAlign: 'center', marginBottom: '32px', position: 'relative', zIndex: 1 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>Speedex Courier & Forwarder, Inc.</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>123 Rizal St, Brgy. Poblacion, Cebu City</p>
              <h1 style={{ margin: '24px 0 16px', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#0F172A' }}>
                RECEIPT
              </h1>
            </div>

            {/* Receipt Meta Details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px', fontSize: '0.85rem', position: 'relative', zIndex: 1, gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', color: '#0F172A' }}>
                <span style={{ color: '#64748B' }}>Receipt #:</span> <strong>{or.receiptNumber}</strong>
                <span style={{ color: '#64748B' }}>Issue Date:</span> <strong>{formatReceiptDate(or.issuedAt)}</strong>
                <span style={{ color: '#64748B' }}>Payment Method:</span> <strong>{or.paymentMethod}</strong>
                <span style={{ color: '#64748B' }}>Reference #:</span> <strong>{or.referenceNumber}</strong>
              </div>
              <div style={{ textAlign: 'right', color: '#0F172A' }}>
                <span style={{ color: '#64748B', display: 'block', marginBottom: '4px' }}>Received From:</span>
                <strong style={{ fontSize: '1rem' }}>{or.clientName}</strong>
                <p style={{ margin: '4px 0 0', color: '#475569' }}>Code: {or.clientCode}</p>
                <p style={{ margin: '4px 0 0', color: '#475569' }}>TIN: {client?.tin || (client as any)?.TIN || 'N/A'}</p>
                <p style={{ margin: '4px 0 0', color: '#475569' }}>Address: {client?.address || 'N/A'}</p>
                <p style={{ margin: '4px 0 0', color: '#475569' }}>Invoice No: {or.invoiceNumber}</p>
              </div>
            </div>

            {/* Amount Received in figures and words */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', position: 'relative', zIndex: 1, borderTop: '2px dashed #CBD5E1', paddingTop: '16px', marginTop: '8px' }}>
              <div style={{ width: '320px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 8px' }}>
                  <span style={{ fontSize: '0.95rem', color: '#0F172A', fontWeight: 800 }}>Amount Received</span>
                  <span style={{ fontSize: '1.15rem', color: '#0F172A', fontWeight: 900 }}>₱{or.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: 8, marginTop: '16px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
              <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>AMOUNT IN WORDS</span>
              <strong style={{ color: '#0F172A', fontSize: '0.9rem' }}>{numberToWords(or.amount)}</strong>
            </div>

            {/* Receipt Footer with Authorized Representative signature */}
            <div style={{ marginTop: '48px', position: 'relative', zIndex: 1 }}>
              <p style={{ margin: '0 0 24px', fontSize: '1rem', color: '#0F172A', fontWeight: 600, textAlign: 'center' }}>Thank you!</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>System-generated receipt from Speedex FOMS.</p>
                </div>
                <div style={{ textAlign: 'center', minWidth: 180 }}>
                  <div style={{ borderTop: '1.5px solid #0F172A', paddingTop: 6 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#0F172A', fontWeight: 700 }}>{issuedByName}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Authorized Representative</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Modal footer with Close and Download as PDF button */}
        <div
          style={{
            padding: '12px 24px',
            background: '#FFFFFF',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <Button title="Close" variant="secondary" onClick={onClose} />
          <Button
            title={isDownloading ? "Downloading..." : "Download as PDF"}
            variant="primary"
            icon="ti-download"
            loading={isDownloading}
            onClick={handleDownloadPdf}
          />
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
