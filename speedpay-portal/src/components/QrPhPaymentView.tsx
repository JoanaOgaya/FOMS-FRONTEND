import React, { useState, useEffect } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';

interface QrPhPaymentViewProps {
  amount: number;
  invoiceNumber: string;
  onSimulateSuccess: () => void;
}

export const QrPhPaymentView: React.FC<QrPhPaymentViewProps> = ({
  amount,
  invoiceNumber,
  onSimulateSuccess
}) => {
  const [secondsLeft, setSecondsLeft] = useState(1784); // 29:44 default countdown

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleDownloadQr = () => {
    const svgElement = document.getElementById('speedpay-qrph-svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `QRPh-${invoiceNumber || 'Payment'}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '8px 4px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      
      {/* ── Title: Scan QR Ph code to pay ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        fontSize: '17px',
        fontWeight: 600,
        color: '#1E293B',
        marginBottom: '10px'
      }}>
        <span>Scan</span>
        
        {/* QR Ph Logo */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 800 }}>
          <span style={{ color: '#0038A8', fontSize: '18px', letterSpacing: '-0.5px' }}>QR</span>
          <span style={{ color: '#CE1126', fontSize: '18px', letterSpacing: '-0.5px' }}>Ph</span>
        </span>
        
        <span>code to pay</span>
      </div>

      {/* ── Supported Payment Options: GCash & Maya ONLY ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        marginBottom: '20px'
      }}>
        {/* GCash Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: '#F0F9FF',
          border: '1px solid #BAE6FD',
          borderRadius: '6px'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#007DFE" />
            <path d="M12 6C8.686 6 6 8.686 6 12C6 15.314 8.686 18 12 18C14.35 18 16.38 16.65 17.37 14.69H14.86C14.19 15.5 13.16 16 12 16C9.79 16 8 14.21 8 12C8 9.79 9.79 8 12 8C13.2 8 14.25 8.53 14.93 9.38L16.48 7.83C15.37 6.7 13.78 6 12 6Z" fill="#FFFFFF" />
          </svg>
          <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#007DFE', letterSpacing: '-0.2px' }}>
            GCash
          </span>
        </div>

        {/* Maya Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: '6px'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#00D084" />
            <path d="M6 16V8L9.5 13L13 8V16H11V11.2L9.5 13.4L8 11.2V16H6Z" fill="#FFFFFF" />
            <path d="M14 11C14 9.5 15 8.5 16.5 8.5C18 8.5 19 9.5 19 11V16H17V11.5C17 10.7 16.5 10.3 16 10.3C15.5 10.3 15 10.7 15 11.5V16H14V11Z" fill="#FFFFFF" />
          </svg>
          <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#047857', letterSpacing: '-0.2px' }}>
            maya
          </span>
        </div>
      </div>

      {/* ── QR Card Frame with Timer ── */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 20px 20px',
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
        marginBottom: '20px'
      }}>
        {/* Floating Countdown Badge */}
        <div style={{
          position: 'absolute',
          top: '-14px',
          background: '#047857',
          color: '#FFFFFF',
          fontSize: '13px',
          fontWeight: 700,
          padding: '4px 16px',
          borderRadius: '20px',
          letterSpacing: '0.5px',
          boxShadow: '0 2px 6px rgba(4, 120, 87, 0.3)'
        }}>
          {formatTimer(secondsLeft)}
        </div>

        {/* QR Code Graphic with QR Ph Center Emblem */}
        <div style={{
          width: '240px',
          height: '240px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FFFFFF'
        }}>
          <svg
            id="speedpay-qrph-svg"
            width="230"
            height="230"
            viewBox="0 0 240 240"
            style={{ display: 'block' }}
          >
            {/* Background */}
            <rect width="240" height="240" fill="#FFFFFF" />

            {/* Corner Alignment Markers */}
            {/* Top-Left */}
            <rect x="15" y="15" width="55" height="55" rx="8" fill="#000000" />
            <rect x="23" y="23" width="39" height="39" rx="5" fill="#FFFFFF" />
            <rect x="31" y="31" width="23" height="23" rx="3" fill="#000000" />

            {/* Top-Right */}
            <rect x="170" y="15" width="55" height="55" rx="8" fill="#000000" />
            <rect x="178" y="23" width="39" height="39" rx="5" fill="#FFFFFF" />
            <rect x="186" y="31" width="23" height="23" rx="3" fill="#000000" />

            {/* Bottom-Left */}
            <rect x="15" y="170" width="55" height="55" rx="8" fill="#000000" />
            <rect x="23" y="178" width="39" height="39" rx="5" fill="#FFFFFF" />
            <rect x="31" y="186" width="23" height="23" rx="3" fill="#000000" />

            {/* Simulated Data Grid Patterns */}
            {/* Top Row Data */}
            <rect x="80" y="18" width="10" height="10" fill="#000000" />
            <rect x="100" y="18" width="10" height="10" fill="#000000" />
            <rect x="120" y="18" width="10" height="10" fill="#000000" />
            <rect x="140" y="18" width="10" height="10" fill="#000000" />
            <rect x="90" y="32" width="10" height="10" fill="#000000" />
            <rect x="110" y="32" width="10" height="10" fill="#000000" />
            <rect x="130" y="32" width="10" height="10" fill="#000000" />
            <rect x="150" y="32" width="10" height="10" fill="#000000" />
            <rect x="80" y="46" width="10" height="10" fill="#000000" />
            <rect x="120" y="46" width="10" height="10" fill="#000000" />
            <rect x="140" y="46" width="10" height="10" fill="#000000" />
            <rect x="100" y="60" width="10" height="10" fill="#000000" />
            <rect x="130" y="60" width="10" height="10" fill="#000000" />

            {/* Left & Right Middle */}
            <rect x="18" y="80" width="10" height="10" fill="#000000" />
            <rect x="32" y="94" width="10" height="10" fill="#000000" />
            <rect x="46" y="80" width="10" height="10" fill="#000000" />
            <rect x="60" y="94" width="10" height="10" fill="#000000" />
            <rect x="18" y="108" width="10" height="10" fill="#000000" />
            <rect x="46" y="122" width="10" height="10" fill="#000000" />
            <rect x="32" y="136" width="10" height="10" fill="#000000" />
            <rect x="60" y="150" width="10" height="10" fill="#000000" />

            <rect x="170" y="80" width="10" height="10" fill="#000000" />
            <rect x="198" y="80" width="10" height="10" fill="#000000" />
            <rect x="184" y="94" width="10" height="10" fill="#000000" />
            <rect x="212" y="94" width="10" height="10" fill="#000000" />
            <rect x="170" y="108" width="10" height="10" fill="#000000" />
            <rect x="198" y="122" width="10" height="10" fill="#000000" />
            <rect x="184" y="136" width="10" height="10" fill="#000000" />
            <rect x="212" y="150" width="10" height="10" fill="#000000" />

            {/* Bottom Row Data */}
            <rect x="80" y="170" width="10" height="10" fill="#000000" />
            <rect x="110" y="170" width="10" height="10" fill="#000000" />
            <rect x="140" y="170" width="10" height="10" fill="#000000" />
            <rect x="180" y="170" width="10" height="10" fill="#000000" />
            <rect x="200" y="170" width="10" height="10" fill="#000000" />
            <rect x="94" y="184" width="10" height="10" fill="#000000" />
            <rect x="124" y="184" width="10" height="10" fill="#000000" />
            <rect x="154" y="184" width="10" height="10" fill="#000000" />
            <rect x="190" y="184" width="10" height="10" fill="#000000" />
            <rect x="80" y="198" width="10" height="10" fill="#000000" />
            <rect x="110" y="198" width="10" height="10" fill="#000000" />
            <rect x="140" y="198" width="10" height="10" fill="#000000" />
            <rect x="170" y="198" width="10" height="10" fill="#000000" />
            <rect x="210" y="198" width="10" height="10" fill="#000000" />
            <rect x="94" y="212" width="10" height="10" fill="#000000" />
            <rect x="124" y="212" width="10" height="10" fill="#000000" />
            <rect x="160" y="212" width="10" height="10" fill="#000000" />
            <rect x="190" y="212" width="10" height="10" fill="#000000" />

            {/* Central Masking for Logo */}
            <rect x="85" y="85" width="70" height="70" rx="12" fill="#FFFFFF" stroke="#F1F5F9" strokeWidth="2" />

            {/* Authentic Philippine QR Ph Logo Centerpiece */}
            {/* Blue Top-Left Corner Bracket */}
            <path
              d="M97 122 V103 A6 6 0 0 1 103 97 H122"
              fill="none"
              stroke="#0038A8"
              strokeWidth="9"
              strokeLinecap="round"
            />

            {/* Red Bottom-Right Corner Bracket */}
            <path
              d="M143 118 V137 A6 6 0 0 1 137 143 H118"
              fill="none"
              stroke="#CE1126"
              strokeWidth="9"
              strokeLinecap="round"
            />

            {/* Golden Sun Circle in Center */}
            <circle cx="120" cy="120" r="10.5" fill="#FCD116" />
          </svg>
        </div>

        {/* Amount Pill */}
        <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
          Amount: <strong style={{ color: '#0F172A' }}>₱{amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        maxWidth: '300px'
      }}>
        {/* Download QR Code Button */}
        <button
          type="button"
          onClick={handleDownloadQr}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '11px 16px',
            background: '#FFFFFF',
            border: '1.5px solid #CBD5E1',
            borderRadius: '8px',
            fontSize: '13.5px',
            fontWeight: 600,
            color: '#1E293B',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#F8FAFC')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#FFFFFF')}
        >
          <Download size={16} />
          <span>Download QR Code</span>
        </button>

        {/* Simulate Payment Button */}
        <button
          type="button"
          onClick={onSimulateSuccess}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '12px 16px',
            background: '#16A34A',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
            transition: 'all 0.15s ease'
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#15803D')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#16A34A')}
        >
          <CheckCircle2 size={17} />
          <span>Simulate Payment</span>
        </button>
      </div>

      {/* Note: "Use a different payment method" is deliberately removed */}
    </div>
  );
};
