import React, { useState, useMemo } from 'react';
import { DataTable } from '../components/DataTable';
import { TableContainer } from '../components/TableContainer';
import { Button } from '../components/Buttons';
import { StatusBadge } from '../components/shared/StatusBadge';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { RecordHistoryModal } from '../components/RecordHistoryModal';
import { CalendarPicker } from '../components/FormModals';
import { useQuery } from '../hooks/useQuery';
import { liquidationsService } from '../services/liquidationsService';
import { cashFlowService } from '../services/cashFlowService';
import { auditLogsService } from '../services/auditLogsService';
import type { Liquidation, LiquidationExpense } from '../types/entities';
import { formatCurrency, formatDate } from '../utils/format';
import { KpiCard } from '../components/shared/KpiCard';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../components/FormModals.css';

export default function LiquidationValidation() {
  const { data: liqData, refetch } = useQuery('liquidations', () => liquidationsService.list({ pageSize: 100 }));
  const liquidations: Liquidation[] = liqData?.items || [];

  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedLiquidationId, setSelectedLiquidationId] = useState<string | null>(null);

  const [remarks, setRemarks] = useState('');
  const [reviewDecision, setReviewDecision] = useState('Validate Liquidation');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; url: string; size: string } | null>(null);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewLayout, setViewLayout] = useState<'cards' | 'table'>('cards');

  const [printVoucherRecord, setPrintVoucherRecord] = useState<Liquidation | null>(null);

  const pendingCount = liquidations.filter((l: Liquidation) => l.status === 'Pending Validation').length;
  const totalLiquidatedAmount = liquidations.reduce((sum: number, l: Liquidation) => sum + Number(l.amount || 0), 0);
  const totalLeftoverToReturn = liquidations.reduce((sum: number, l: Liquidation) => sum + Number(l.leftoverCash || 0), 0);
  const totalReimbursementDue = liquidations.reduce((sum: number, l: Liquidation) => sum + Number(l.reimbursementAmount || 0), 0);

  const getInitials = (name?: string) => {
    if (!name) return 'LC';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const computeCashAdvance = (row?: Liquidation) => {
    if (!row) return 0;
    const amt = Number(row.amount || row.totalAmount || 0);
    const leftover = Number(row.leftoverCash || 0);
    const reimb = Number(row.reimbursementAmount || 0);
    return amt + leftover - reimb;
  };

  const getOrNumber = (exp: LiquidationExpense, idx: number, docs: any[] = []) => {
    if ((exp as any).orNumber) return (exp as any).orNumber;
    if (docs && docs[idx]?.name) {
      const m = docs[idx].name.match(/[A-Z0-9]+-[A-Z0-9]+-[0-9]+/i) || docs[idx].name.match(/[A-Z]+-[0-9]+/i);
      if (m) return m[0];
    }
    return `OR-2026-${String(idx + 1).padStart(4, '0')}`;
  };

  const getExpenseCategory = (exp: LiquidationExpense) => {
    const d = ((exp.description || '') + ' ' + (exp.type || '')).toLowerCase();
    if (d.includes('fuel') || d.includes('gas') || d.includes('diesel')) {
      return { name: 'Fuel & Diesel', color: '#0369A1', bg: '#E0F2FE', icon: 'ti-gas-station' };
    }
    if (d.includes('toll') || d.includes('slex') || d.includes('skyway') || d.includes('autosweep') || d.includes('rfid') || d.includes('nlex')) {
      return { name: 'Toll & RFID', color: '#4338CA', bg: '#EEF2FF', icon: 'ti-road' };
    }
    if (d.includes('park')) {
      return { name: 'Parking Fee', color: '#7E22CE', bg: '#FAF5FF', icon: 'ti-parking' };
    }
    if (d.includes('meal') || d.includes('food') || d.includes('lunch') || d.includes('snack')) {
      return { name: 'Meals & Food', color: '#C2410C', bg: '#FFF7ED', icon: 'ti-coffee' };
    }
    if (d.includes('suppl') || d.includes('tape') || d.includes('pack') || d.includes('box')) {
      return { name: 'Packaging & Supplies', color: '#0F766E', bg: '#F0FDFA', icon: 'ti-package' };
    }
    return { name: 'Logistics Operations', color: '#334155', bg: '#F1F5F9', icon: 'ti-receipt' };
  };

  const getVendor = (exp: LiquidationExpense) => {
    if ((exp as any).merchant) return (exp as any).merchant;
    const d = (exp.description || '').toLowerCase();
    if (d.includes('petron')) return 'Petron Gas Station - SLEX';
    if (d.includes('shell')) return 'Pilipinas Shell - Star Tollway';
    if (d.includes('slex') || d.includes('skyway') || d.includes('autosweep')) return 'Autosweep RFID / SMC Tollways';
    if (d.includes('parking')) return 'Warehouse Logistics Parking Hub';
    if (d.includes('meal') || d.includes('food')) return 'Transit Meals & Courier Food Service';
    if (d.includes('tape') || d.includes('pack') || d.includes('suppl')) return 'Courier Logistics Packaging Depot';
    if (d.includes('fuel')) return 'Caltex / Petron Express Fuel';
    return 'Authorized Logistics Merchant';
  };

  const dateFilteredLiquidations = useMemo(() => {
    return liquidations.filter((row: Liquidation) => {
      const submittedDate = row.submittedAt || row.dateSubmitted || '';
      if (fromDate && new Date(submittedDate) < new Date(fromDate)) return false;
      if (toDate) {
        const t = new Date(toDate);
        t.setHours(23, 59, 59, 999);
        if (new Date(submittedDate) > t) return false;
      }
      return true;
    });
  }, [liquidations, fromDate, toDate]);

  const cardFilteredLiquidations = useMemo(() => {
    return dateFilteredLiquidations.filter((row: Liquidation) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const ref = (row.reference || `LIQ-${row.id}`).toLowerCase();
        const submitter = (row.submittedBy || '').toLowerCase();
        if (!ref.includes(q) && !submitter.includes(q)) return false;
      }
      return true;
    });
  }, [dateFilteredLiquidations, searchQuery, statusFilter]);

  const renderViewSwitcher = () => (
    <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', border: '1px solid #E2E8F0', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setViewLayout('cards')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '6px',
          border: 'none',
          fontSize: '12.5px',
          fontWeight: 700,
          cursor: 'pointer',
          background: viewLayout === 'cards' ? '#0D9488' : 'transparent',
          color: viewLayout === 'cards' ? '#FFFFFF' : '#64748B',
          boxShadow: viewLayout === 'cards' ? '0 1px 3px rgba(13,148,136,0.3)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        <i className="ti ti-layout-grid" style={{ fontSize: '14px' }} /> Cards
      </button>
      <button
        type="button"
        onClick={() => setViewLayout('table')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '6px',
          border: 'none',
          fontSize: '12.5px',
          fontWeight: 700,
          cursor: 'pointer',
          background: viewLayout === 'table' ? '#0D9488' : 'transparent',
          color: viewLayout === 'table' ? '#FFFFFF' : '#64748B',
          boxShadow: viewLayout === 'table' ? '0 1px 3px rgba(13,148,136,0.3)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        <i className="ti ti-table" style={{ fontSize: '14px' }} /> Table
      </button>
    </div>
  );

  const columns = [
    { key: 'reference', label: 'REFERENCE NO.', sortable: true },
    { key: 'submittedBy', label: 'SUBMITTED BY', sortable: true },
    {
      key: 'submittedAt',
      label: 'DATE SUBMITTED',
      sortable: true,
      render: (row: Liquidation) => formatDate(row.submittedAt)
    },
    {
      key: 'amount',
      label: 'EXPENSE AMOUNT',
      sortable: true,
      render: (row: Liquidation) => formatCurrency(row.amount)
    },
    {
      key: 'settlement',
      label: 'SETTLEMENT / BALANCE',
      render: (row: Liquidation) => {
        const leftover = Number(row.leftoverCash || 0);
        const reimb = Number(row.reimbursementAmount || 0);
        if (leftover > 0) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: '#DCFCE7', color: '#166534', fontSize: '12px', fontWeight: 700 }}>
              <i className="ti ti-arrow-down-left" style={{ fontSize: 13 }} />
              ₱{leftover.toLocaleString('en-PH', { minimumFractionDigits: 2 })} Return
            </span>
          );
        }
        if (reimb > 0) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: '#FEF3C7', color: '#B45309', fontSize: '12px', fontWeight: 700 }}>
              <i className="ti ti-arrow-up-right" style={{ fontSize: 13 }} />
              ₱{reimb.toLocaleString('en-PH', { minimumFractionDigits: 2 })} Reimburse
            </span>
          );
        }
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: '#F1F5F9', color: '#64748B', fontSize: '12px', fontWeight: 600 }}>
            <i className="ti ti-check" style={{ fontSize: 13 }} /> Balanced
          </span>
        );
      }
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (row: Liquidation) => <StatusBadge status={row.status} />
    }
  ];

  const actions = [
    {
      label: 'Review Liquidation',
      icon: 'ti-file-search',
      onClick: (row: Liquidation) => setSelectedLiquidationId(row.id)
    },
    {
      label: 'Export PDF Voucher',
      icon: 'ti-file-type-pdf',
      onClick: (row: Liquidation) => handleDownloadPdf(row)
    }
  ];

  const viewRecord = liquidations.find((l: Liquidation) => l.id === selectedLiquidationId);

  const handleDownloadPdf = (voucher: Liquidation) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const ref = voucher.reference || `LIQ-${voucher.id}`;
      const cashAdv = computeCashAdvance(voucher);
      const totalExp = Number(voucher.amount || 0);
      const leftover = Number(voucher.leftoverCash || 0);
      const reimb = Number(voucher.reimbursementAmount || 0);

      // Company Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42); // #0F172A
      doc.text('SPEEDEX COURIER & LOGISTICS SERVICES', 14, 18);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139); // #64748B
      doc.text('Fast Nationwide Express Freight & Delivery Logistics Operations', 14, 23);
      doc.text('BIR Registered Non-VAT/VAT • TIN: 402-881-902-000 • Speedex Operations Hub, Metro Manila', 14, 27);

      // Right Voucher Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(13, 148, 136); // #0D9488
      doc.text('LIQUIDATION VOUCHER', 196, 18, { align: 'right' });

      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(ref, 196, 23, { align: 'right' });

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Status: ${voucher.status.toUpperCase()}`, 196, 27, { align: 'right' });

      // Dividing Line
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.5);
      doc.line(14, 30, 196, 30);

      // Left Box: Accountability
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(14, 34, 87, 34, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('I. ACCOUNTABILITY & TRIP INFO', 18, 40);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('Accountable Officer:', 18, 46);
      doc.text('Department / Unit:', 18, 51);
      doc.text('Operational Route:', 18, 56);
      doc.text('Submission Date:', 18, 61);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(voucher.submittedBy || 'Juan Dela Cruz', 52, 46);
      doc.text('Fleet Logistics & Transport', 52, 51);
      doc.text('Provincial Express Dispatch', 52, 56);
      doc.text(formatDate(voucher.submittedAt || voucher.dateSubmitted), 52, 61);

      // Right Box: Financial Settlement
      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(204, 251, 241);
      doc.roundedRect(109, 34, 87, 34, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 118, 110);
      doc.text('II. FINANCIAL SETTLEMENT SUMMARY', 113, 40);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('Cash Advance Released:', 113, 46);
      doc.text('Actual Liquidated Expenses:', 113, 51);
      doc.text(leftover > 0 ? 'Leftover Refund to Cashier:' : reimb > 0 ? 'Reimbursement Due (Abono):' : 'Reconciliation Balance:', 113, 56);
      doc.text('Audited Receipts:', 113, 61);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`PHP ${cashAdv.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 160, 46);
      doc.setTextColor(13, 148, 136);
      doc.text(`PHP ${totalExp.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 160, 51);

      if (leftover > 0) {
        doc.setTextColor(22, 101, 52);
        doc.text(`PHP ${leftover.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (Refund)`, 160, 56);
      } else if (reimb > 0) {
        doc.setTextColor(180, 83, 9);
        doc.text(`PHP ${reimb.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (Payable)`, 160, 56);
      } else {
        doc.setTextColor(100, 116, 139);
        doc.text('PHP 0.00 (Balanced)', 160, 56);
      }

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`${(voucher.expenses || []).length} Verified Items`, 160, 61);

      // Expenses Table using autoTable
      const tableHeaders = [['#', 'Category', 'Particulars / Description', 'OR / Invoice #', 'Merchant / Payee', 'Amount (PHP)']];
      const tableRows = (voucher.expenses || []).map((exp, idx) => {
        const cat = getExpenseCategory(exp);
        return [
          String(idx + 1),
          cat.name,
          exp.description || exp.type || 'Operational Logistics Expense',
          getOrNumber(exp, idx, voucher.documents || []),
          getVendor(exp),
          `PHP ${Number(exp.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
        ];
      });

      // Total Row
      tableRows.push([
        '',
        '',
        'TOTAL LIQUIDATED EXPENSES',
        '',
        '',
        `PHP ${totalExp.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
      ]);

      autoTable(doc, {
        head: tableHeaders,
        body: tableRows,
        startY: 72,
        styles: { fontSize: 8, cellPadding: 2.5, textColor: [15, 23, 42] },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 32 },
          2: { cellWidth: 54 },
          3: { cellWidth: 30, font: 'courier' },
          4: { cellWidth: 34 },
          5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
        },
        didParseCell: (data) => {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [241, 245, 249];
            if (data.column.index === 5) {
              data.cell.styles.textColor = [13, 148, 136];
            }
          }
        }
      });

      let finalY = (doc as any).lastAutoTable?.finalY || 175;

      // Settlement Advice Callout
      if (finalY > 230) {
        doc.addPage();
        finalY = 20;
      }

      if (leftover > 0) {
        doc.setFillColor(240, 253, 244);
        doc.setDrawColor(187, 247, 208);
        doc.roundedRect(14, finalY + 4, 182, 13, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(22, 101, 52);
        doc.text('TREASURY CASH REMITTANCE INSTRUCTION:', 18, finalY + 9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Accountable officer has unspent cash of PHP ${leftover.toLocaleString('en-PH', { minimumFractionDigits: 2 })}. Remit back to cashier upon filing.`, 18, finalY + 14);
      } else if (reimb > 0) {
        doc.setFillColor(255, 251, 235);
        doc.setDrawColor(253, 230, 138);
        doc.roundedRect(14, finalY + 4, 182, 13, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9);
        doc.text('FINANCE REIMBURSEMENT PAYABLE INSTRUCTION:', 18, finalY + 9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Employee incurred out-of-pocket expenses (abono) of PHP ${reimb.toLocaleString('en-PH', { minimumFractionDigits: 2 })}. Speedex Finance shall disburse.`, 18, finalY + 14);
      } else {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, finalY + 4, 182, 13, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text('EXACT SETTLEMENT RECONCILIATION:', 18, finalY + 9);
        doc.setFont('helvetica', 'normal');
        doc.text('Total liquidated expenses exactly match the issued cash advance. Zero cash variance.', 18, finalY + 14);
      }

      // Signatures
      const sigY = finalY + 24;
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.4);

      // Sig 1
      doc.line(18, sigY + 12, 65, sigY + 12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(voucher.submittedBy || 'Juan Dela Cruz', 41.5, sigY + 16, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Prepared & Liquidated by (Driver)', 41.5, sigY + 20, { align: 'center' });

      // Sig 2
      doc.line(78, sigY + 12, 128, sigY + 12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('Joana Marie Ogaya', 103, sigY + 16, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Verified & Validated by (Asst. FM)', 103, sigY + 20, { align: 'center' });

      // Sig 3
      doc.line(142, sigY + 12, 192, sigY + 12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('Misty', 167, sigY + 16, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Approved for Settlement (Head of Finance)', 167, sigY + 20, { align: 'center' });

      // Footer
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('SPEEDEX COURIER & LOGISTICS • BIR COMPLIANT LIQUIDATION VOUCHER • GENERATED VIA SPEEDEX FOMS', 105, 287, { align: 'center' });

      const filename = `Liquidation_Voucher_${ref}.pdf`;
      doc.save(filename);
      toast.success(`Downloaded ${filename} successfully!`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      toast.error('Could not generate PDF.');
    }
  };

  const handlePrintVoucher = (voucher: Liquidation) => {
    const cashAdv = computeCashAdvance(voucher);
    const totalExp = Number(voucher.amount || 0);
    const leftover = Number(voucher.leftoverCash || 0);
    const reimb = Number(voucher.reimbursementAmount || 0);

    let settlementSummaryHtml = '';
    if (leftover > 0) {
      settlementSummaryHtml = `
        <div class="settle-box settle-refund">
          <div class="settle-title">&#9679; TREASURY CASH REMITTANCE INSTRUCTION</div>
          <div class="settle-desc">
            The accountable officer/driver has unspent funds of <strong>&#8369;${leftover.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> from the original Cash Advance of &#8369;${cashAdv.toLocaleString('en-PH', { minimumFractionDigits: 2 })}. This excess cash must be remitted back to the Treasury/Cashier upon submission of this slip.
          </div>
        </div>
      `;
    } else if (reimb > 0) {
      settlementSummaryHtml = `
        <div class="settle-box settle-reimb">
          <div class="settle-title">&#9679; FINANCE REIMBURSEMENT PAYABLE INSTRUCTION</div>
          <div class="settle-desc">
            The accountable officer/driver incurred authorized official operational expenses exceeding the Cash Advance by <strong>&#8369;${reimb.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>. Speedex Finance is instructed to disburse this reimbursement to the employee upon approval.
          </div>
        </div>
      `;
    } else {
      settlementSummaryHtml = `
        <div class="settle-box settle-balanced">
          <div class="settle-title">&#9679; EXACT RECONCILIATION - ZERO CASH VARIANCE</div>
          <div class="settle-desc">
            The liquidated expenses exactly match the issued cash advance (&#8369;${cashAdv.toLocaleString('en-PH', { minimumFractionDigits: 2 })}). No refund or reimbursement is due.
          </div>
        </div>
      `;
    }

    const rowsHtml = (voucher.expenses || []).map((exp, idx) => {
      const cat = getExpenseCategory(exp);
      return `
      <tr>
        <td style="text-align: center; color: #64748B;">${idx + 1}</td>
        <td>
          <span class="cat-pill" style="background: ${cat.bg}; color: ${cat.color}; border: 1px solid ${cat.color}40;">${cat.name}</span>
          <div style="font-weight: 700; color: #0F172A; margin-top: 3px;">${exp.description || exp.type || 'Official Logistics Expense'}</div>
        </td>
        <td style="font-family: monospace; font-weight: 600; color: #334155;">${getOrNumber(exp, idx, voucher.documents || [])}</td>
        <td style="color: #475569;">${getVendor(exp)}</td>
        <td style="text-align: right; font-weight: 700; color: #0F172A;">&#8369;${Number(exp.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
      </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Liquidation Voucher - ${voucher.reference || voucher.id}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11.5px;
      color: #0F172A;
      background: #fff;
      padding: 30px 36px;
      max-width: 840px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0F172A;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .company-title {
      font-size: 17px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: 0.02em;
    }
    .company-sub {
      font-size: 10.5px;
      color: #475569;
      line-height: 1.5;
      margin-top: 3px;
    }
    .voucher-badge {
      text-align: right;
    }
    .voucher-title {
      font-size: 14px;
      font-weight: 800;
      color: #0D9488;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .voucher-num {
      font-size: 15px;
      font-weight: 800;
      color: #0F172A;
      margin-top: 2px;
    }
    .status-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      background: #F0FDFA;
      color: #0D9488;
      border: 1px solid #CCFBF1;
      margin-top: 4px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 18px;
    }
    .summary-card {
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      padding: 12px 14px;
      background: #F8FAFC;
    }
    .card-title {
      font-size: 10px;
      font-weight: 800;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
      border-bottom: 1px solid #E2E8F0;
      padding-bottom: 4px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      line-height: 1.8;
    }
    .info-label {
      color: #64748B;
      font-weight: 600;
    }
    .info-val {
      color: #0F172A;
      font-weight: 700;
    }
    .fin-highlight {
      font-size: 15px;
      font-weight: 800;
      color: #0F172A;
    }
    .cat-pill {
      display: inline-block;
      font-size: 9.5px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
    }
    th {
      background: #F1F5F9;
      color: #475569;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 8px 10px;
      border: 1px solid #CBD5E1;
      text-align: left;
    }
    td {
      padding: 8px 10px;
      border: 1px solid #E2E8F0;
      font-size: 11px;
      vertical-align: middle;
    }
    .totals-row td {
      background: #F8FAFC;
      font-weight: 800;
      font-size: 11.5px;
      border-top: 2px solid #CBD5E1;
    }
    .settle-box {
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 20px;
    }
    .settle-refund {
      background: #F0FDF4;
      border: 1px solid #BBF7D0;
      color: #166534;
    }
    .settle-reimb {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      color: #B45309;
    }
    .settle-balanced {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      color: #475569;
    }
    .settle-title {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.04em;
      margin-bottom: 3px;
    }
    .settle-desc {
      font-size: 11px;
      line-height: 1.5;
    }
    .signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
      margin-top: 28px;
      padding-top: 10px;
    }
    .sig-col {
      text-align: center;
    }
    .sig-line {
      border-bottom: 1.5px solid #0F172A;
      height: 34px;
      margin-bottom: 6px;
    }
    .sig-name {
      font-size: 11.5px;
      font-weight: 700;
      color: #0F172A;
    }
    .sig-role {
      font-size: 10px;
      color: #64748B;
      margin-top: 2px;
    }
    .sig-date {
      font-size: 9.5px;
      color: #94A3B8;
      margin-top: 3px;
    }
    .footer-note {
      text-align: center;
      font-size: 9px;
      color: #94A3B8;
      margin-top: 24px;
      border-top: 1px dashed #CBD5E1;
      padding-top: 10px;
    }
    @media print {
      body { padding: 10mm 12mm; }
      @page { size: portrait; margin: 8mm; }
      .signatures { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-title">SPEEDEX COURIER &amp; LOGISTICS SERVICES</div>
      <div class="company-sub">
        Fast Nationwide Express Freight &amp; Delivery Logistics Operations<br/>
        BIR Registered Non-VAT/VAT &bull; TIN: 402-881-902-000<br/>
        Speedex Operations Hub, Metro Manila, Philippines
      </div>
    </div>
    <div class="voucher-badge">
      <div class="voucher-title">Liquidation Voucher</div>
      <div class="voucher-num">${voucher.reference || `LIQ-${voucher.id}`}</div>
      <div><span class="status-tag">${voucher.status}</span></div>
      <div style="font-size: 9.5px; color: #64748B; margin-top: 3px;">Audit Series: AUD-2026-PH</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="card-title">I. Accountability &amp; Trip Info</div>
      <div class="info-row"><span class="info-label">Accountable Officer:</span> <span class="info-val">${voucher.submittedBy || 'Juan Dela Cruz'}</span></div>
      <div class="info-row"><span class="info-label">Department / Unit:</span> <span class="info-val">Fleet Logistics &amp; Transport</span></div>
      <div class="info-row"><span class="info-label">Operational Route:</span> <span class="info-val">Provincial Express Dispatch</span></div>
      <div class="info-row"><span class="info-label">Submission Date:</span> <span class="info-val">${formatDate(voucher.submittedAt || voucher.dateSubmitted)}</span></div>
    </div>
    <div class="summary-card" style="background: #F0FDFA; border-color: #CCFBF1;">
      <div class="card-title" style="color: #0F766E; border-color: #CCFBF1;">II. Financial Settlement Summary</div>
      <div class="info-row"><span class="info-label">Cash Advance Released:</span> <span class="info-val">${formatCurrency(cashAdv)}</span></div>
      <div class="info-row"><span class="info-label">Actual Liquidated Expenses:</span> <span class="info-val" style="color: #0D9488;">${formatCurrency(totalExp)}</span></div>
      <div class="info-row" style="border-top: 1px dashed #CBD5E1; margin-top: 4px; padding-top: 4px;">
        <span class="info-label">${leftover > 0 ? 'Leftover Refund to Cashier:' : reimb > 0 ? 'Reimbursement Due (Abono):' : 'Reconciliation Variance:'}</span>
        <span class="info-val fin-highlight" style="color: ${leftover > 0 ? '#166534' : reimb > 0 ? '#B45309' : '#0F172A'};">
          ${formatCurrency(leftover || reimb || 0)}
        </span>
      </div>
      <div class="info-row"><span class="info-label">Audited Receipts:</span> <span class="info-val">${(voucher.expenses || []).length} Verified Items</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 28px; text-align: center;">#</th>
        <th>Category &amp; Particulars</th>
        <th style="width: 140px;">OR / Invoice #</th>
        <th style="width: 160px;">Merchant / Supplier</th>
        <th style="width: 100px; text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="totals-row">
        <td colspan="4" style="text-align: right; padding-right: 12px; color: #0F172A;">Total Liquidated Expenses:</td>
        <td style="text-align: right; color: #0D9488; font-size: 12px;">&#8369;${totalExp.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tbody>
  </table>

  ${settlementSummaryHtml}

  <div class="signatures">
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-name">${voucher.submittedBy || 'Juan Dela Cruz'}</div>
      <div class="sig-role">Prepared &amp; Liquidated by (Driver)</div>
      <div class="sig-date">Date: ${formatDate(voucher.submittedAt || voucher.dateSubmitted)}</div>
    </div>
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-name">Joana Marie Ogaya</div>
      <div class="sig-role">Verified &amp; Validated by (Asst. FM)</div>
      <div class="sig-date">Date: ${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
    </div>
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-name">Misty</div>
      <div class="sig-role">Approved for Settlement (Head of Finance)</div>
      <div class="sig-date">Date: ____________________</div>
    </div>
  </div>

  <div class="footer-note">
    SPEEDEX COURIER &amp; LOGISTICS &bull; BIR COMPLIANT LIQUIDATION SLIP &bull; GENERATED VIA SPEEDEX FOMS FINANCIAL OPERATIONS PLATFORM
  </div>
</body>
</html>`;

    const printWin = window.open('', '_blank', 'width=900,height=900');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 350);
    }
  };

  const handleLogDecision = () => {
    if (reviewDecision === 'Validate Liquidation') {
      handleValidate();
    } else if (reviewDecision === 'Endorse to Financial Manager') {
      handleEndorse();
    } else {
      handleReject();
    }
  };

  const handleEndorse = async () => {
    if (!viewRecord) return;
    try {
      await liquidationsService.update(viewRecord.id, { status: 'Endorsed', remarks: remarks || 'Endorsed to Financial Manager by Assistant FM.' });

      await auditLogsService.create({
        userId: user?.employeeId || 'EMP-004',
        userFullName: user?.fullName || 'Joana Marie Ogaya',
        userRole: user?.role || 'ASSISTANT_FM',
        action: 'ENDORSE_LIQUIDATION',
        module: 'Liquidation Validation',
        recordId: viewRecord.id,
        recordType: 'Liquidation',
        ipAddress: '127.0.0.1',
        details: `Liquidation report endorsed to Financial Manager. ${remarks || ''}`.trim(),
        timestamp: new Date().toISOString()
      });

      toast.success(`Liquidation ${viewRecord.id} successfully endorsed to Financial Manager.`);
      setRemarks('');
      setSelectedLiquidationId(null);
      refetch();
    } catch {
      toast.error('Failed to endorse liquidation.');
    }
  };

  const handleValidate = async () => {
    if (!viewRecord) return;

    try {
      await liquidationsService.update(viewRecord.id, { status: 'Validated', remarks: 'Successfully validated.' });

      await cashFlowService.create({
        sourceReference: `Liquidation Validated: ${viewRecord.id} - ${viewRecord.reference}`,
        type: 'Outflow',
        amount: viewRecord.amount,
        date: new Date().toISOString(),
        recordedBy: user?.fullName || 'System'
      });

      await auditLogsService.create({
        userId: user?.employeeId || 'System',
        userFullName: user?.fullName || 'System',
        userRole: user?.role || 'ASSISTANT_FM',
        action: 'VALIDATE_LIQUIDATION',
        module: 'Liquidation Validation',
        recordId: viewRecord.id,
        recordType: 'Liquidation',
        ipAddress: '127.0.0.1',
        details: 'Liquidation report completely validated against supporting documents.',
        timestamp: new Date().toISOString()
      });

      toast.success(`Liquidation ${viewRecord.id} successfully validated.`);
      setSelectedLiquidationId(null);
      refetch();
    } catch {
      toast.error('Failed to validate liquidation.');
    }
  };

  const handleReject = async () => {
    if (!viewRecord) return;
    if (!remarks.trim()) {
      toast.error('Please enter remarks for rejection.');
      return;
    }

    try {
      await liquidationsService.update(viewRecord.id, { status: 'Returned', remarks });

      await auditLogsService.create({
        userId: user?.employeeId || 'System',
        userFullName: user?.fullName || 'System',
        userRole: user?.role || 'ASSISTANT_FM',
        action: 'REJECT_LIQUIDATION',
        module: 'Liquidation Validation',
        recordId: viewRecord.id,
        recordType: 'Liquidation',
        ipAddress: '127.0.0.1',
        details: `Liquidation returned. Reason: ${remarks}`,
        timestamp: new Date().toISOString()
      });

      toast.error(`Liquidation ${viewRecord.id} returned for correction.`);
      setRemarks('');
      setSelectedLiquidationId(null);
      refetch();
    } catch {
      toast.error('Failed to return liquidation.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 4 Summary / KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <KpiCard
          label="Pending Validation"
          value={pendingCount}
          icon="ti-clock-hour-4"
          variant="warning"
          periodText="Awaiting validation"
        />
        <KpiCard
          label="Total Liquidated Expenses"
          value={formatCurrency(totalLiquidatedAmount)}
          icon="ti-receipt"
          variant="teal"
          periodText={`${liquidations.length} total reports`}
        />
        <KpiCard
          label="Leftover Cash (Return)"
          value={formatCurrency(totalLeftoverToReturn)}
          icon="ti-cash"
          variant="success"
          periodText="Surrender to treasury"
        />
        <KpiCard
          label="Reimbursements Due"
          value={formatCurrency(totalReimbursementDue)}
          icon="ti-receipt-refund"
          variant="info"
          periodText="Payable to couriers"
        />
      </div>

      {viewRecord && (
        <div className="modal-overlay" style={{ zIndex: 999 }}>
          <div className="modal-card" style={{ width: '850px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-hd">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 className="modal-hd-title">Liquidation Details</h3>
                <StatusBadge status={viewRecord.status} />
                <button
                  onClick={() => handleDownloadPdf(viewRecord)}
                  style={{
                    padding: '4px 12px',
                    background: '#F0FDFA',
                    border: '1px solid #CCFBF1',
                    borderRadius: 6,
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0D9488',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className="ti ti-file-type-pdf" style={{ fontSize: 14 }} /> Export PDF
                </button>
              </div>
              <button className="modal-x-btn" onClick={() => setSelectedLiquidationId(null)}>&times;</button>
            </div>
            <div className="modal-bd" style={{ padding: '22px 26px' }}>
              {/* Operations Reference & Total Amount Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px 16px', background: '#F8FAFC' }}>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Operations / Trip Reference
                  </div>
                  <div style={{ fontSize: '16px', color: '#0F172A', fontWeight: 800, marginTop: '2px' }}>
                    {viewRecord.reference || `LIQ-${viewRecord.id}`}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                    Submitted by <strong>{viewRecord.submittedBy || 'Juan Dela Cruz'}</strong> on {formatDate(viewRecord.submittedAt || viewRecord.dateSubmitted)}
                  </div>
                </div>

                <div style={{ border: '1px solid #CCFBF1', borderRadius: '8px', padding: '14px 16px', background: '#F0FDFA' }}>
                  <div style={{ fontSize: '11px', color: '#0F766E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Total Computed Amount
                  </div>
                  <div style={{ fontSize: '20px', color: '#0F766E', fontWeight: 800, marginTop: '2px' }}>
                    {formatCurrency(viewRecord.amount)}
                  </div>
                  {(viewRecord.leftoverCash || 0) > 0 && (
                    <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700, marginTop: '2px' }}>
                      ₱{Number(viewRecord.leftoverCash).toLocaleString('en-PH', { minimumFractionDigits: 2 })} Return to cashier
                    </div>
                  )}
                  {(viewRecord.reimbursementAmount || 0) > 0 && (
                    <div style={{ fontSize: '11px', color: '#B45309', fontWeight: 700, marginTop: '2px' }}>
                      ₱{Number(viewRecord.reimbursementAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} Reimbursement due
                    </div>
                  )}
                </div>
              </div>

              {/* Expense Breakdown & Official Receipts Table */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '12.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Itemized Particulars &amp; Official Receipts
                  </h4>
                  <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                    {(viewRecord.expenses || []).length} items audited
                  </span>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                    <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                        <th style={{ padding: '9px 12px', fontSize: '11px', fontWeight: 700, color: '#64748B', borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Particulars &amp; Category</th>
                        <th style={{ padding: '9px 12px', fontSize: '11px', fontWeight: 700, color: '#64748B', borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>OR / Receipt #</th>
                        <th style={{ padding: '9px 12px', fontSize: '11px', fontWeight: 700, color: '#64748B', borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Merchant / Station</th>
                        <th style={{ padding: '9px 12px', fontSize: '11px', fontWeight: 700, color: '#64748B', borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewRecord.expenses || []).map((exp: LiquidationExpense, idx: number) => {
                        const cat = getExpenseCategory(exp);
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 4, background: cat.bg, color: cat.color, fontSize: '11px', fontWeight: 700, marginBottom: '2px' }}>
                                <i className={`ti ${cat.icon}`} style={{ fontSize: 11 }} />
                                {cat.name}
                              </div>
                              <div style={{ fontSize: '12px', color: '#1E293B', fontWeight: 600 }}>{exp.description}</div>
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              <span style={{ fontSize: '11.5px', color: '#334155', fontWeight: 600, fontFamily: 'monospace', background: '#F1F5F9', padding: '2px 7px', borderRadius: 4, border: '1px solid #E2E8F0' }}>
                                {getOrNumber(exp, idx, viewRecord.documents || [])}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: '12px', color: '#475569', verticalAlign: 'middle' }}>
                              {getVendor(exp)}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#0F172A', fontWeight: 800, textAlign: 'right', verticalAlign: 'middle' }}>
                              {formatCurrency(exp.amount)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: '#F8FAFC' }}>
                        <td colSpan={3} style={{ padding: '10px 12px', fontSize: '12.5px', color: '#0F172A', fontWeight: 800, textAlign: 'right' }}>Total Audited Expenses:</td>
                        <td style={{ padding: '10px 12px', fontSize: '14px', color: '#0D9488', fontWeight: 800, textAlign: 'right' }}>
                          {formatCurrency(viewRecord.amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Compact Supporting Proof of Expenses */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '12.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Supporting Proof of Expenses ({(viewRecord.documents || []).length})
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(viewRecord.documents || []).map((doc: { name: string; url: string; size: string }, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                    >
                      <i className="ti ti-file-text" style={{ color: '#0D9488', fontSize: '14px' }} />
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>{doc.name}</span>
                      <span style={{ color: '#94A3B8', fontSize: '10.5px' }}>({doc.size})</span>
                      <button
                        type="button"
                        onClick={() => setSelectedDoc(doc)}
                        style={{
                          padding: '2px 6px',
                          background: '#fff',
                          border: '1px solid #CBD5E1',
                          borderRadius: '4px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: '#0F172A',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          marginLeft: '2px'
                        }}
                      >
                        <i className="ti ti-eye" /> View
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {viewRecord.remarks && viewRecord.status !== 'Pending Validation' && (
                <div style={{ marginBottom: '18px', padding: '10px 14px', background: '#F1F5F9', borderLeft: '4px solid #64748B', borderRadius: '4px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', display: 'block', textTransform: 'uppercase', marginBottom: '2px' }}>Previous Remarks</span>
                  <span style={{ fontSize: '12.5px', color: '#1E293B' }}>{viewRecord.remarks}</span>
                </div>
              )}

              {/* Review Decision & Actions */}
              {viewRecord.status === 'Pending Validation' ? (
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#475569', fontWeight: 700, marginBottom: '4px' }}>
                        Review Decision
                      </label>
                      <select
                        value={reviewDecision}
                        onChange={(e) => setReviewDecision(e.target.value)}
                        style={{ width: '100%', height: '38px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 600, color: '#0F172A', outline: 'none', background: '#fff' }}
                      >
                        <option value="Validate Liquidation">Validate liquidation</option>
                        <option value="Endorse to Financial Manager">Endorse to Financial Manager</option>
                        <option value="Return for Correction">Return for correction</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#475569', fontWeight: 700, marginBottom: '4px' }}>
                        Remarks / Validation Notes (Optional)
                      </label>
                      <input
                        type="text"
                        value={remarks}
                        onChange={e => setRemarks(e.target.value)}
                        placeholder="Add review notes, audit observations or return reasons..."
                        style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      onClick={() => setSelectedLiquidationId(null)}
                      style={{ padding: '8px 18px', background: '#fff', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleLogDecision}
                      style={{ padding: '8px 22px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 4px rgba(13,148,136,0.2)' }}
                    >
                      Log Decision
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
                  <Button title="Close" variant="secondary" onClick={() => setSelectedLiquidationId(null)} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedDoc && (
        <div className="modal-overlay" style={{ zIndex: 1050 }}>
          <div className="modal-card" style={{ width: '480px' }}>
            <div className="modal-hd">
              <h3 className="modal-hd-title">Document Preview: {selectedDoc.name}</h3>
              <button className="modal-x-btn" onClick={() => setSelectedDoc(null)}>&times;</button>
            </div>
            <div className="modal-bd" style={{ textAlign: 'center', padding: '32px 24px' }}>
              <i className="ti ti-file-text" style={{ fontSize: '48px', color: '#0D9488', marginBottom: '16px', display: 'block' }} />
              <p style={{ color: '#475569', fontSize: '13.5px', marginBottom: '20px' }}>
                Previewing official proof <strong>{selectedDoc.name}</strong> ({selectedDoc.size}).
              </p>
              <Button title="Download Attachment" variant="secondary" icon="ti-download" onClick={() => toast.success(`Downloading ${selectedDoc.name}...`)} />
            </div>
          </div>
        </div>
      )}

      {/* Printable Liquidation Voucher Preview Modal */}
      {printVoucherRecord && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-card" style={{ width: '880px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-hd" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', padding: '16px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-receipt-tax" style={{ fontSize: 22, color: '#0D9488' }} />
                <h3 className="modal-hd-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Official Liquidation Voucher
                </h3>
              </div>
              <button className="modal-x-btn" onClick={() => setPrintVoucherRecord(null)}>&times;</button>
            </div>

            <div className="modal-bd" style={{ padding: '28px 32px', background: '#F1F5F9' }}>
              {/* Paper Voucher Document */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                  padding: '36px 40px',
                  fontFamily: 'Inter, -apple-system, sans-serif'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0F172A', paddingBottom: '16px', marginBottom: '24px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="ti ti-truck-delivery" style={{ color: '#0D9488' }} />
                      SPEEDEX COURIER &amp; LOGISTICS SERVICES
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.6, marginTop: 4 }}>
                      Fast Nationwide Express Freight &amp; Delivery Logistics<br />
                      BIR Registered Non-VAT/VAT &bull; TIN: 402-881-902-000<br />
                      Speedex Operations Hub, Metro Manila, Philippines
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      LIQUIDATION VOUCHER
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                      {printVoucherRecord.reference || `LIQ-${printVoucherRecord.id}`}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: 2 }}>
                      Audit Series: AUD-2026-PH
                    </div>
                  </div>
                </div>

                {/* Executive 2-Box Summary Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '22px' }}>
                  <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '14px 18px', background: '#F8FAFC' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                      I. Accountability &amp; Trip Info
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', lineHeight: 2 }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Accountable Officer:</span>
                      <span style={{ color: '#0F172A', fontWeight: 700 }}>{printVoucherRecord.submittedBy || 'Juan Dela Cruz'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', lineHeight: 2 }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Department / Unit:</span>
                      <span style={{ color: '#0F172A', fontWeight: 700 }}>Fleet Logistics &amp; Transport</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', lineHeight: 2 }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Operational Scope / Route:</span>
                      <span style={{ color: '#0F172A', fontWeight: 700 }}>Provincial Courier Delivery</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', lineHeight: 2 }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Date Liquidated:</span>
                      <span style={{ color: '#0F172A', fontWeight: 700 }}>{formatDate(printVoucherRecord.submittedAt || printVoucherRecord.dateSubmitted)}</span>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #CCFBF1', borderRadius: '6px', padding: '14px 18px', background: '#F0FDFA' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', borderBottom: '1px solid #CCFBF1', paddingBottom: '4px' }}>
                      II. Financial Settlement Summary
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', lineHeight: 2 }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Cash Advance Released:</span>
                      <span style={{ color: '#0F172A', fontWeight: 700 }}>{formatCurrency(computeCashAdvance(printVoucherRecord))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', lineHeight: 2 }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Actual Liquidated Expenses:</span>
                      <span style={{ color: '#0D9488', fontWeight: 800 }}>{formatCurrency(printVoucherRecord.amount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', lineHeight: 2, borderTop: '1px dashed #CBD5E1', marginTop: '4px', paddingTop: '4px' }}>
                      <span style={{ color: (printVoucherRecord.leftoverCash || 0) > 0 ? '#166534' : (printVoucherRecord.reimbursementAmount || 0) > 0 ? '#B45309' : '#64748B', fontWeight: 700 }}>
                        {(printVoucherRecord.leftoverCash || 0) > 0 ? 'Leftover Refund to Cashier:' : (printVoucherRecord.reimbursementAmount || 0) > 0 ? 'Reimbursement Due (Abono):' : 'Reconciliation Variance:'}
                      </span>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: (printVoucherRecord.leftoverCash || 0) > 0 ? '#166534' : (printVoucherRecord.reimbursementAmount || 0) > 0 ? '#B45309' : '#0F172A' }}>
                        {formatCurrency(printVoucherRecord.leftoverCash || printVoucherRecord.reimbursementAmount || 0)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                      <span>Audited Receipts:</span>
                      <span style={{ fontWeight: 600 }}>{(printVoucherRecord.expenses || []).length} Verified Items</span>
                    </div>
                  </div>
                </div>

                {/* Particulars & Official Receipts Table */}
                <div style={{ marginBottom: '22px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                    Itemized Particulars &amp; Official Receipts
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#F1F5F9' }}>
                        <th style={{ padding: '8px 10px', border: '1px solid #CBD5E1', color: '#475569', fontWeight: 700, textAlign: 'center', width: '32px' }}>#</th>
                        <th style={{ padding: '8px 10px', border: '1px solid #CBD5E1', color: '#475569', fontWeight: 700, textAlign: 'left' }}>Category &amp; Particulars</th>
                        <th style={{ padding: '8px 10px', border: '1px solid #CBD5E1', color: '#475569', fontWeight: 700, textAlign: 'left', width: '140px' }}>OR / Invoice #</th>
                        <th style={{ padding: '8px 10px', border: '1px solid #CBD5E1', color: '#475569', fontWeight: 700, textAlign: 'left', width: '160px' }}>Merchant / Supplier</th>
                        <th style={{ padding: '8px 10px', border: '1px solid #CBD5E1', color: '#475569', fontWeight: 700, textAlign: 'right', width: '110px' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(printVoucherRecord.expenses || []).map((exp: LiquidationExpense, idx: number) => {
                        const cat = getExpenseCategory(exp);
                        return (
                          <tr key={idx}>
                            <td style={{ padding: '8px 10px', border: '1px solid #E2E8F0', textAlign: 'center', color: '#64748B' }}>{idx + 1}</td>
                            <td style={{ padding: '8px 10px', border: '1px solid #E2E8F0' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: cat.bg,
                                color: cat.color,
                                border: `1px solid ${cat.color}30`,
                                textTransform: 'uppercase',
                                marginBottom: '2px'
                              }}>
                                <i className={`ti ${cat.icon}`} style={{ fontSize: 11 }} /> {cat.name}
                              </span>
                              <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '12px' }}>{exp.description || exp.type}</div>
                            </td>
                            <td style={{ padding: '8px 10px', border: '1px solid #E2E8F0', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                              {getOrNumber(exp, idx, printVoucherRecord.documents || [])}
                            </td>
                            <td style={{ padding: '8px 10px', border: '1px solid #E2E8F0', color: '#475569' }}>
                              {getVendor(exp)}
                            </td>
                            <td style={{ padding: '8px 10px', border: '1px solid #E2E8F0', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                              {formatCurrency(exp.amount)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: '#F8FAFC' }}>
                        <td colSpan={4} style={{ padding: '10px 12px', border: '1px solid #CBD5E1', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                          Total Liquidated Amount:
                        </td>
                        <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1', textAlign: 'right', fontWeight: 800, color: '#0D9488', fontSize: '13px' }}>
                          {formatCurrency(printVoucherRecord.amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Settlement Note */}
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '6px',
                  marginBottom: '26px',
                  background: (printVoucherRecord.leftoverCash || 0) > 0 ? '#F0FDF4' : (printVoucherRecord.reimbursementAmount || 0) > 0 ? '#FFFBEB' : '#F8FAFC',
                  border: `1px solid ${(printVoucherRecord.leftoverCash || 0) > 0 ? '#BBF7D0' : (printVoucherRecord.reimbursementAmount || 0) > 0 ? '#FDE68A' : '#E2E8F0'}`
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: (printVoucherRecord.leftoverCash || 0) > 0 ? '#166534' : (printVoucherRecord.reimbursementAmount || 0) > 0 ? '#B45309' : '#475569',
                    marginBottom: '4px'
                  }}>
                    {(printVoucherRecord.leftoverCash || 0) > 0
                      ? 'TREASURY CASH REMITTANCE INSTRUCTION'
                      : (printVoucherRecord.reimbursementAmount || 0) > 0
                      ? 'FINANCE REIMBURSEMENT PAYABLE INSTRUCTION'
                      : 'SETTLEMENT RECONCILIATION SUMMARY'}
                  </div>
                  <div style={{
                    fontSize: '11.5px',
                    lineHeight: 1.5,
                    color: (printVoucherRecord.leftoverCash || 0) > 0 ? '#166534' : (printVoucherRecord.reimbursementAmount || 0) > 0 ? '#92400E' : '#475569'
                  }}>
                    {(printVoucherRecord.leftoverCash || 0) > 0
                      ? `The accountable driver/officer has leftover cash of ${formatCurrency(printVoucherRecord.leftoverCash)}. This amount must be surrendered to the company cashier upon filing of this voucher.`
                      : (printVoucherRecord.reimbursementAmount || 0) > 0
                      ? `The employee incurred out-of-pocket expenses (abono) of ${formatCurrency(printVoucherRecord.reimbursementAmount)}. Speedex Finance shall release payment to the employee upon full approval.`
                      : 'The actual expenses liquidated perfectly match the advance released. No further cash remittance or reimbursement is required.'}
                  </div>
                </div>

                {/* Tripartite Signature Blocks */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '30px', paddingTop: '10px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderBottom: '1.5px solid #0F172A', height: '36px', marginBottom: '8px' }} />
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>{printVoucherRecord.submittedBy || 'Juan Dela Cruz'}</div>
                    <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>Prepared &amp; Liquidated By (Driver)</div>
                    <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>Date: {formatDate(printVoucherRecord.submittedAt || printVoucherRecord.dateSubmitted)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderBottom: '1.5px solid #0F172A', height: '36px', marginBottom: '8px' }} />
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Joana Marie Ogaya</div>
                    <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>Verified &amp; Validated By (Asst. FM)</div>
                    <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>Date: {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderBottom: '1.5px solid #0F172A', height: '36px', marginBottom: '8px' }} />
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Misty</div>
                    <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>Approved for Settlement (Head of Finance)</div>
                    <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>Date: ____________________</div>
                  </div>
                </div>

                <div style={{ textAlign: 'center', fontSize: '9.5px', color: '#94A3B8', marginTop: '30px', borderTop: '1px dashed #CBD5E1', paddingTop: '10px' }}>
                  SPEEDEX COURIER &amp; LOGISTICS &bull; BIR COMPLIANT LIQUIDATION VOUCHER &bull; GENERATED VIA SPEEDEX FOMS FINANCIAL OPERATIONS PLATFORM
                </div>
              </div>

              {/* Bottom Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  onClick={() => setPrintVoucherRecord(null)}
                  style={{ padding: '9px 18px', background: '#fff', color: '#0F172A', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Close
                </button>
                <button
                  onClick={() => handlePrintVoucher(printVoucherRecord)}
                  style={{
                    padding: '9px 18px',
                    background: '#FFFFFF',
                    color: '#0F172A',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className="ti ti-printer" style={{ fontSize: 15 }} /> Print
                </button>
                <button
                  onClick={() => handleDownloadPdf(printVoucherRecord)}
                  style={{
                    padding: '9px 22px',
                    background: '#0D9488',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 2px 4px rgba(13,148,136,0.2)'
                  }}
                >
                  <i className="ti ti-file-type-pdf" style={{ fontSize: 16 }} /> Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RecordHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        recordId={viewRecord?.id || ''}
        recordType="Liquidation"
      />
      {/* Permanent View Switcher (fixed position - never jumps) */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 2px',
        marginBottom: '-12px'
      }}>
        {renderViewSwitcher()}
      </div>

      <TableContainer>
        {viewLayout === 'cards' ? (
          <div>
            {/* Cards View Controls Toolbar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '20px 24px 16px 24px',
              borderBottom: '1px solid #E2E8F0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '240px' }}>
                  <i className="ti ti-search" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '15px' }} />
                  <input
                    type="text"
                    placeholder="Search liquidations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 16px 0 38px',
                      borderRadius: '24px',
                      border: '1px solid #E2E8F0',
                      background: '#F1F5F9',
                      fontSize: '13px',
                      color: '#1E293B',
                      outline: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onFocus={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#0D9488'; }}
                    onBlur={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    height: '38px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    fontSize: '13px',
                    color: '#1E293B',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="Pending Validation">Pending Validation</option>
                  <option value="Validated">Validated</option>
                  <option value="Endorsed">Endorsed</option>
                  <option value="Returned">Returned</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>From:</span>
                  <div style={{ width: '130px' }}>
                    <CalendarPicker
                      label=""
                      value={fromDate}
                      onChange={setFromDate}
                      placeholder="Start date..."
                      variant="filter"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>To:</span>
                  <div style={{ width: '130px' }}>
                    <CalendarPicker
                      label=""
                      value={toDate}
                      onChange={setToDate}
                      placeholder="End date..."
                      variant="filter"
                      minDate={fromDate}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Cards Grid */}
            <div style={{ padding: '24px' }}>
              {cardFilteredLiquidations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
                  <i className="ti ti-file-search" style={{ fontSize: '42px', color: '#CBD5E1', display: 'block', marginBottom: '12px' }} />
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>No liquidation reports found</div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>Try adjusting your search criteria or date filter.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
                  {cardFilteredLiquidations.map((row: Liquidation) => {
                    const cashAdv = computeCashAdvance(row);
                    const leftover = Number(row.leftoverCash || 0);
                    const reimb = Number(row.reimbursementAmount || 0);
                    const receiptsCount = (row.expenses || []).length;
                    const docsCount = (row.documents || []).length;

                    return (
                      <div
                        key={row.id}
                        style={{
                          background: '#FFFFFF',
                          borderRadius: '12px',
                          border: '1px solid #E2E8F0',
                          padding: '20px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '16px',
                          transition: 'all 0.2s ease',
                          position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#0D9488';
                          e.currentTarget.style.boxShadow = '0 8px 24px rgba(13,148,136,0.12)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#E2E8F0';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                          e.currentTarget.style.transform = 'none';
                        }}
                      >
                        <div>
                          {/* Card Top: Reference No & Status */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div>
                              <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                REFERENCE NO.
                              </span>
                              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                {row.reference || `LIQ-${row.id}`}
                              </div>
                            </div>
                            <StatusBadge status={row.status} />
                          </div>

                          {/* Submitter & Date */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9', marginBottom: '14px' }}>
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              background: '#F0FDFA',
                              border: '1px solid #CCFBF1',
                              color: '#0D9488',
                              fontSize: '13px',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {getInitials(row.submittedBy)}
                            </div>
                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                                {row.submittedBy || 'Juan Dela Cruz'}
                              </div>
                              <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, marginTop: '2px' }}>
                                <i className="ti ti-calendar" style={{ fontSize: '12px' }} />
                                Submitted on {formatDate(row.submittedAt || row.dateSubmitted)}
                              </div>
                            </div>
                          </div>

                          {/* Financial Details Box */}
                          <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '12px 14px', border: '1px solid #E2E8F0', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <div>
                                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  EXPENSE AMOUNT
                                </span>
                                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                  {formatCurrency(row.amount)}
                                </div>
                              </div>
                              <div>
                                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', textAlign: 'right' }}>
                                  CASH ADVANCE
                                </span>
                                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#475569', marginTop: '2px', textAlign: 'right' }}>
                                  {formatCurrency(cashAdv)}
                                </div>
                              </div>
                            </div>

                            {/* Settlement / Balance Pill */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed #CBD5E1' }}>
                              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Settlement:</span>
                              {leftover > 0 ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: '#DCFCE7', color: '#166534', fontSize: '11.5px', fontWeight: 700 }}>
                                  <i className="ti ti-arrow-down-left" style={{ fontSize: 13 }} />
                                  ₱{leftover.toLocaleString('en-PH', { minimumFractionDigits: 2 })} Return
                                </span>
                              ) : reimb > 0 ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: '#FEF3C7', color: '#B45309', fontSize: '11.5px', fontWeight: 700 }}>
                                  <i className="ti ti-arrow-up-right" style={{ fontSize: 13 }} />
                                  ₱{reimb.toLocaleString('en-PH', { minimumFractionDigits: 2 })} Reimburse
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: '#F1F5F9', color: '#64748B', fontSize: '11.5px', fontWeight: 600 }}>
                                  <i className="ti ti-check" style={{ fontSize: 13 }} /> Balanced
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Audit Info Tags */}
                          <div style={{ display: 'flex', gap: '12px', fontSize: '11.5px', color: '#64748B' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="ti ti-receipt" style={{ color: '#0D9488' }} /> {receiptsCount} receipts
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="ti ti-paperclip" style={{ color: '#64748B' }} /> {docsCount} attachments
                            </span>
                          </div>
                        </div>

                        {/* Card Actions */}
                        <div style={{ paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
                          <button
                            onClick={() => setSelectedLiquidationId(row.id)}
                            style={{
                              width: '100%',
                              padding: '8px 14px',
                              background: '#F0FDFA',
                              border: '1px solid #CCFBF1',
                              borderRadius: '6px',
                              color: '#0D9488',
                              fontSize: '12.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#0D9488';
                              e.currentTarget.style.color = '#fff';
                              e.currentTarget.style.borderColor = '#0D9488';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#F0FDFA';
                              e.currentTarget.style.color = '#0D9488';
                              e.currentTarget.style.borderColor = '#CCFBF1';
                            }}
                          >
                            <i className="ti ti-file-search" /> Review Liquidation
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <DataTable
            title=""
            data={dateFilteredLiquidations}
            columns={columns}
            actions={actions}
            rowKey="id"
            searchPlaceholder="Search liquidations..."
            searchFields={['id', 'reference', 'submittedBy']}
            defaultPageSize={10}
            filters={[
              {
                key: 'status',
                label: 'All Statuses',
                options: [
                  { label: 'Pending Validation', value: 'Pending Validation' },
                  { label: 'Validated', value: 'Validated' },
                  { label: 'Endorsed', value: 'Endorsed' },
                  { label: 'Returned', value: 'Returned' }
                ],
                filterFn: (row: Liquidation, value: string) => row.status === value
              }
            ]}
            customFilters={
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>From:</span>
                  <div style={{ width: '140px' }}>
                    <CalendarPicker 
                      label=""
                      value={fromDate} 
                      onChange={setFromDate} 
                      placeholder="Start date..." 
                      variant="filter"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>To:</span>
                  <div style={{ width: '140px' }}>
                    <CalendarPicker 
                      label=""
                      value={toDate} 
                      onChange={setToDate} 
                      placeholder="End date..." 
                      variant="filter"
                      minDate={fromDate}
                    />
                  </div>
                </div>
              </div>
            }
          />
        )}
      </TableContainer>
    </div>
  );
}
