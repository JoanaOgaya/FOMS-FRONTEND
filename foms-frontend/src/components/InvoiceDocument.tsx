import React, { useMemo } from 'react';
import type { Invoice } from '../types/entities';
import { useQuery } from '../hooks/useQuery';
import { clientsService } from '../services/clientsService';
import { waybillsService } from '../services/waybillsService';
import { ratesService } from '../services/ratesService';
import { computeFreightCost } from '../utils/billing';
import { formatBillingPeriod } from '../utils/format';

interface WaybillLineItem {
  id: string;
  waybillNumber: string;
  deliveryDate: string;
  freightCost: number;
  valuation: number;
  odaCharge: number;
  vatAmount: number;
  fuelSurcharge: number;
  lineTotal: number;
  vatRate: number;
  surchargeRate: number;
}

export const InvoiceDocument: React.FC<{ invoice: Invoice; compact?: boolean }> = ({ invoice, compact = false }) => {
  const { data: clientsData } = useQuery('clients', () => clientsService.list({ pageSize: 100 }));
  const { data: waybillsData } = useQuery('waybills', () => waybillsService.list({ pageSize: 100 }));
  const { data: ratesData } = useQuery('billingRates', () => ratesService.list({ pageSize: 100 }));
  const clients = clientsData?.items || [];
  const allWaybills = waybillsData?.items || [];
  const billingRates = ratesData?.items || [];

  const client = clients.find(c => c.id === invoice.clientId);

  // Match linked waybills by IDs, numbers, or invoiceId
  const rawWaybills = useMemo(() => {
    let matched = (invoice.waybillIds || [])
      .map(id => allWaybills.find(w => String(w.id) === String(id) || w.waybillNumber === String(id)))
      .filter(Boolean) as any[];

    if (matched.length === 0 && allWaybills.length > 0) {
      matched = allWaybills.filter(w =>
        w.invoiceId && (String(w.invoiceId) === String(invoice.id) || w.invoiceId === invoice.invoiceNumber)
      );
    }
    return matched;
  }, [invoice, allWaybills]);

  // Build per-waybill line items using rate config
  const lineItems: WaybillLineItem[] = useMemo(() => {
    return rawWaybills.map(wb => {
      let breakdown = null;
      const ratesToUse = invoice.appliedRates && invoice.appliedRates.length > 0 ? invoice.appliedRates : billingRates;
      try {
        breakdown = computeFreightCost(wb, ratesToUse);
      } catch {
        // Fallback
      }

      const activeRate = billingRates.find(r => r.clientId === wb.clientCode && r.status === 'Active');
      const vatRate = activeRate?.vatRate ?? client?.vatRate ?? 0.12;
      const surchargeRate = activeRate?.fuelSurchargeRate ?? 0.15;

      const freightCost = breakdown ? breakdown.freightCost : 0;
      const valuation = breakdown ? breakdown.valuation : 0;
      const odaCharge = breakdown ? breakdown.odaCharge : 0;
      const vatAmount = breakdown ? breakdown.vat : freightCost * vatRate;
      const fuelSurcharge = breakdown ? breakdown.fuelSurcharge : freightCost * surchargeRate;
      const lineTotal = breakdown ? breakdown.grandTotal : (freightCost + valuation + odaCharge + vatAmount + fuelSurcharge);

      return {
        id: wb.id,
        waybillNumber: wb.waybillNumber,
        deliveryDate: wb.deliveryDate,
        freightCost,
        valuation,
        odaCharge,
        vatAmount,
        fuelSurcharge,
        lineTotal,
        vatRate,
        surchargeRate,
      };
    });
  }, [rawWaybills, invoice, billingRates, client]);

  // Totals from line items (only compute money when items exist)
  const totalFreight = lineItems.reduce((s, l) => s + l.freightCost, 0);
  const totalValuation = lineItems.reduce((s, l) => s + l.valuation, 0);
  const totalOda = lineItems.reduce((s, l) => s + l.odaCharge, 0);
  const subtotal = lineItems.length > 0 ? (totalFreight + totalValuation + totalOda) : 0;
  const totalVat = lineItems.length > 0 ? lineItems.reduce((s, l) => s + l.vatAmount, 0) : 0;
  const totalSurcharge = lineItems.length > 0 ? lineItems.reduce((s, l) => s + l.fuelSurcharge, 0) : 0;
  const totalDue = lineItems.length > 0 ? (subtotal + totalVat + totalSurcharge) : 0;

  const activeInvoiceRate = billingRates.find(r => r.clientId === invoice.clientId && r.status === 'Active');
  const vatRateDisplay = client?.vatRate ?? activeInvoiceRate?.vatRate ?? 0.12;
  const surchargeRateDisplay = activeInvoiceRate?.fuelSurchargeRate ?? 0.15;

  const hasZeroAmount = totalDue <= 0 && lineItems.length > 0;

  // Dates
  const issueDate = new Date(invoice.createdAt);
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : (() => {
    const d = new Date(issueDate);
    d.setDate(d.getDate() + 30);
    return d;
  })();

  // Billing period formatting
  let billingPeriod = invoice.billingPeriod || 'N/A';
  if (!billingPeriod || billingPeriod === 'N/A') {
    if (lineItems.length > 0) {
      const dates = lineItems.map(l => new Date(l.deliveryDate).getTime()).filter(t => !Number.isNaN(t));
      if (dates.length > 0) {
        const earliestDate = new Date(Math.min(...dates));
        const latestDate = new Date(Math.max(...dates));
        billingPeriod = `${earliestDate.toISOString().slice(0, 10)} - ${latestDate.toISOString().slice(0, 10)}`;
      }
    }
  }

  const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (r: number) => `${(r * 100).toFixed(0)}%`;

  return (
    <div className="invoice-document" style={{
      background: '#fff',
      color: '#0F172A',
      fontFamily: 'Inter, sans-serif',
      padding: compact ? '24px' : '40px',
      maxWidth: compact ? '100%' : '860px',
      margin: '0 auto'
    }}>
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body > * { visibility: hidden; }
          .app-layout, .sidebar, .global-header, .main-area { display: none !important; }
          .printable-section, .printable-section * { visibility: visible !important; }
          .printable-section {
            position: fixed !important;
            left: 0; top: 0;
            width: 100vw;
            padding: 20px 36px;
            box-sizing: border-box;
            background: #fff !important;
            color: #0F172A !important;
            font-family: 'Inter', Arial, sans-serif !important;
            font-size: 11pt !important;
          }
          .printable-section table { border-collapse: collapse; width: 100%; }
          .printable-section th, .printable-section td {
            border: 0.5pt solid #CBD5E1;
            padding: 5pt 8pt;
            font-size: 9pt;
            color: #0F172A;
          }
          .printable-section th { background: #F1F5F9 !important; font-weight: 700; }
          .no-print { display: none !important; }
          @page { margin: 10mm; size: A4 portrait; }
        }
      `}</style>

      <div className="printable-section" style={{ position: 'relative' }}>

        {/* Zero Amount Warning */}
        {hasZeroAmount && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 18, color: '#EF4444' }} />
            <span style={{ fontSize: '0.85rem', color: '#991B1B', fontWeight: 600 }}>
              Invoice total is ₱0.00 - please verify the rate configuration for this client.
            </span>
          </div>
        )}

        {/* Stamp */}
        {['Paid', 'Sent'].includes(invoice.status) && (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%) rotate(-20deg)', pointerEvents: 'none', border: '6px solid rgba(220, 38, 38, 0.15)', color: 'rgba(220, 38, 38, 0.15)', padding: '10px 30px', fontSize: '5rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: 0 }}>
            {invoice.status}
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: compact ? '24px' : '32px' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: compact ? '1.1rem' : '1.3rem', fontWeight: 800, color: '#0F172A' }}>Speedex Courier & Forwarder, Inc.</h2>
          <p style={{ margin: 0, fontSize: compact ? '0.75rem' : '0.85rem', color: '#64748B' }}>123 Rizal St, Brgy. Poblacion, Cebu City</p>
          <h1 style={{ margin: '24px 0 16px', fontSize: compact ? '1.4rem' : '1.8rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#0F172A' }}>
            INVOICE
          </h1>
        </div>

        {/* Details */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: compact ? '24px' : '32px', fontSize: compact ? '0.75rem' : '0.85rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', color: '#0F172A' }}>
            <span style={{ color: '#64748B' }}>Invoice #:</span> <strong>{invoice.invoiceNumber}</strong>
            <span style={{ color: '#64748B' }}>Issue Date:</span> <strong>{issueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</strong>
            <span style={{ color: '#64748B' }}>Due Date:</span> <strong>{dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</strong>
            <span style={{ color: '#64748B' }}>Billing Period:</span> <strong>{formatBillingPeriod(billingPeriod)}</strong>
            <span style={{ color: '#64748B' }}>Status:</span> <strong>{invoice.status}</strong>
          </div>
          <div style={{ textAlign: 'right', color: '#0F172A' }}>
            <span style={{ color: '#64748B', display: 'block', marginBottom: '4px' }}>Bill To:</span>
            <strong style={{ fontSize: compact ? '0.85rem' : '1rem' }}>{client?.name ?? 'Unknown Client'}</strong>
            {client?.address && <p style={{ margin: '4px 0 0', maxWidth: '250px', marginLeft: 'auto', color: '#475569' }}>{client.address}</p>}
          </div>
        </div>

        {/* Billing Computation Breakdown Table */}
        <div style={{ marginBottom: compact ? '16px' : '32px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', position: 'relative', zIndex: 1, minWidth: '600px' }}>
            <thead>
              <tr>
                {[
                  { label: 'Waybill No.', align: 'left' as const },
                  { label: 'Delivery Date', align: 'left' as const },
                  { label: 'Freight', align: 'right' as const },
                  { label: 'Valuation', align: 'right' as const },
                  { label: 'ODA', align: 'right' as const },
                  { label: `VAT (${pct(vatRateDisplay)})`, align: 'right' as const },
                  { label: `Fuel (${pct(surchargeRateDisplay)})`, align: 'right' as const },
                  { label: 'Line Total', align: 'right' as const },
                ].map((h) => (
                  <th key={h.label} style={{ textAlign: h.align, padding: compact ? '8px 4px' : '12px 6px', borderTop: '2px dashed #CBD5E1', borderBottom: '2px dashed #CBD5E1', fontSize: compact ? '0.7rem' : '0.8rem', color: '#0F172A', fontWeight: 700 }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.length > 0 ? lineItems.map((item) => (
                <tr key={item.id}>
                  <td style={{ padding: compact ? '8px 4px' : '10px 6px', fontSize: compact ? '0.75rem' : '0.85rem', color: '#0F172A', fontWeight: 600 }}>{item.waybillNumber}</td>
                  <td style={{ padding: compact ? '8px 4px' : '10px 6px', fontSize: compact ? '0.75rem' : '0.85rem', color: '#475569' }}>
                    {item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                  </td>
                  <td style={{ padding: compact ? '8px 4px' : '10px 6px', fontSize: compact ? '0.75rem' : '0.85rem', color: '#0F172A', textAlign: 'right' }}>{fmt(item.freightCost)}</td>
                  <td style={{ padding: compact ? '8px 4px' : '10px 6px', fontSize: compact ? '0.75rem' : '0.85rem', color: '#0F172A', textAlign: 'right' }}>{fmt(item.valuation)}</td>
                  <td style={{ padding: compact ? '8px 4px' : '10px 6px', fontSize: compact ? '0.75rem' : '0.85rem', color: '#0F172A', textAlign: 'right' }}>{fmt(item.odaCharge)}</td>
                  <td style={{ padding: compact ? '8px 4px' : '10px 6px', fontSize: compact ? '0.75rem' : '0.85rem', color: '#0F172A', textAlign: 'right' }}>{fmt(item.vatAmount)}</td>
                  <td style={{ padding: compact ? '8px 4px' : '10px 6px', fontSize: compact ? '0.75rem' : '0.85rem', color: '#0F172A', textAlign: 'right' }}>{fmt(item.fuelSurcharge)}</td>
                  <td style={{ padding: compact ? '8px 4px' : '10px 6px', fontSize: compact ? '0.8rem' : '0.9rem', color: '#0F172A', textAlign: 'right', fontWeight: 700 }}>{fmt(item.lineTotal)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>No waybill line items available.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ borderTop: '2px dashed #CBD5E1', marginTop: '4px' }}></div>
        </div>

        {/* Computation Formula Note */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: compact ? '10px 14px' : '14px 18px', marginBottom: compact ? '16px' : '28px' }}>
          <p style={{ margin: 0, fontSize: compact ? '0.7rem' : '0.8rem', color: '#475569', fontWeight: 600 }}>
            <i className="ti ti-info-circle" style={{ marginRight: 6, color: '#6366F1' }} />
            Computation Formula: <span style={{ color: '#0F172A' }}>Freight + Valuation + ODA + VAT ({pct(vatRateDisplay)}) + Fuel ({pct(surchargeRateDisplay)}) = Line Total</span>
          </p>
          <p style={{ margin: '4px 0 0', fontSize: compact ? '0.67rem' : '0.75rem', color: '#94A3B8' }}>
            Rates applied per client agreement. VAT status: <strong>{client?.vatStatus ?? 'VATable'}</strong>. Billing schedule: <strong>{client?.billingSchedule ?? 'Monthly'}</strong>.
          </p>
        </div>

        {/* Summary Totals (hidden when zero items exist) */}
        {lineItems.length > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', position: 'relative', zIndex: 1 }}>
            <div style={{ width: compact ? '280px' : '340px' }}>
              {[
                { label: `Freight Charges`, value: fmt(totalFreight) },
                { label: `Valuation Fee`, value: fmt(totalValuation) },
                { label: `ODA Charge`, value: fmt(totalOda) },
                { label: `Subtotal (${lineItems.length} item${lineItems.length !== 1 ? 's' : ''})`, value: fmt(subtotal) },
                { label: `VAT (${pct(vatRateDisplay)})`, value: fmt(totalVat) },
                { label: `Fuel Surcharge (${pct(surchargeRateDisplay)})`, value: fmt(totalSurcharge) },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: compact ? '4px 6px' : '6px 8px' }}>
                  <span style={{ fontSize: compact ? '0.75rem' : '0.85rem', color: '#475569' }}>{row.label}</span>
                  <span style={{ fontSize: compact ? '0.75rem' : '0.85rem', color: '#0F172A', fontWeight: row.label.startsWith('Subtotal') ? 700 : 500 }}>{row.value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: compact ? '10px 6px' : '12px 8px', marginTop: '4px', borderTop: '2px dashed #CBD5E1' }}>
                <span style={{ fontSize: compact ? '0.85rem' : '0.95rem', color: '#0F172A', fontWeight: 800 }}>Total</span>
                <span style={{ fontSize: compact ? '0.95rem' : '1.1rem', color: hasZeroAmount ? '#EF4444' : '#0F172A', fontWeight: 900 }}>{fmt(totalDue)}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Footer ── */}
        <div style={{ marginTop: compact ? '32px' : '48px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <p style={{ margin: '0 0 24px', fontSize: compact ? '0.85rem' : '1rem', color: '#0F172A', fontWeight: 600 }}>Thank you!</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: compact ? '0.65rem' : '0.75rem', color: '#64748B' }}>System-generated invoice from Speedex FOMS.</p>
              <p style={{ margin: '2px 0 0', fontSize: compact ? '0.65rem' : '0.75rem', color: '#64748B' }}>For disputes, contact your Finance representative.</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ borderTop: '1px solid #0F172A', paddingTop: 6, minWidth: compact ? 100 : 140 }}>
                <p style={{ margin: 0, fontSize: compact ? '0.65rem' : '0.75rem', color: '#475569', fontWeight: 600, textAlign: 'center' }}>Authorized Signatory</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
