import React, { useState, useEffect, useRef } from 'react';
import { useClientContext } from '../context/ClientContext';
import { useToast } from '../components/ToastContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, X, Camera, CheckCircle2 } from 'lucide-react';
import { QrPhPaymentView } from '../components/QrPhPaymentView';

export const PayInvoice: React.FC = () => {
  const { invoices, submitPayment, user } = useClientContext();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [paymentMethod, _setPaymentMethod] = useState<'PayMongo' | 'Bank Transfer' | 'GCash' | 'Maya'>('PayMongo');
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1); // 1: Form, 2: Simulating PayMongo, 3: Upload Proof, 4: Success
  const [fileAttached, setFileAttached] = useState(false);
  const [fileName, setFileName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [proofFileUrl, setProofFileUrl] = useState<string | null>(null);
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [aiScanResult, setAiScanResult] = useState<'success' | 'failed' | null>(null);
  const [aiScanMessage, setAiScanMessage] = useState('');
  
  const [showWaybillsModal, setShowWaybillsModal] = useState(false);
  const [selectedWaybill, setSelectedWaybill] = useState<any>(null);
  const [realWaybills, setRealWaybills] = useState<any[]>([]);

  useEffect(() => {
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
        }
      })
      .catch(() => {});
  }, [user]);

  const unpaidInvoices = invoices.filter(i => i.status === 'Unpaid' || i.status === 'Due Soon' || i.status === 'Overdue');
  const selectedInvoice = invoices.find(i => i.id === selectedInvoiceId);

  const displayedWaybills = realWaybills.filter(wb => {
    if (!selectedInvoice) return true;
    if (wb.invoiceNo && (wb.invoiceNo === selectedInvoice.invoiceNumber || wb.invoiceNo === selectedInvoice.id)) return true;
    if (wb.clientId && user?.id && wb.clientId.toLowerCase() === user.id.toLowerCase()) return true;
    if (wb.sender && user?.companyName && wb.sender.toLowerCase().includes(user.companyName.toLowerCase())) return true;
    return false;
  });

  const activeWaybills = displayedWaybills.length > 0 ? displayedWaybills : realWaybills.slice(0, 2);

  // Pre-select if navigated from "Pay now" or auto-select first unpaid invoice
  useEffect(() => {
    if (location.state?.invoiceId) {
      setSelectedInvoiceId(location.state.invoiceId);
    } else if (unpaidInvoices.length > 0 && !selectedInvoiceId) {
      setSelectedInvoiceId(unpaidInvoices[0].id);
    }
  }, [location.state, unpaidInvoices, selectedInvoiceId]);

  const handlePayMongoTrigger = async () => {
    if (!selectedInvoiceId || !selectedInvoice) return;

    setIsLoading(true);

    try {
      const fomsRes = await fetch('/api/speedpay/initiate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNo: selectedInvoice.invoiceNumber,
          amount: selectedInvoice.amount,
          paymentMethod: 'qrph',
          returnUrl: window.location.origin + '/pay-invoice'
        })
      });

      const fomsData = await fomsRes.json();
      if (!fomsRes.ok || !fomsData?.checkoutUrl) {
        throw new Error(fomsData?.message || 'Unable to start the payment checkout.');
      }

      setReferenceNo(fomsData.referenceOrNumber || fomsData.payMongoCheckoutId || '');
      setCheckoutUrl(fomsData.checkoutUrl);
      setShowModal(true);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to start the payment checkout.', 'Payment Error');
    } finally {
      setIsLoading(false);
    }
  };

  const simulatePayMongoSuccess = () => {
    setReferenceNo('');
    setStep(3);
  };

  const handleSubmitProof = async () => {
    if (!selectedInvoice) return;

    // The context's submitPayment will now handle BOTH the local state update AND the backend API call,
    // including the actual Base64 image instead of the placeholder.
    submitPayment(
      selectedInvoice.id, 
      paymentMethod as any, 
      referenceNo, 
      selectedInvoice.amount, 
      fileName || 'proof.jpg', 
      proofFileUrl || `https://placehold.co/600x400?text=Proof+${referenceNo}`
    );

    toast.success('Payment submitted for validation. You will receive an update once it is confirmed.', 'Payment Submitted');
    setStep(4);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontFamily: '"Inter", sans-serif' }}>
      
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        
        {selectedInvoice ? (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#0F172A', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>2</span>
              Payment details & Breakdown
            </h3>

            {/* Payment Breakdown Card - NEW STYLE (Image 3) */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '32px', background: '#FFF' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 900, color: '#0F172A', textTransform: 'uppercase' }}>{user?.companyName || user?.name || 'TEST COMPANY'}</h4>
                  <p style={{ margin: 0, fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>SERVICE AREA: {selectedInvoice.routeArea}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>METRO MANILA, PHILIPPINES</p>
                </div>
                <div style={{ background: '#F0FDFA', padding: '20px', borderRadius: '12px', minWidth: '260px', border: '1px solid #CCFBF1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Invoice Number</span>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Due Date</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>{selectedInvoice.invoiceNumber}</span>
                    <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>{new Date(selectedInvoice.dueDate).toLocaleDateString('en-US', {month: 'short', day: '2-digit', year: 'numeric'})}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px', fontWeight: 600 }}>Please Pay</div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A' }}>₱ {selectedInvoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
              
              <div style={{ marginBottom: '28px' }}>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px', fontWeight: 600 }}>Billing Period</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                  01 {new Date(selectedInvoice.dueDate).toLocaleString('en-US', { month: 'short', year: 'numeric' })} to {new Date(selectedInvoice.dueDate).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #E2E8F0', padding: '16px 0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#475569', fontSize: '13px', fontWeight: 500 }}>Remaining Balance from previous bill</span>
                <span style={{ color: '#0F172A', fontSize: '13px', fontWeight: 600 }}>0.00</span>
              </div>

              <div style={{ borderTop: '1px solid #E2E8F0', padding: '20px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <span style={{ color: '#0F172A', fontSize: '14px', fontWeight: 800 }}>Charges for this billing period</span>
                  <span style={{ color: '#0F172A', fontSize: '14px', fontWeight: 800 }}>{selectedInvoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Per-waybill breakdown */}
                {activeWaybills.map((wb) => {
                  const subtotal = wb.freight + wb.valuation + wb.oda;
                  const vatAmt = subtotal * (wb.vat / 100);
                  const total = subtotal + vatAmt;
                  return (
                    <div key={wb.waybillNo} style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px', marginBottom: '12px', border: '1px solid #E2E8F0' }}>
                      {/* Waybill header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: '#0F172A' }}>{wb.waybillNo}</span>
                          <span style={{ padding: '2px 8px', background: '#D1FAE5', color: '#065F46', fontSize: '10px', fontWeight: 700, borderRadius: '12px' }}>{wb.status}</span>
                        </div>
                        <button
                          onClick={() => { setShowWaybillsModal(true); setSelectedWaybill(wb); }}
                          style={{ background: 'transparent', border: 'none', color: '#0EA5E9', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                          View details →
                        </button>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>
                        {wb.sender} → {wb.receiver} • {wb.items}
                      </div>
                      {/* Waybill charge rows */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px', borderLeft: '3px solid #E2E8F0', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#64748B' }}>Freight</span>
                          <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{wb.freight.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#64748B' }}>Valuation (1%)</span>
                          <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{wb.valuation.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#64748B' }}>ODA</span>
                          <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{wb.oda.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px dashed #CBD5E1', paddingTop: '6px', marginTop: '2px' }}>
                          <span style={{ color: '#64748B' }}>Subtotal</span>
                          <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{subtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#64748B' }}>VAT ({wb.vat}%)</span>
                          <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{vatAmt.toFixed(2)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, color: '#0F172A', background: '#E0F2FE', padding: '8px 10px', borderRadius: '6px' }}>
                        <span>Waybill Total</span>
                        <span>₱{total.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Summary below all waybills */}
                <div style={{ padding: '12px 0 4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(() => {
                    const grossSubtotal = activeWaybills.reduce((s, wb) => s + (wb.freight || 0) + (wb.valuation || 0) + (wb.oda || 0), 0);
                    const totalVat = activeWaybills.reduce((s, wb) => s + ((wb.freight || 0) + (wb.valuation || 0) + (wb.oda || 0)) * ((wb.vat || 12) / 100), 0);
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#64748B' }}>Gross Subtotal ({activeWaybills.length} waybills)</span>
                          <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{grossSubtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#64748B' }}>Total VAT</span>
                          <span style={{ color: '#0F172A', fontWeight: 600 }}>₱{totalVat.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#64748B' }}>Government Taxes (Others)</span>
                          <span style={{ color: '#64748B', fontWeight: 500 }}>0.00</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#64748B' }}>Other Surcharges</span>
                          <span style={{ color: '#64748B', fontWeight: 500 }}>0.00</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div style={{ borderTop: '2px solid #E2E8F0', borderBottom: '2px solid #E2E8F0', padding: '24px 0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#0F172A', fontSize: '16px', fontWeight: 900 }}>Total Amount Due</span>
                <span style={{ color: '#0F172A', fontSize: '16px', fontWeight: 900 }}>₱ {selectedInvoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>



            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', padding: '16px', borderRadius: '8px', display: 'flex', gap: '12px', marginTop: '24px' }}>
              <Camera size={20} color="#D97706" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '13px', color: '#92400E' }}>
                Before redirecting to PayMongo: please take a <strong>screenshot</strong> of your payment as proof. You will need to upload this in the next step.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button 
                onClick={handlePayMongoTrigger}
                disabled={isLoading}
                style={{ background: '#0F172A', color: '#FFF', border: 'none', padding: '14px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {isLoading ? 'Connecting to PayMongo...' : 'Pay via PayMongo →'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', marginTop: '40px' }}>
            <h3 style={{ fontSize: '18px', color: '#0F172A', marginBottom: '8px' }}>No invoice selected</h3>
            <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px' }}>Please go to your invoices list and select an invoice to pay.</p>
            <button onClick={() => navigate('/my-invoices')} style={{ background: '#0EA5E9', color: '#FFF', border: 'none', padding: '10px 20px', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Go to My Invoices</button>
          </div>
        )}
      </div>

      {/* PayMongo Simulation Modal */}
      <AnimatePresence>
        {showModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={{ background: '#FFF', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              {/* Modal Header */}
              <div style={{ background: '#0F172A', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#FFF' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>PayMongo Checkout</h3>
                {step !== 4 && <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowModal(false)} />}
              </div>

              {/* Modal Body */}
              <div style={{ padding: '32px 24px', overflowY: 'auto', flex: 1 }}>
                {step === 2 && selectedInvoice && (
                  <QrPhPaymentView
                    amount={selectedInvoice.amount}
                    invoiceNumber={selectedInvoice.invoiceNumber}
                    onSimulateSuccess={simulatePayMongoSuccess}
                  />
                )}

                {step === 3 && (
                  <div>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', textAlign: 'center' }}>Upload Proof of Payment</h4>
                    <p style={{ fontSize: '13px', color: '#64748B', textAlign: 'center', marginBottom: '24px' }}>
                      Please upload your screenshot of the payment receipt.
                    </p>

                    {checkoutUrl && (
                      <div style={{ background: '#F0F9FF', padding: '12px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', fontSize: '13px' }}>
                        Didn't see the PayMongo popup?{' '}
                        <a href={checkoutUrl} target="_blank" rel="noreferrer" style={{ color: '#0EA5E9', fontWeight: 600, textDecoration: 'underline' }}>
                          Click here to open PayMongo Checkout
                        </a>
                      </div>
                    )}
                    
                    <input 
                      type="file" 
                      accept="image/*,application/pdf" 
                      ref={fileInputRef} 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setFileName(file.name);
                          setIsScanningAI(true);
                          setAiScanResult(null);
                          setFileAttached(false);
                          
                          const reader = new FileReader();
                          reader.onload = async (event) => {
                            if (event.target?.result) {
                              const dataUrl = event.target.result as string;
                              setProofFileUrl(dataUrl);
                              
                              try {
                                const formData = new FormData();
                                formData.append('file', file);
                                formData.append('invoiceId', selectedInvoice?.id || selectedInvoiceId);
                                formData.append('referenceNumber', referenceNo);
                                formData.append('amountPaid', String(selectedInvoice?.amount || 0));
                                formData.append('paymentMethod', paymentMethod);
                                formData.append('proofFileUrl', dataUrl);
                                formData.append('proofFileName', file.name);

                                const res = await fetch('/api/speedpay/validate-proof', {
                                  method: 'POST',
                                  body: formData
                                });

                                const data = await res.json();
                                setIsScanningAI(false);

                                if (res.ok && data.isValid) {
                                  setAiScanResult('success');
                                  setAiScanMessage(data.message || `AI Verified: Payment amount ₱${selectedInvoice?.amount.toLocaleString('en-US', {minimumFractionDigits:2})} matches.`);
                                  if (data.extractedReferenceNumber && !referenceNo) {
                                    setReferenceNo(data.extractedReferenceNumber);
                                  }
                                  setFileAttached(true);
                                  toast.success(data.message || 'Payment receipt verified by AI.', 'Validation Success');
                                } else {
                                  setAiScanResult('failed');
                                  setAiScanMessage(data.message || 'Image is blurry or not a recognized payment receipt. Please upload a clear image.');
                                  setFileAttached(false);
                                  toast.error(data.message || 'Receipt verification failed.', 'Validation Failed');
                                }
                              } catch {
                                setIsScanningAI(false);
                                setAiScanResult('failed');
                                setAiScanMessage('Receipt validation service temporarily unavailable.');
                                setFileAttached(false);
                              }
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <div style={{ transition: 'all 0.2s' }}>
                      <div 
                        onClick={() => !isScanningAI && fileInputRef.current?.click()}
                        style={{ border: '2px dashed #0EA5E9', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', cursor: isScanningAI ? 'not-allowed' : 'pointer', background: aiScanResult === 'success' ? '#F0FDF4' : aiScanResult === 'failed' ? '#FEF2F2' : '#F8FAFC' }}
                      >
                        {isScanningAI ? (
                          <div>
                            <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#0EA5E9', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px auto' }} />
                            <div style={{ color: '#0EA5E9', fontWeight: 600, fontSize: '14px' }}>AI is scanning your document...</div>
                            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                          </div>
                        ) : aiScanResult === 'success' ? (
                          <div>
                            <CheckCircle2 size={36} color="#10B981" style={{ margin: '0 auto 12px auto' }} />
                            <div style={{ color: '#16A34A', fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Scan Successful!</div>
                            <div style={{ color: '#15803D', fontSize: '13px' }}>{aiScanMessage}</div>
                            <div style={{ color: '#64748B', fontSize: '12px', marginTop: '12px', textDecoration: 'underline' }}>Click to change file</div>
                          </div>
                        ) : aiScanResult === 'failed' ? (
                          <div>
                            <X size={36} color="#EF4444" style={{ margin: '0 auto 12px auto' }} />
                            <div style={{ color: '#DC2626', fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Verification Failed</div>
                            <div style={{ color: '#B91C1C', fontSize: '13px' }}>{aiScanMessage}</div>
                            <div style={{ color: '#0EA5E9', fontSize: '13px', marginTop: '12px', fontWeight: 600 }}>Click to try again</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ width: 56, height: 56, background: '#0EA5E9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', boxShadow: '0 4px 6px -1px rgba(14, 165, 233, 0.3)' }}>
                              <UploadCloud size={28} color="#FFF" />
                            </div>
                            <div style={{ fontSize: '16px', color: '#0F172A', fontWeight: 700, marginBottom: '6px' }}>
                              Drag & Drop or Upload Document
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Support JPG, JPEG, and PNG receipt statements up to 10MB.</div>
                            
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
                              <button style={{ background: '#0EA5E9', color: '#FFF', border: 'none', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, pointerEvents: 'none' }}>Choose File</button>
                              <button style={{ background: '#FFF', color: '#0F172A', border: '1px solid #CBD5E1', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', pointerEvents: 'none' }}>
                                <Camera size={16} /> Scan Document
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <button 
                      disabled={!fileAttached}
                      onClick={handleSubmitProof}
                      style={{ width: '100%', marginTop: '24px', background: fileAttached ? '#0EA5E9' : '#CBD5E1', color: '#FFF', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: fileAttached ? 'pointer' : 'not-allowed' }}
                    >
                      Submit Payment
                    </button>
                  </div>
                )}

                {step === 4 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
                      <CheckCircle2 size={32} color="#10B981" />
                    </div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Payment Submitted</h3>
                    <p style={{ fontSize: '14px', color: '#64748B', lineHeight: '1.5', marginBottom: '32px' }}>
                      Your payment has been submitted and is waiting for Finance team validation.
                    </p>
                    <button 
                      onClick={() => { setShowModal(false); navigate('/history'); }}
                      style={{ width: '100%', background: '#0F172A', color: '#FFF', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      View Payment History
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Waybills Modal */}
      <AnimatePresence>
        {showWaybillsModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={{ background: '#FFF', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', overflow: 'hidden' }}>
              
              {/* Left Side: Waybill List */}
              <div style={{ width: '35%', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', background: '#F8FAFC' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFF' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>Waybills for {selectedInvoice?.invoiceNumber}</h3>
                </div>
                <div style={{ overflowY: 'auto', flex: 1, padding: '16px' }}>
                  {activeWaybills.map((wb, i) => (
                    <div 
                      key={i}
                      onClick={() => setSelectedWaybill(wb)}
                      style={{ padding: '16px', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '12px', cursor: 'pointer', background: selectedWaybill?.waybillNo === wb.waybillNo ? '#F0F9FF' : '#FFF', borderColor: selectedWaybill?.waybillNo === wb.waybillNo ? '#bae6fd' : '#E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}
                    >
                      <div style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A', marginBottom: '8px' }}>{wb.waybillNo}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748B' }}>
                        <span>{wb.date}</span>
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>₱{(wb.freight + wb.valuation + wb.oda + ((wb.freight + wb.valuation + wb.oda) * (wb.vat/100))).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side: Waybill Details */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: '#FFF' }}>
                <button onClick={() => setShowWaybillsModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '6px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <X size={18} color="#64748B" />
                </button>

                <div style={{ padding: '40px', overflowY: 'auto', flex: 1 }}>
                  {selectedWaybill ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#0F172A' }}>{selectedWaybill.waybillNo}</h2>
                        <span style={{ padding: '6px 12px', background: '#D1FAE5', color: '#065F46', fontSize: '11px', fontWeight: 800, borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={14} /> {selectedWaybill.status}
                        </span>
                      </div>

                      <h4 style={{ margin: '0 0 16px 0', fontSize: '12px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>WAYBILL DETAILS</h4>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                        {[
                          ['Sender', selectedWaybill.sender],
                          ['Receiver', selectedWaybill.receiver],
                          ['Delivery address', selectedWaybill.address],
                          ['Service', selectedWaybill.service],
                          ['Courier', selectedWaybill.courier],
                          ['Delivery date', selectedWaybill.date],
                          ['Items', selectedWaybill.items],
                          ['Declared value', `₱${selectedWaybill.declaredValue.toFixed(2)}`],
                          ['Remarks', selectedWaybill.remarks]
                        ].map(([label, val]) => (
                          <div key={label} style={{ display: 'flex' }}>
                            <span style={{ width: '150px', fontSize: '14px', color: '#64748B' }}>{label}</span>
                            <span style={{ flex: 1, fontSize: '14px', color: '#0F172A', fontWeight: label === 'Remarks' ? 600 : 500, textAlign: 'right' }}>{val}</span>
                          </div>
                        ))}
                      </div>

                      <div style={{ borderTop: '1px dashed #E2E8F0', margin: '0 -40px 32px -40px' }} />

                      <h4 style={{ margin: '0 0 20px 0', fontSize: '12px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>COMPUTATION - NCR / METRO MANILA</h4>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[
                          ['Actual weight', `${selectedWaybill.weight.toFixed(2)} kg`],
                          ['Volume weight', `${selectedWaybill.volumeWeight.toFixed(2)} kg`],
                          ['Chargeable (higher)', `${Math.max(selectedWaybill.weight, selectedWaybill.volumeWeight).toFixed(2)} kg - actual`]
                        ].map(([label, val]) => (
                          <div key={label} style={{ display: 'flex' }}>
                            <span style={{ width: '150px', fontSize: '14px', color: '#64748B' }}>{label}</span>
                            <span style={{ flex: 1, fontSize: '14px', color: '#0F172A', fontWeight: 700, textAlign: 'right' }}>{val}</span>
                          </div>
                        ))}
                      </div>

                      <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[
                          ['Freight', selectedWaybill.freight],
                          ['Valuation (1%)', selectedWaybill.valuation],
                          ['ODA', selectedWaybill.oda]
                        ].map(([label, val]) => (
                          <div key={label as string} style={{ display: 'flex' }}>
                            <span style={{ width: '150px', fontSize: '14px', color: '#0EA5E9' }}>{label}</span>
                            <span style={{ flex: 1, fontSize: '14px', color: '#0F172A', fontWeight: 700, textAlign: 'right' }}>₱{(val as number).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '15px', color: '#0F172A', fontWeight: 900 }}>Subtotal</span>
                          <span style={{ fontSize: '15px', color: '#0F172A', fontWeight: 900 }}>₱{(selectedWaybill.freight + selectedWaybill.valuation + selectedWaybill.oda).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', color: '#64748B' }}>VAT ({selectedWaybill.vat}%)</span>
                          <span style={{ fontSize: '14px', color: '#0F172A', fontWeight: 600 }}>₱{((selectedWaybill.freight + selectedWaybill.valuation + selectedWaybill.oda) * (selectedWaybill.vat/100)).toFixed(2)}</span>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', fontSize: '14px' }}>
                      Select a waybill from the list to view details
                    </div>
                  )}
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};
