import React from 'react';
import { useClientContext } from '../context/ClientContext';
import { motion } from 'framer-motion';
import { FileText, X, Download, Clock, CheckCircle2, XCircle } from 'lucide-react';
import type { PaymentRecord } from '../data/mockData';

export const PaymentHistory: React.FC = () => {
  const { payments, user } = useClientContext();
  const [selectedOR, setSelectedOR] = React.useState<PaymentRecord | null>(null);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Pending Validation': return <span style={{ background: '#F3E8FF', color: '#7E22CE', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Pending Validation</span>;
      case 'Validated': return <span style={{ background: '#D1FAE5', color: '#047857', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Validated</span>;
      case 'Rejected': return <span style={{ background: '#FEE2E2', color: '#B91C1C', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><XCircle size={12} /> Rejected</span>;
      default: return <span style={{ background: '#F1F5F9', color: '#475569', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{status}</span>;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontFamily: '"Inter", sans-serif' }}>
      
      <div style={{ background: '#FFF', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', padding: '24px' }}>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>DATE SUBMITTED</th>
                <th style={{ padding: '16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>INVOICE ID</th>
                <th style={{ padding: '16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>REFERENCE NO.</th>
                <th style={{ padding: '16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>METHOD</th>
                <th style={{ padding: '16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>AMOUNT</th>
                <th style={{ padding: '16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>STATUS</th>
                <th style={{ padding: '16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>REMARKS</th>
                <th style={{ padding: '16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em', textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(pay => (
                <tr key={pay.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#64748B' }}>
                    {new Date(pay.dateSubmitted.endsWith('Z') ? pay.dateSubmitted : pay.dateSubmitted + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', fontWeight: 600, color: '#3B82F6' }}>{pay.invoiceId}</td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontFamily: 'monospace' }}>{pay.referenceNo}</td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A' }}>{pay.paymentMethod}</td>
                  <td style={{ padding: '16px', fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>₱{pay.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '16px' }}>{getStatusBadge(pay.status)}</td>
                  <td style={{ padding: '16px', fontSize: '13px' }}>
                    {pay.status === 'Validated' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontWeight: 500 }}>
                        <FileText size={14} /> Paid
                      </div>
                    )}
                    {pay.status === 'Rejected' && (
                      <div style={{ color: '#EF4444' }}>
                        Payment failed due to {pay.rejectionReason || 'an unknown reason'}. Please try again.
                      </div>
                    )}
                    {pay.status === 'Pending Validation' && (
                      <div style={{ color: '#94A3B8' }}>Awaiting Finance</div>
                    )}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    {pay.status === 'Validated' && (
                      <button
                        onClick={() => setSelectedOR(pay)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#0EA5E9',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textUnderlineOffset: '4px'
                        }}
                      >
                        View OR
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>
                    No payment history found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Official Receipt Modal */}
      {selectedOR && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedOR(null); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}
          >
            {/* Header */}
            <div style={{ background: '#0F172A', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '1px', marginBottom: '4px' }}>OFFICIAL RECEIPT</div>
                <div style={{ color: '#FFF', fontWeight: 800, fontSize: '18px' }}>{selectedOR.invoiceId}</div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  style={{ background: '#0EA5E9', border: 'none', borderRadius: '8px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#FFF', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                  onClick={() => alert('Download started...')}
                >
                  <Download size={16} /> Download
                </button>
                <button onClick={() => setSelectedOR(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={20} color="#FFF" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
              <div style={{ background: '#FFF', padding: '32px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                {/* OR Header */}
                <div style={{ textAlign: 'center', borderBottom: '2px dashed #E2E8F0', paddingBottom: '24px', marginBottom: '24px' }}>
                  <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px' }}>SPEEDEX COURIER</h1>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748B' }}>123 Logistics Hub, Metro Manila, PH</p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>VAT Reg TIN: 000-123-456-000</p>
                  <div style={{ marginTop: '24px', display: 'inline-block', background: '#F8FAFC', padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', marginRight: '8px' }}>RECEIPT NO.</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>OR-{Math.floor(100000 + Math.random() * 900000)}</span>
                  </div>
                </div>

                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', marginBottom: '4px' }}>RECEIVED FROM</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{user?.companyName || user?.name || 'TEST COMPANY'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', marginBottom: '4px' }}>DATE</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                      {new Date(selectedOR.dateSubmitted).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                </div>

                {/* Amount */}
                <div style={{ background: '#F8FAFC', padding: '20px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '32px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>AMOUNT PAID</div>
                  <div style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A' }}>
                    ₱{selectedOR.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Details */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>Payment Method</span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedOR.paymentMethod}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>Reference No.</span>
                    <span style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>{selectedOR.referenceNo}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>Invoice ID</span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedOR.invoiceId}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

    </motion.div>
  );
};
