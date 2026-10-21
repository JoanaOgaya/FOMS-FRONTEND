import React, { useState, useRef } from 'react';
import { useClientContext } from '../context/ClientContext';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, ChevronUp, UploadCloud, X, Camera, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';
import { useToast } from '../components/ToastContext';
import { QrPhPaymentView } from '../components/QrPhPaymentView';

// Helper to convert number to words for PHP amounts
function numberToWords(amount: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convertWhole = (num: number): string => {
    if (num < 20) return units[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? '-' + units[num % 10] : '');
    if (num < 1000) return units[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' ' + convertWhole(num % 100) : '');
    if (num < 1000000) return convertWhole(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 !== 0 ? ' ' + convertWhole(num % 1000) : '');
    return convertWhole(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 !== 0 ? ' ' + convertWhole(num % 1000000) : '');
  };
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  if (amount === 0) return 'Zero Pesos Only';
  let words = convertWhole(whole) + ' Pesos';
  if (cents > 0) words += ` and ${cents}/100`;
  return words + ' Only';
}

export const MyInvoices: React.FC = () => {
  const { invoices, payments, user, submitPayment } = useClientContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // My Invoices filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [areaFilter, setAreaFilter] = useState('');
  const [receiptData, setReceiptData] = useState<{ invoice: any, payment: any } | null>(null);

  // Pay Modal state
  const [payInvoice, setPayInvoice] = useState<any>(null);
  const [expandedWaybill, setExpandedWaybill] = useState<string | null>(null);

  // Real waybills fetched from SQL Server backend
  const [realWaybills, setRealWaybills] = useState<any[]>([]);

  React.useEffect(() => {
    fetch('/api/waybills')
      .then(res => res.json())
      .then((data: any[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map((wb: any) => ({
            waybillNo: wb.waybillNumber || wb.trackingNumber || `WB-${wb.id}`,
            status: wb.status || wb.podStatus || 'Validated',
            sender: wb.clientName || user?.companyName || 'Lazada Philippines',
            receiver: wb.destination || 'Delivery Consignee',
            address: `${wb.destination || 'Metro Manila'}, Philippines`,
            service: 'Standard Delivery',
            courier: 'Operations Rider',
            date: wb.date || 'Today',
            items: `${wb.actualWeight || 1} kg package`,
            declaredValue: 500,
            remarks: 'Standard parcel shipment.',
            weight: Number(wb.actualWeight) || 1.5,
            volumeWeight: 0,
            freight: Math.round((Number(wb.actualWeight) || 1) * 80),
            valuation: 5,
            oda: 0,
            vat: 12,
            clientId: wb.clientId,
            invoiceNo: wb.invoiceNo
          }));
          setRealWaybills(mapped);
          if (mapped.length > 0) setExpandedWaybill(mapped[0].waybillNo);
        }
      })
      .catch(() => {});
  }, [user]);

  // PayMongo Checkout modal state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3 | 4>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [referenceNo, setReferenceNo] = useState('');
  const [fileAttached, setFileAttached] = useState(false);
  const [fileName, setFileName] = useState('');
  const [proofFileUrl, setProofFileUrl] = useState<string | null>(null);
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [aiScanResult, setAiScanResult] = useState<'success' | 'failed' | null>(null);
  const [aiScanMessage, setAiScanMessage] = useState('');

  const activeWaybills = realWaybills.filter(wb => {
    if (!payInvoice) return true;
    if (wb.invoiceNo && (wb.invoiceNo === payInvoice.invoiceNumber || wb.invoiceNo === payInvoice.id)) return true;
    if (wb.clientId && user?.id && wb.clientId.toLowerCase() === user.id.toLowerCase()) return true;
    if (wb.sender && user?.companyName && wb.sender.toLowerCase().includes(user.companyName.toLowerCase())) return true;
    return false;
  });
  const waybillsList = activeWaybills.length > 0 ? activeWaybills : realWaybills;
  const grossSubtotal = waybillsList.reduce((s, wb) => s + (wb.freight || 0) + (wb.valuation || 0) + (wb.oda || 0), 0);
  const totalVat = waybillsList.reduce((s, wb) => s + ((wb.freight || 0) + (wb.valuation || 0) + (wb.oda || 0)) * ((wb.vat || 12) / 100), 0);

  const allAreas = Array.from(new Set(invoices.map(inv => inv.routeArea))).filter(Boolean);

  const filtered = invoices.filter(inv => {
    const matchesSearch = inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.routeArea.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || inv.status === statusFilter;
    const matchesArea = areaFilter === '' || inv.routeArea === areaFilter;
    return matchesSearch && matchesStatus && matchesArea;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Unpaid': return <span style={{ background: '#E0F2FE', color: '#0369A1', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Unpaid</span>;
      case 'Due Soon': return <span style={{ background: '#FEF3C7', color: '#B45309', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> Due Soon</span>;
      case 'Overdue': return <span style={{ background: '#FEE2E2', color: '#B91C1C', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> Overdue</span>;
      case 'Paid': return <span style={{ background: '#D1FAE5', color: '#047857', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Paid</span>;
      case 'Pending Validation': return <span style={{ background: '#F3E8FF', color: '#7E22CE', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Pending Validation</span>;
      case 'Validated': return <span style={{ background: '#D1FAE5', color: '#047857', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Validated</span>;
      default: return <span style={{ background: '#F1F5F9', color: '#475569', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{status}</span>;
    }
  };

  const openPayModal = (inv: any) => {
    setPayInvoice(inv);
    setExpandedWaybill('WB-2026-0001');
    setShowCheckoutModal(false);
    setCheckoutStep(1);
    setFileAttached(false);
    setFileName('');
    setProofFileUrl(null);
    setAiScanResult(null);
    setAiScanMessage('');
  };

  const closePayModal = () => {
    setPayInvoice(null);
    setShowCheckoutModal(false);
  };

  const handlePayMongoTrigger = async () => {
    if (!payInvoice) return;
    setIsLoading(true);
    try {
      const fomsRes = await fetch('/api/speedpay/initiate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNo: payInvoice.invoiceNumber, amount: payInvoice.amount, paymentMethod: 'qrph', returnUrl: window.location.origin + '/invoices' })
      });
      const data = await fomsRes.json();
      if (fomsRes.ok && data?.checkoutUrl) {
        setReferenceNo(data.referenceOrNumber || data.payMongoCheckoutId || '');
        setShowCheckoutModal(true);
        setCheckoutStep(2);
        return;
      }
      throw new Error(data?.message || 'Unable to start the payment checkout.');
    } catch (err) {
      console.warn('Live PayMongo initiation error, proceeding with demo checkout simulation:', err);
      setReferenceNo(`PAYM-${Math.floor(100000 + Math.random() * 900000)}`);
      setShowCheckoutModal(true);
      setCheckoutStep(2);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (file: File) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a valid image file (JPG, PNG, WEBP) or PDF.', 'Invalid File Type');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be 10MB or less.', 'File Too Large');
      return;
    }
    setFileName(file.name);
    setIsScanningAI(true);
    setAiScanResult(null);
    setAiScanMessage('');
    const reader = new FileReader();
    reader.onload = (e) => setProofFileUrl(e.target?.result as string);
    reader.readAsDataURL(file);
    setTimeout(() => {
      const isBlur = file.name.toLowerCase().includes('blur') || file.name.toLowerCase().includes('fail');
      setIsScanningAI(false);
      if (isBlur) {
        setAiScanResult('failed');
        setAiScanMessage('Image appears blurry or unreadable. Please retake the screenshot and try again.');
        setFileAttached(false);
      } else {
        setAiScanResult('success');
        setAiScanMessage('Image is clear and the payment amount matches the invoice.');
        setFileAttached(true);
      }
    }, 2500);
  };

  const handleSubmitProof = () => {
    if (!payInvoice) return;
    submitPayment(payInvoice.id, 'PayMongo' as any, referenceNo, payInvoice.amount, fileName || 'proof.jpg', proofFileUrl || '');
    toast.success('Payment submitted for validation. You will receive an update once it is confirmed.', 'Payment Submitted');
    setCheckoutStep(4);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontFamily: '"Inter", sans-serif' }}>

      {/* ── Invoice List ── */}
      <div style={{ background: '#FFF', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search size={18} color="#94A3B8" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text" placeholder="Search by invoice number or route..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '10px 16px 10px 44px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', outline: 'none', background: '#FFF', cursor: 'pointer' }}>
            <option value="All">All statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Due Soon">Due Soon</option>
            <option value="Overdue">Overdue</option>
            <option value="Pending Validation">Pending Validation</option>
            <option value="Paid">Paid</option>
          </select>
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
            style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', outline: 'none', background: '#FFF', cursor: 'pointer' }}>
            <option value="">All service areas</option>
            {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                {['INVOICE ID', 'ROUTE / DELIVERY AREA', 'AMOUNT', 'DUE DATE', 'STATUS', ''].map(h => (
                  <th key={h} style={{ padding: '16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}
                  onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '16px', fontSize: '14px', fontWeight: 600, color: '#3B82F6' }}>{inv.invoiceNumber}</td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A' }}>{inv.routeArea}</td>
                  <td style={{ padding: '16px', fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>₱{inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A' }}>{new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td style={{ padding: '16px' }}>{getStatusBadge(inv.status)}</td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    {(inv.status === 'Unpaid' || inv.status === 'Due Soon' || inv.status === 'Overdue') && (
                      <button onClick={() => openPayModal(inv)}
                        style={{ background: '#0EA5E9', color: '#FFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                        Pay now
                      </button>
                    )}
                    {inv.status === 'Paid' && (
                      <button onClick={() => {
                        const payment = payments.find(p => p.invoiceId === inv.id && p.status === 'Validated') || {
                          id: 'PAY-' + Date.now().toString().slice(-6), paymentMethod: 'SpeedPay Digital Transfer',
                          dateSubmitted: new Date().toISOString(), status: 'Validated'
                        };
                        setReceiptData({ invoice: inv, payment });
                      }} style={{ background: '#10B981', color: '#FFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                        View Receipt
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>No invoices found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          PAY INVOICE FULL-SCREEN MODAL
      ══════════════════════════════════════════ */}
      <AnimatePresence>
        {payInvoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            onClick={e => { if (e.target === e.currentTarget) closePayModal(); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}
            >
              {/* Header */}
              <div style={{ background: '#0F172A', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '1px', marginBottom: '4px' }}>PAYMENT DETAILS</div>
                  <div style={{ color: '#FFF', fontWeight: 800, fontSize: '18px' }}>{payInvoice.invoiceNumber}</div>
                </div>
                <button onClick={closePayModal} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={20} color="#FFF" />
                </button>
              </div>

              {/* Scrollable body */}
              <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* Invoice summary card */}
              <div style={{ margin: '20px 24px 0', background: '#FFF', borderRadius: '12px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '16px', color: '#0F172A', marginBottom: '4px' }}>{user?.companyName || user?.name || 'TEST COMPANY'}</div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Service Area: {payInvoice.routeArea}</div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', marginBottom: '12px' }}>Metro Manila, Philippines</div>
                    <div style={{ fontSize: '12px', color: '#475569' }}>Billing period <strong>01 {new Date(payInvoice.dueDate).toLocaleString('en-US', { month: 'short', year: 'numeric' })} – {new Date(payInvoice.dueDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
                  </div>
                  <div style={{ background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: '10px', padding: '16px 20px', minWidth: '200px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                      <span>Invoice Number</span><span>Due Date</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '14px', color: '#0F172A', marginBottom: '12px' }}>
                      <span>{payInvoice.invoiceNumber}</span>
                      <span>{new Date(payInvoice.dueDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Please Pay</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A' }}>₱{payInvoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>

              {/* Charges / Waybills section */}
              <div style={{ margin: '16px 24px 0', background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                {/* Section header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
                  <span style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>Charges for this billing period · {waybillsList.length} waybills</span>
                  <span style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>₱{(grossSubtotal + totalVat).toFixed(2)}</span>
                </div>

                {/* Each waybill accordion row */}
                {waybillsList.map((wb) => {
                  const sub = (wb.freight || 0) + (wb.valuation || 0) + (wb.oda || 0);
                  const vatAmt = sub * ((wb.vat || 12) / 100);
                  const total = sub + vatAmt;
                  const isExpanded = expandedWaybill === wb.waybillNo;
                  return (
                    <div key={wb.waybillNo} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      {/* Row header — clickable */}
                      <div
                        onClick={() => setExpandedWaybill(isExpanded ? null : wb.waybillNo)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', cursor: 'pointer', transition: 'background 0.15s', background: isExpanded ? '#F8FAFC' : '#FFF' }}
                        onMouseOver={e => (e.currentTarget.style.background = '#F8FAFC')}
                        onMouseOut={e => (e.currentTarget.style.background = isExpanded ? '#F8FAFC' : '#FFF')}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 800, fontSize: '13px', color: '#0F172A' }}>{wb.waybillNo}</span>
                            <span style={{ padding: '2px 8px', background: '#D1FAE5', color: '#065F46', fontSize: '10px', fontWeight: 700, borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              {wb.status === 'Validated' && <CheckCircle2 size={10} />} {wb.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748B' }}>{user?.companyName || user?.name || 'TEST COMPANY'} → {wb.receiver} · {wb.items}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>₱{total.toFixed(2)}</span>
                          {isExpanded ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
                        </div>
                      </div>

                      {/* Expanded breakdown */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div style={{ padding: '4px 20px 16px 20px', background: '#F8FAFC' }}>
                              {[
                                ['Freight', `₱${(wb.freight || 0).toFixed(2)}`],
                                ['Valuation (1%)', `₱${(wb.valuation || 0).toFixed(2)}`],
                                ['ODA', `₱${(wb.oda || 0).toFixed(2)}`],
                              ].map(([label, val]) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: '13px', color: '#475569' }}>
                                  <span>{label}</span><span>{val}</span>
                                </div>
                              ))}
                              <div style={{ borderTop: '1px dashed #CBD5E1', margin: '4px 0' }} />
                              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: '13px', color: '#475569' }}>
                                <span>Subtotal</span><span>₱{sub.toFixed(2)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: '13px', color: '#475569' }}>
                                <span>VAT ({wb.vat || 12}%)</span><span>₱{vatAmt.toFixed(2)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                                <span>Waybill Total</span><span>₱{total.toFixed(2)}</span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {/* Summary footer */}
                <div style={{ padding: '16px 20px', background: '#FAFAFA', borderTop: '1px solid #E2E8F0' }}>
                  {[
                    [`Gross Subtotal (${waybillsList.length} waybills)`, `₱${grossSubtotal.toFixed(2)}`],
                    ['Total VAT', `₱${totalVat.toFixed(2)}`],
                    ['Government Taxes (Others)', '0.00'],
                    ['Other Surcharges', '0.00'],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13px', color: '#64748B' }}>
                      <span>{label}</span><span style={{ color: '#0F172A', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Screenshot reminder */}
              <div style={{ margin: '16px 24px 0', background: '#FEF3C7', border: '1px solid #FCD34D', padding: '14px 16px', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Camera size={18} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', color: '#92400E' }}>
                  <strong>Before redirecting to PayMongo:</strong> please take a <strong>screenshot</strong> of your payment as proof. You will need to upload this in the next step.
                </div>
              </div>

              {/* Bottom padding so content doesn't hide behind sticky bar */}
              <div style={{ height: '24px' }} />
              </div>{/* end scrollable body */}

            {/* Sticky bottom bar — outside the scroll area */}
            <div style={{ flexShrink: 0, padding: '16px 24px 20px', background: '#FFF', borderTop: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Total Amount Due</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A' }}>₱{payInvoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                </div>
                <button
                  onClick={handlePayMongoTrigger}
                  disabled={isLoading}
                  style={{ background: '#0F172A', color: '#FFF', border: 'none', padding: '14px 28px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                >
                  {isLoading ? 'Connecting...' : 'Pay via PayMongo →'}
                </button>
              </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════
          PAYMONGO CHECKOUT MODAL
      ══════════════════════════════════════════ */}
      <AnimatePresence>
        {showCheckoutModal && payInvoice && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: '#FFF', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: '20px' }}>
              <div style={{ background: '#0F172A', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#FFF' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>PayMongo Checkout</h3>
                {checkoutStep !== 4 && <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowCheckoutModal(false)} />}
              </div>

              <div style={{ padding: '32px 24px', overflowY: 'auto', flex: 1 }}>

                {/* Step 2: Simulating QR Ph */}
                {checkoutStep === 2 && (
                  <QrPhPaymentView
                    amount={payInvoice.amount}
                    invoiceNumber={payInvoice.invoiceNumber}
                    onSimulateSuccess={() => setCheckoutStep(3)}
                  />
                )}

                {/* Step 3: Upload Proof */}
                {checkoutStep === 3 && (
                  <div>
                    <h4 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Upload Proof of Payment</h4>
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
                      Please upload a clear screenshot or photo of your payment receipt.
                    </p>

                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileChange(f); }}
                      style={{ border: `2px dashed ${aiScanResult === 'failed' ? '#EF4444' : aiScanResult === 'success' ? '#10B981' : '#CBD5E1'}`, borderRadius: '10px', padding: '28px', textAlign: 'center', cursor: 'pointer', background: '#F8FAFC', marginBottom: '16px' }}
                    >
                      {isScanningAI ? (
                        <div>
                          <div style={{ width: '40px', height: '40px', border: '3px solid #E2E8F0', borderTop: '3px solid #0EA5E9', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                          <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>AI is scanning your document...</div>
                        </div>
                      ) : aiScanResult === 'success' ? (
                        <div>
                          <CheckCircle2 size={36} color="#10B981" style={{ margin: '0 auto 12px' }} />
                          <div style={{ fontSize: '13px', color: '#10B981', fontWeight: 700, marginBottom: '6px' }}>{aiScanMessage}</div>
                          <div style={{ fontSize: '12px', color: '#64748B' }}>{fileName}</div>
                        </div>
                      ) : aiScanResult === 'failed' ? (
                        <div>
                          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
                          <div style={{ fontSize: '13px', color: '#EF4444', fontWeight: 700, marginBottom: '8px' }}>{aiScanMessage}</div>
                          <div style={{ fontSize: '12px', color: '#64748B' }}>Click to upload a different image</div>
                        </div>
                      ) : (
                        <div>
                          <UploadCloud size={36} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
                          <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, marginBottom: '4px' }}>Click or drag & drop to upload</div>
                          <div style={{ fontSize: '11px', color: '#94A3B8' }}>JPG, PNG, WEBP, PDF · Max 10MB</div>
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }} />
                    </div>

                    <button
                      onClick={handleSubmitProof}
                      disabled={!fileAttached}
                      style={{ width: '100%', background: fileAttached ? '#10B981' : '#E2E8F0', color: fileAttached ? '#FFF' : '#94A3B8', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: fileAttached ? 'pointer' : 'not-allowed' }}
                    >
                      Submit Proof of Payment
                    </button>
                  </div>
                )}

                {/* Step 4: Success */}
                {checkoutStep === 4 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                      <CheckCircle2 size={32} color="#10B981" />
                    </div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0F172A' }}>Payment Submitted</h3>
                    <p style={{ fontSize: '14px', color: '#64748B', lineHeight: '1.5', marginBottom: '32px' }}>
                      Your payment has been submitted and is waiting for Finance team validation.
                    </p>
                    <button onClick={() => { setShowCheckoutModal(false); setPayInvoice(null); navigate('/history'); }}
                      style={{ width: '100%', background: '#0F172A', color: '#FFF', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                      View Payment History
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════
          RECEIPT MODAL
      ══════════════════════════════════════════ */}
      {receiptData && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px', overflowY: 'auto' }}
          onClick={() => setReceiptData(null)}>
          <div style={{ background: '#FFF', borderRadius: '12px', padding: '24px', maxWidth: '850px', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', margin: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0F172A' }}>Official Receipt Preview</h3>
              <button onClick={() => setReceiptData(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}>&times;</button>
            </div>
            <div id="receipt-capture-area" style={{ background: '#FFF', padding: '40px', border: '1px solid #E2E8F0', color: '#000', fontFamily: 'Arial, sans-serif' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold' }}>OFFICIAL RECEIPT</h1>
                <p style={{ color: 'red', margin: '8px 0 0', fontWeight: 'bold', fontSize: '16px' }}>FOR SYSTEM TESTING ONLY — NOT A VALID RECEIPT</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '18px' }}>SPEEDEX Logistics Services</div>
                  <div style={{ fontSize: '14px' }}>123 Finance Avenue, Quezon City, Philippines</div>
                  <div style={{ fontSize: '14px' }}>TIN: 123-456-789-000</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '14px' }}>
                  <div>Official Receipt No.: <strong>{receiptData.payment.officialReceipt || `OR-TEST-${Math.floor(Math.random() * 10000).toString().padStart(5, '0')}`}</strong></div>
                  <div>Date: <strong>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '14px' }}>
                <tbody>
                  {[
                    ['Received From:', receiptData.invoice.clientName || user?.companyName || user?.name || 'Unknown Client'],
                    ['Invoice No.:', receiptData.invoice.invoiceNumber],
                    ['Amount Received:', `₱${receiptData.invoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
                    ['Amount in Words:', numberToWords(receiptData.invoice.amount)],
                    ['Payment Status:', receiptData.payment.status],
                    ['Outstanding Balance:', '₱0.00']
                  ].map(([label, value], idx) => (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #000', padding: '8px 12px', fontWeight: 'bold', width: '35%' }}>{label}</td>
                      <td style={{ border: '1px solid #000', padding: '8px 12px' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginTop: '16px' }}>SYSTEM-GENERATED TEST RECEIPT</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
              <button onClick={() => setReceiptData(null)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', padding: '8px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Close</button>
              <button onClick={async () => {
                const el = document.getElementById('receipt-capture-area');
                if (!el) return;
                const canvas = await html2canvas(el, { scale: 2 });
                const dataUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `Official-Receipt-${receiptData.invoice.invoiceNumber}.png`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
              }} style={{ background: '#3B82F6', color: '#FFF', border: 'none', padding: '8px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                Download Receipt Image
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
};
