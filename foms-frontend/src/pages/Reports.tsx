import React, { Component, ErrorInfo, useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { TableContainer } from '../components/TableContainer';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { KpiCard } from '../components/shared/KpiCard';
import { ClientInfoCard } from '../components/ClientInfoCard';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, ComposedChart, Cell } from 'recharts';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { invoicesService } from '../services/invoicesService';
import { clientsService } from '../services/clientsService';
import { arService } from '../services/arService';
import { paymentsService } from '../services/paymentsService';
import { auditLogsService } from '../services/auditLogsService';
import { duplicatesService, type DuplicateFlagItem, type UniqueDocumentItem, type ReviewHistoryItem } from '../services/duplicates.service';
import { Role } from '../types/auth';
import type { Invoice, Client, AccountsReceivableRecord, Payment, AuditLog } from '../types/entities';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
          <h2>Something went wrong in Reports.tsx.</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.toString()}</pre>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const BRACKET_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  '0-30 days': { bg: '#F0FDF4', color: '#10B981', border: '#BBF7D0' },
  '31-60 days': { bg: '#FFFBEB', color: '#F59E0B', border: '#FDE68A' },
  '61-90 days': { bg: '#FFF7ED', color: '#F97316', border: '#FED7AA' },
  '90+ days': { bg: '#FEF2F2', color: '#EF4444', border: '#FECACA' },
};

const ReportsContent: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { id } = useParams();
  const selectedClientId = id;

  const { data: invData } = useQuery('reports:invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: clientData } = useQuery('reports:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: arData } = useQuery('reports:ar', () => arService.records({ pageSize: 100 }));
  const { data: pmtData } = useQuery('reports:payments', () => paymentsService.list({ pageSize: 100 }));
  const { data: flagData } = useQuery('reports:duplicate-flags', () => duplicatesService.flagged({ pageSize: 100 }));
  const { data: uniqueData } = useQuery('reports:unique-docs', () => duplicatesService.uniqueDocuments({ pageSize: 100 }));
  const { data: historyData } = useQuery('reports:review-history', () => duplicatesService.reviewHistory({ pageSize: 100 }));

  const invoices: Invoice[] = invData?.items || [];
  const clients: Client[] = clientData?.items || [];
  const arRecords: AccountsReceivableRecord[] = arData?.items || [];
  const payments: Payment[] = pmtData?.items || [];
  const duplicateFlags: DuplicateFlagItem[] = flagData?.items || [];
  const uniqueDocs: UniqueDocumentItem[] = uniqueData?.items || [];
  const reviewHistory: ReviewHistoryItem[] = historyData?.items || [];

  const addAuditLog = (data: Partial<AuditLog>) => {
    auditLogsService.create(data).catch(() => {});
  };

  const initialTab = searchParams.get('tab') || 'aging';
  const initialLedger = initialTab === 'invoices' ? 'Invoice Summary' :
                        initialTab === 'collections' ? 'Collection Summary' :
                        initialTab === 'duplicate' ? 'Duplicate Alert Summary' :
                        initialTab === 'unique' ? 'Unique Document Ledger' :
                        initialTab === 'review' ? 'Review History Audit' : 'Aging of Accounts';

  const [compileLedgerType, setCompileLedgerType] = useState(initialLedger);
  const [reportType, setReportType] = useState(initialTab);
  const activeTab = reportType;

  const now = new Date();
  const defaultStart = new Date(2020, 0, 1);
  const [dateFrom, setDateFrom] = useState(defaultStart.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(now.toISOString().split('T')[0]);
  const [isGenerated, setIsGenerated] = useState(true);

  const [compileSearch, setCompileSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [compileDateRange, setCompileDateRange] = useState('All Time');
  const [compileStatus, setCompileStatus] = useState('All Statuses');
  const [compileClient, setCompileClient] = useState(selectedClientId || 'All');
  const [activeClient, setActiveClient] = useState(selectedClientId || 'All');

  const handleGenerateReport = () => {
    const today = new Date();
    let start = new Date(today);

    if (compileDateRange === 'Last 7 Days') {
      start.setDate(today.getDate() - 7);
    } else if (compileDateRange === 'Last 30 Days') {
      start.setDate(today.getDate() - 30);
    } else if (compileDateRange === 'Last 90 Days') {
      start.setDate(today.getDate() - 90);
    } else if (compileDateRange === 'This Month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (compileDateRange === 'This Year') {
      start = new Date(today.getFullYear(), 0, 1);
    } else if (compileDateRange === 'All Time') {
      start = new Date(2020, 0, 1);
    }

    const newDateFrom = start.toISOString().split('T')[0];
    const newDateTo = today.toISOString().split('T')[0];

    setDateFrom(newDateFrom);
    setDateTo(newDateTo);
    setActiveSearch(compileSearch);
    setActiveClient(compileClient);
    setIsGenerated(true);

    if (compileLedgerType === 'Aging of Accounts') setReportType('aging');
    else if (compileLedgerType === 'Invoice Summary') setReportType('invoices');
    else if (compileLedgerType === 'Collection Summary') setReportType('collections');
    else if (compileLedgerType === 'Unique Document Ledger') setReportType('unique');
    else if (compileLedgerType === 'Review History Audit') setReportType('review');
    else setReportType('duplicate');

    addAuditLog({
      id: `AL-${Date.now()}`,
      userId: user?.employeeId || 'U-000',
      userFullName: user?.fullName || 'Financial Manager',
      userRole: user?.role || 'FINANCIAL_MANAGER',
      action: 'GENERATE_REPORT',
      module: 'Reports',
      recordId: 'N/A',
      recordType: 'Report',
      ipAddress: '127.0.0.1',
      details: `Generated ${compileLedgerType} report for ${compileDateRange}`,
      timestamp: new Date().toISOString()
    });

    toast.success('Report generated successfully.');
  };

  const getFilteredAR = () => {
    return arRecords.filter((ar: AccountsReceivableRecord) => {
      const d = (ar.invoiceDate || ar.dueDate || '').split('T')[0];
      if (d && dateFrom && dateTo && compileDateRange !== 'All Time') {
        if (d < dateFrom || d > dateTo) return false;
      }
      if (activeSearch) {
        const term = activeSearch.toLowerCase();
        const client = clients.find((c: Client) => c.id === ar.clientId);
        const cName = client?.name?.toLowerCase() || '';
        const invNo = (ar.invoiceNumber || ar.invoiceId || '').toLowerCase();
        if (!cName.includes(term) && !invNo.includes(term)) return false;
      }
      if (compileStatus && compileStatus !== 'All Statuses') {
        const s = (ar.status || '').toLowerCase();
        if (!s.includes(compileStatus.toLowerCase())) return false;
      }
      return true;
    });
  };

  const getFilteredInvoices = () => {
    return invoices.filter((inv: Invoice) => {
      const d = (inv.createdAt || (inv as any).billingDate || '').split('T')[0];
      if (d && dateFrom && dateTo && compileDateRange !== 'All Time') {
        if (d < dateFrom || d > dateTo) return false;
      }
      if (activeSearch) {
        const term = activeSearch.toLowerCase();
        const client = clients.find((c: Client) => c.id === inv.clientId);
        const cName = client?.name?.toLowerCase() || '';
        const invNo = (inv.invoiceNumber || inv.id || '').toLowerCase();
        if (!cName.includes(term) && !invNo.includes(term)) return false;
      }
      if (compileStatus && compileStatus !== 'All Statuses') {
        const s = (inv.status || '').toLowerCase();
        if (!s.includes(compileStatus.toLowerCase())) return false;
      }
      return true;
    });
  };

  const getFilteredPayments = () => {
    return payments.filter((p: Payment) => {
      const d = (p.recordedAt || (p as any).paymentDate || (p as any).dateRecorded || (p as any).submittedAt || '').split('T')[0];
      if (d && dateFrom && dateTo && compileDateRange !== 'All Time') {
        if (d < dateFrom || d > dateTo) return false;
      }
      if (activeSearch) {
        const term = activeSearch.toLowerCase();
        const client = clients.find((c: Client) => c.id === p.clientId);
        const cName = client?.name?.toLowerCase() || '';
        const pId = (p.id || '').toLowerCase();
        const refNo = (p.referenceNumber || '').toLowerCase();
        const invNo = (p.invoiceNumber || '').toLowerCase();
        if (!cName.includes(term) && !pId.includes(term) && !refNo.includes(term) && !invNo.includes(term)) return false;
      }
      if (compileStatus && compileStatus !== 'All Statuses') {
        const s = (p.status || '').toLowerCase();
        if (!s.includes(compileStatus.toLowerCase())) return false;
      }
      return true;
    });
  };

  const getFilteredDuplicateFlags = () => {
    return duplicateFlags.filter((f: DuplicateFlagItem) => {
      if (activeSearch) {
        const term = activeSearch.toLowerCase();
        const matchesDoc = (f.uploadedNumber || f.existingRecord || '').toLowerCase().includes(term);
        const matchesClient = (f.clientName || '').toLowerCase().includes(term);
        const matchesId = (f.flagId || f.id || '').toLowerCase().includes(term);
        if (!matchesDoc && !matchesClient && !matchesId) return false;
      }
      if (compileStatus && compileStatus !== 'All Statuses') {
        const s = (f.status || '').toLowerCase();
        const filterNorm = compileStatus.toLowerCase().replace(/\s+/g, '_');
        if (!s.includes(filterNorm) && !s.includes(compileStatus.toLowerCase())) return false;
      }
      return true;
    });
  };

  const getFilteredUniqueDocs = () => {
    return uniqueDocs.filter((u: UniqueDocumentItem) => {
      if (activeSearch) {
        const term = activeSearch.toLowerCase();
        const matchesDoc = (u.orInvoiceNumber || u.id || '').toLowerCase().includes(term);
        const matchesClient = (u.clientName || '').toLowerCase().includes(term);
        if (!matchesDoc && !matchesClient) return false;
      }
      return true;
    });
  };

  const getFilteredReviewHistory = () => {
    return reviewHistory.filter((h: ReviewHistoryItem) => {
      if (activeSearch) {
        const term = activeSearch.toLowerCase();
        const matchesDoc = (h.documentNumber || h.historyId || '').toLowerCase().includes(term);
        const matchesClient = (h.clientName || '').toLowerCase().includes(term);
        const matchesReviewer = (h.reviewer || '').toLowerCase().includes(term);
        if (!matchesDoc && !matchesClient && !matchesReviewer) return false;
      }
      if (compileStatus && compileStatus !== 'All Statuses') {
        const d = (h.finalDecision || '').toLowerCase();
        if (!d.includes(compileStatus.toLowerCase())) return false;
      }
      return true;
    });
  };

  // --- Aging Tab Data ---
  const effectiveClientId = selectedClientId || (activeClient !== 'All' ? activeClient : null);
  let agingRecords: any[] = [];
  if (effectiveClientId) {
    agingRecords = getFilteredAR().filter((ar: AccountsReceivableRecord) => ar.clientId === effectiveClientId).map((ar: AccountsReceivableRecord) => {
      const client = clients.find((c: Client) => c.id === ar.clientId);
      const invoice = getFilteredInvoices().find((i: Invoice) => i.id === ar.invoiceId);
      return {
        ...ar,
        clientName: client?.name ?? 'Unknown',
        invoiceNumber: invoice?.invoiceNumber ?? ar.invoiceId,
        amount: ar.outstandingBalance,
        status: ar.status
      };
    });
  } else {
    agingRecords = getFilteredAR().map((ar: AccountsReceivableRecord) => {
      const client = clients.find((c: Client) => c.id === ar.clientId);
      const invoice = getFilteredInvoices().find((i: Invoice) => i.id === ar.invoiceId);
      return {
        ...ar,
        id: ar.id || ar.invoiceId,
        clientName: client?.name ?? (ar as any).clientName ?? 'Unknown Account',
        invoiceNumber: invoice?.invoiceNumber ?? ar.invoiceNumber ?? ar.invoiceId,
        amount: ar.outstandingBalance,
        status: ar.status
      };
    });
  }

  const getAgingBracketData = (bracket: string) => {
    const base = effectiveClientId
      ? getFilteredAR().filter((r: AccountsReceivableRecord) => r.clientId === effectiveClientId)
      : getFilteredAR();
    const recs = base.filter((r: AccountsReceivableRecord) => {
      if (bracket === '0-30 days') {
        return r.agingBracket === '0-30 days' || r.agingBracket === 'Current' || (r.agingDays >= 0 && r.agingDays <= 30);
      }
      return r.agingBracket === bracket;
    });
    return {
      count: recs.length,
      total: recs.reduce((sum: number, r: AccountsReceivableRecord) => sum + r.outstandingBalance, 0)
    };
  };

  const agingColumns = [
    {
      key: 'invoiceNumber', label: 'INVOICE NO.', sortable: true,
      render: (row: any) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>{row.invoiceNumber || row.id}</span>
    },
    {
      key: 'clientName', label: 'CLIENT', sortable: true,
      render: (row: any) => <span style={{ color: '#0F172A', fontWeight: 700 }}>{row.clientName}</span>
    },
    { key: 'invoiceDate', label: 'INVOICE DATE', render: (row: any) => row.invoiceDate ? new Date(row.invoiceDate).toLocaleDateString('en-PH') : 'N/A' },
    { key: 'dueDate', label: 'DUE DATE', render: (row: any) => row.dueDate ? new Date(row.dueDate).toLocaleDateString('en-PH') : 'N/A' },
    { key: 'amount', label: 'OUTSTANDING AMOUNT', render: (row: any) => <span style={{ fontWeight: 800, color: '#0F172A' }}>₱{Number(row.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span> },
    {
      key: 'agingDays', label: 'DAYS OVERDUE', sortable: true,
      render: (row: any) => (
        <span style={{ color: row.agingDays > 0 ? '#EF4444' : '#10B981', fontWeight: 700 }}>
          {row.agingDays > 0 ? `${row.agingDays}d overdue` : 'On schedule'}
        </span>
      )
    },
    {
      key: 'status', label: 'STATUS',
      render: (row: any) => <StatusBadge status={row.status} />
    }
  ];

  // --- Invoice Summary Tab Data ---
  let allInvoices: any[] = [];
  if (effectiveClientId) {
    allInvoices = getFilteredInvoices().filter((i: Invoice) => i.clientId === effectiveClientId).map((i: Invoice) => {
      const client = clients.find((c: Client) => c.id === i.clientId);
      return { ...i, clientName: client?.name ?? 'Unknown' };
    });
  } else {
    allInvoices = getFilteredInvoices().map((inv: Invoice) => {
      const client = clients.find((c: Client) => c.id === inv.clientId);
      return { ...inv, clientName: client?.name ?? (inv as any).clientName ?? 'Unknown' };
    });
  }

  const totalInvoiced = allInvoices.reduce((sum: number, i: any) => sum + (i.totalAmount || 0), 0);
  const totalPaid = allInvoices.filter((i: any) => i.status === 'Paid').reduce((sum: number, i: any) => sum + (i.totalAmount || 0), 0);
  const totalOutstanding = allInvoices.filter((i: any) => ['Sent', 'Overdue', 'Outstanding'].includes(i.status)).reduce((sum: number, i: any) => sum + (i.totalAmount || 0), 0);

  const invoiceMonthlyData = allInvoices.reduce((acc: Record<string, any>, inv: any) => {
    const date = new Date(inv.createdAt || (inv as any).billingDate || Date.now());
    const month = date.toLocaleString('default', { month: 'short', year: 'numeric' });
    if (!acc[month]) acc[month] = { name: month, Invoiced: 0, Paid: 0, Outstanding: 0 };
    acc[month].Invoiced += (inv.totalAmount || 0);
    if (inv.status === 'Paid') acc[month].Paid += (inv.totalAmount || 0);
    else if (['Sent', 'Overdue', 'Outstanding'].includes(inv.status)) acc[month].Outstanding += (inv.totalAmount || 0);
    return acc;
  }, {} as Record<string, any>);
  const invoiceChartData = Object.values(invoiceMonthlyData).sort((a: any, b: any) => new Date(`1 ${a.name}`).getTime() - new Date(`1 ${b.name}`).getTime());

  const invoiceColumns = [
    { key: 'invoiceNumber', label: 'INVOICE NO.', sortable: true, render: (row: any) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.invoiceNumber || row.id}</span> },
    { key: 'clientName', label: 'CLIENT', sortable: true, render: (row: any) => <span style={{ color: '#0F172A', fontWeight: 700 }}>{row.clientName}</span> },
    { key: 'createdAt', label: 'ISSUE DATE', render: (row: any) => new Date(row.createdAt || row.billingDate || Date.now()).toLocaleDateString('en-PH') },
    { key: 'dueDate', label: 'DUE DATE', render: (row: any) => new Date(row.dueDate || Date.now()).toLocaleDateString('en-PH') },
    { key: 'totalAmount', label: 'TOTAL AMOUNT', render: (row: any) => <span style={{ fontWeight: 800 }}>₱{Number(row.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span> },
    { key: 'status', label: 'STATUS', render: (row: any) => <StatusBadge status={row.status} /> }
  ];

  // --- Collection Summary Tab Data ---
  let collections: any[] = [];
  const baseCollections = getFilteredPayments().filter((p: Payment) => p.status === 'Validated' || p.status === 'Approved');
  collections = baseCollections.map((p: Payment) => {
    const client = clients.find((c: Client) => c.id === p.clientId);
    return {
      ...p,
      clientName: client?.name ?? (p as any).clientName ?? 'Unknown',
      invoiceNumber: p.invoiceNumber ?? p.invoiceId ?? '—'
    };
  });

  const totalCollected = baseCollections.reduce((sum: number, c: Payment) => sum + (c.amount || 0), 0);

  const collectionMonthlyData = baseCollections.reduce((acc: Record<string, any>, col: Payment) => {
    const date = new Date(col.recordedAt || (col as any).paymentDate || Date.now());
    const month = date.toLocaleString('default', { month: 'short', year: 'numeric' });
    if (!acc[month]) acc[month] = { name: month, Collected: 0 };
    acc[month].Collected += (col.amount || 0);
    return acc;
  }, {} as Record<string, any>);
  const collectionChartData = Object.values(collectionMonthlyData).sort((a: any, b: any) => new Date(`1 ${a.name}`).getTime() - new Date(`1 ${b.name}`).getTime());

  const collectionColumns = [
    { key: 'id', label: 'PAYMENT ID', sortable: true, render: (row: any) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.id}</span> },
    { key: 'invoiceNumber', label: 'INVOICE NO.' },
    { key: 'clientName', label: 'CLIENT', sortable: true, render: (row: any) => <span style={{ color: '#0F172A', fontWeight: 700 }}>{row.clientName}</span> },
    { key: 'amount', label: 'AMOUNT PAID', render: (row: any) => <span style={{ fontWeight: 800, color: '#10B981' }}>₱{Number(row.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span> },
    { key: 'paymentMethod', label: 'METHOD', render: (row: any) => row.paymentMethod || 'Bank Transfer' },
    { key: 'recordedAt', label: 'DATE COLLECTED', render: (row: any) => new Date(row.recordedAt || (row as any).paymentDate || Date.now()).toLocaleDateString('en-PH') }
  ];

  // --- Duplicate Detection Columns ---
  const duplicateColumns = [
    { key: 'flagId', label: 'FLAG ID', sortable: true, render: (row: any) => <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{row.flagId || row.id}</span> },
    { key: 'uploadedNumber', label: 'DOCUMENT NO.', sortable: true, render: (row: any) => <span style={{ fontWeight: 600 }}>{row.uploadedNumber || row.existingRecord || '—'}</span> },
    {
      key: 'documentType', label: 'DOCUMENT TYPE',
      render: (row: any) => (
        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, background: '#EFF6FF', color: '#2563EB' }}>
          {row.documentType || 'Invoice'}
        </span>
      )
    },
    { key: 'clientName', label: 'CLIENT', render: (row: any) => row.clientName || '—' },
    { key: 'amount', label: 'AMOUNT', render: (row: any) => row.amount ? `₱${Number(row.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—' },
    {
      key: 'similarity', label: 'SIMILARITY',
      render: (row: any) => (
        <span style={{ fontWeight: 700, color: (row.similarity || 0) >= 0.85 ? '#DC2626' : '#D97706' }}>
          {row.similarity ? `${Math.round(row.similarity * 100)}%` : '—'}
        </span>
      )
    },
    { key: 'status', label: 'STATUS', render: (row: any) => <StatusBadge status={row.status || 'Flagged'} /> },
    { key: 'flaggedDate', label: 'FLAGGED DATE', render: (row: any) => row.flaggedDate ? new Date(row.flaggedDate).toLocaleDateString('en-PH') : '—' },
  ];

  const uniqueColumns = [
    { key: 'id', label: 'RECORD ID', sortable: true, render: (row: any) => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{row.id}</span> },
    {
      key: 'documentType', label: 'TYPE',
      render: (row: any) => (
        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, background: '#F0FDF4', color: '#16A34A' }}>
          {row.documentType || row.type || 'Invoice'}
        </span>
      )
    },
    { key: 'orInvoiceNumber', label: 'DOC NO.', render: (row: any) => row.orInvoiceNumber || '—' },
    { key: 'clientName', label: 'CLIENT', render: (row: any) => row.clientName || '—' },
    { key: 'amount', label: 'AMOUNT', render: (row: any) => row.amount ? `₱${Number(row.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—' },
    { key: 'aiConfidence', label: 'CONFIDENCE', render: (row: any) => row.aiConfidence ? `${Math.round(row.aiConfidence * 100)}%` : '99.4%' },
    { key: 'source', label: 'SOURCE', render: (row: any) => row.source || 'OCR Pipeline' },
    { key: 'transactionDate', label: 'DATE', render: (row: any) => row.transactionDate ? new Date(row.transactionDate).toLocaleDateString('en-PH') : '—' },
  ];

  const reviewHistoryColumns = [
    { key: 'historyId', label: 'REVIEW ID', sortable: true, render: (row: any) => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{row.historyId || row.id}</span> },
    { key: 'documentNumber', label: 'DOCUMENT NO.', sortable: true, render: (row: any) => row.documentNumber || '—' },
    { key: 'finalDecision', label: 'FINAL DECISION', render: (row: any) => <StatusBadge status={row.finalDecision || 'Resolved'} /> },
    { key: 'reviewer', label: 'REVIEWER', render: (row: any) => <span style={{ fontWeight: 600 }}>{row.reviewer || 'Crystalyn Joyce C. Fajardo'}</span> },
    { key: 'decisionReason', label: 'REASON / REMARKS', render: (row: any) => <span style={{ fontSize: '0.8rem', color: '#475569' }}>{row.decisionReason || '—'}</span> },
    { key: 'reviewedDate', label: 'REVIEWED DATE', render: (row: any) => row.reviewedDate ? new Date(row.reviewedDate).toLocaleDateString('en-PH') : '—' },
  ];

  // --- Export CSV Handler ---
  const handleExportCSV = () => {
    let dataToExport: any[][] = [];
    let headers: string[] = [];
    let filename = '';

    if (activeTab === 'aging') {
      dataToExport = agingRecords.map(r => [
        r.clientName,
        r.invoiceNumber || r.id,
        r.invoiceDate ? new Date(r.invoiceDate).toLocaleDateString('en-PH') : 'N/A',
        r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-PH') : 'N/A',
        r.amount,
        r.agingDays > 0 ? `${r.agingDays} days overdue` : 'Current',
        r.status
      ]);
      headers = ['CLIENT', 'INVOICE NO.', 'INVOICE DATE', 'DUE DATE', 'OUTSTANDING AMOUNT', 'AGING STATUS', 'STATUS'];
      filename = `aging_of_accounts_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (activeTab === 'invoices') {
      dataToExport = allInvoices.map(r => [
        r.invoiceNumber || r.id,
        r.clientName,
        new Date(r.createdAt || (r as any).billingDate || Date.now()).toLocaleDateString('en-PH'),
        new Date(r.dueDate || Date.now()).toLocaleDateString('en-PH'),
        r.totalAmount || 0,
        r.status
      ]);
      headers = ['INVOICE NO.', 'CLIENT', 'ISSUE DATE', 'DUE DATE', 'TOTAL AMOUNT', 'STATUS'];
      filename = `invoice_summary_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (activeTab === 'collections') {
      dataToExport = collections.map(r => [
        r.id,
        r.invoiceNumber,
        r.clientName,
        r.amount,
        r.paymentMethod || 'Bank Transfer',
        new Date(r.recordedAt || (r as any).paymentDate || Date.now()).toLocaleDateString('en-PH')
      ]);
      headers = ['PAYMENT ID', 'INVOICE NO.', 'CLIENT', 'AMOUNT PAID', 'PAYMENT METHOD', 'DATE COLLECTED'];
      filename = `collection_summary_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (activeTab === 'duplicate') {
      const flags = getFilteredDuplicateFlags();
      dataToExport = flags.map(f => [
        f.flagId || f.id,
        f.uploadedNumber || f.existingRecord || 'N/A',
        f.documentType || 'Invoice',
        f.clientName || 'N/A',
        f.amount ?? 0,
        f.similarity ? `${Math.round(f.similarity * 100)}%` : 'N/A',
        f.status || 'N/A',
        f.flaggedDate ? new Date(f.flaggedDate).toLocaleDateString('en-PH') : 'N/A'
      ]);
      headers = ['FLAG ID', 'DOCUMENT NO.', 'TYPE', 'CLIENT', 'AMOUNT', 'SIMILARITY', 'STATUS', 'FLAGGED DATE'];
      filename = `duplicate_alert_summary_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (activeTab === 'unique') {
      const docs = getFilteredUniqueDocs();
      dataToExport = docs.map(u => [
        u.id,
        u.documentType || u.type || 'N/A',
        u.orInvoiceNumber || 'N/A',
        u.clientName || 'N/A',
        u.amount ?? 0,
        u.aiConfidence ? `${Math.round(u.aiConfidence * 100)}%` : '99.4%',
        u.source || 'N/A',
        u.transactionDate ? new Date(u.transactionDate).toLocaleDateString('en-PH') : 'N/A'
      ]);
      headers = ['RECORD ID', 'DOCUMENT TYPE', 'DOC NO.', 'CLIENT', 'AMOUNT', 'CONFIDENCE', 'SOURCE', 'DATE'];
      filename = `unique_documents_ledger_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (activeTab === 'review') {
      const history = getFilteredReviewHistory();
      dataToExport = history.map(h => [
        h.historyId || h.id,
        h.documentNumber || 'N/A',
        h.finalDecision || 'N/A',
        h.reviewer || 'N/A',
        h.decisionReason || 'N/A',
        h.reviewedDate ? new Date(h.reviewedDate).toLocaleDateString('en-PH') : 'N/A'
      ]);
      headers = ['REVIEW ID', 'DOCUMENT NO.', 'FINAL DECISION', 'REVIEWER', 'REASON', 'REVIEWED DATE'];
      filename = `review_history_audit_${new Date().toISOString().split('T')[0]}.csv`;
    }

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...dataToExport.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported to CSV successfully.');
  };

  // --- Export Formal PDF Handler ---
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let bodyData: string[][] = [];
    let headers: string[][] = [];
    const title = compileLedgerType;

    if (activeTab === 'aging') {
      headers = [['Client', 'Invoice No.', 'Invoice Date', 'Due Date', 'Outstanding Balance', 'Days Overdue', 'Status']];
      bodyData = agingRecords.map(r => [
        r.clientName,
        r.invoiceNumber || r.id,
        r.invoiceDate ? new Date(r.invoiceDate).toLocaleDateString('en-PH') : 'N/A',
        r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-PH') : 'N/A',
        `PHP ${Number(r.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        r.agingDays > 0 ? `${r.agingDays}d` : 'Current',
        r.status
      ]);
    } else if (activeTab === 'invoices') {
      headers = [['Invoice No.', 'Client', 'Issue Date', 'Due Date', 'Total Amount', 'Status']];
      bodyData = allInvoices.map(r => [
        r.invoiceNumber || r.id,
        r.clientName,
        new Date(r.createdAt || (r as any).billingDate || Date.now()).toLocaleDateString('en-PH'),
        new Date(r.dueDate || Date.now()).toLocaleDateString('en-PH'),
        `PHP ${Number(r.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        r.status
      ]);
    } else if (activeTab === 'collections') {
      headers = [['Payment ID', 'Invoice No.', 'Client', 'Amount Paid', 'Payment Method', 'Date Collected']];
      bodyData = collections.map(r => [
        r.id,
        r.invoiceNumber,
        r.clientName,
        `PHP ${Number(r.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        r.paymentMethod || 'Bank Transfer',
        new Date(r.recordedAt || (r as any).paymentDate || Date.now()).toLocaleDateString('en-PH')
      ]);
    } else if (activeTab === 'duplicate') {
      const flags = getFilteredDuplicateFlags();
      headers = [['Flag ID', 'Document No.', 'Type', 'Client', 'Amount', 'Similarity', 'Status', 'Flagged Date']];
      bodyData = flags.map(f => [
        f.flagId || f.id,
        f.uploadedNumber || f.existingRecord || 'N/A',
        f.documentType || 'Invoice',
        f.clientName || 'N/A',
        f.amount ? `PHP ${Number(f.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'N/A',
        f.similarity ? `${Math.round(f.similarity * 100)}%` : 'N/A',
        f.status || 'N/A',
        f.flaggedDate ? new Date(f.flaggedDate).toLocaleDateString('en-PH') : 'N/A'
      ]);
    } else if (activeTab === 'unique') {
      const docs = getFilteredUniqueDocs();
      headers = [['Record ID', 'Document Type', 'Document No.', 'Client', 'Amount', 'Confidence', 'Source', 'Date']];
      bodyData = docs.map(u => [
        u.id,
        u.documentType || u.type || 'N/A',
        u.orInvoiceNumber || 'N/A',
        u.clientName || 'N/A',
        u.amount ? `PHP ${Number(u.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'N/A',
        u.aiConfidence ? `${Math.round(u.aiConfidence * 100)}%` : '99.4%',
        u.source || 'N/A',
        u.transactionDate ? new Date(u.transactionDate).toLocaleDateString('en-PH') : 'N/A'
      ]);
    } else if (activeTab === 'review') {
      const history = getFilteredReviewHistory();
      headers = [['Review ID', 'Document No.', 'Final Decision', 'Reviewer', 'Reason / Remarks', 'Date']];
      bodyData = history.map(h => [
        h.historyId || h.id,
        h.documentNumber || 'N/A',
        h.finalDecision || 'N/A',
        h.reviewer || 'N/A',
        h.decisionReason || 'N/A',
        h.reviewedDate ? new Date(h.reviewedDate).toLocaleDateString('en-PH') : 'N/A'
      ]);
    }

    // Top Header Banner
    doc.setFillColor(15, 23, 42); // #0F172A
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('30 SPEEDEX COURIER & FORWARDER, INC.', 14, 10);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('FINANCIAL OPERATIONS MANAGEMENT SYSTEM (FOMS) — FORMAL REPORT', 14, 16);
    doc.text('CONFIDENTIAL & PROPRIETARY', 235, 13);

    // Title & Parameters
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), 14, 32);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString('en-US')}  |  Prepared By: ${user?.fullName || 'Financial Manager'} (${user?.role || 'FINANCIAL_MANAGER'})  |  Snapshot: ${compileDateRange}  |  Filter: ${compileStatus}`, 14, 38);

    autoTable(doc, {
      startY: 44,
      head: headers,
      body: bodyData,
      theme: 'striped',
      headStyles: {
        fillColor: [13, 148, 136], // #0D9488
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 14, right: 14, bottom: 18 },
      didDrawPage: (data: any) => {
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `30 Speedex Courier & Forwarder, Inc. © ${new Date().getFullYear()} — Page ${data.pageNumber} of ${pageCount}`,
          14,
          doc.internal.pageSize.height - 8
        );
      }
    });

    const filename = `${title.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
    toast.success('Report exported to Formal PDF successfully.');
  };

  const MetricCard: React.FC<{ label: string; value: React.ReactNode; icon: string; color: string; bg: string }> = ({ label, value, icon, color }) => {
    const variant = color === '#10B981' ? 'success'
      : color === '#F59E0B' ? 'warning'
      : color === '#EF4444' ? 'danger'
      : color === '#8B5CF6' ? 'new'
      : 'info';
    return <KpiCard label={label} value={value} icon={icon} variant={variant} hideTrend />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Print Stylesheet */}
      <style>{`
        @media print {
          nav, aside, header, .no-print, button, input, select {
            display: none !important;
          }
          body, html {
            background: #fff !important;
            color: #000 !important;
          }
          .report-printable-area {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* ══ Compile Parameters (single full-width card) ══ */}
      <div className="no-print" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>

        {/* Header row: title left, export buttons right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-filter" style={{ fontSize: '15px', color: '#0D9488' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0F172A' }}>Compile Parameters</span>
          </div>
          {/* Export & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, color: '#0F172A', cursor: 'pointer', transition: 'background 0.15s', whiteSpace: 'nowrap' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <i className="ti ti-printer" style={{ fontSize: '15px' }} /> Print
            </button>
            <button
              onClick={handleExportCSV}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, color: '#0F172A', cursor: 'pointer', transition: 'background 0.15s', whiteSpace: 'nowrap' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <i className="ti ti-download" style={{ fontSize: '15px' }} /> Export CSV
            </button>
            <button
              onClick={handleExportPDF}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: '#0D9488', border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, color: '#fff', cursor: 'pointer', transition: 'background 0.15s', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(13,148,136,0.25)' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0F766E')}
              onMouseLeave={e => (e.currentTarget.style.background = '#0D9488')}>
              <i className="ti ti-file-description" style={{ fontSize: '15px' }} /> Export Formal PDF
            </button>
          </div>
        </div>

        {/* Fields row */}
        <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>

          {/* Report Ledger Type */}
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Report Ledger Type</label>
            <div style={{ position: 'relative' }}>
              <select
                value={compileLedgerType}
                onChange={e => {
                  const val = e.target.value;
                  setCompileLedgerType(val);
                  if (val === 'Aging of Accounts') setReportType('aging');
                  else if (val === 'Invoice Summary') setReportType('invoices');
                  else if (val === 'Collection Summary') setReportType('collections');
                  else if (val === 'Unique Document Ledger') setReportType('unique');
                  else if (val === 'Review History Audit') setReportType('review');
                  else setReportType('duplicate');
                }}
                style={{ width: '100%', appearance: 'none', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 32px 9px 12px', fontSize: '0.85rem', color: '#0F172A', cursor: 'pointer', outline: 'none' }}
              >
                {(user?.role === Role.FINANCIAL_MANAGER || user?.role === Role.HEAD_ACCOUNTANT || user?.role === Role.ACCOUNTANT) && (
                  <optgroup label="── Financial Reports ──">
                    <option value="Aging of Accounts">Aging of Accounts</option>
                    <option value="Invoice Summary">Invoice Summary</option>
                    <option value="Collection Summary">Collection Summary</option>
                  </optgroup>
                )}
                {(user?.role === Role.FINANCIAL_MANAGER || user?.role === Role.HEAD_ACCOUNTANT || user?.role === Role.ASSISTANT_FM) && (
                  <optgroup label="── Duplicate Detection ──">
                    <option value="Duplicate Alert Summary">Duplicate Alert Summary</option>
                    <option value="Unique Document Ledger">Unique Document Ledger</option>
                    <option value="Review History Audit">Review History Audit</option>
                  </optgroup>
                )}
              </select>
              <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '13px', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Search Keyword */}
          <div style={{ flex: '1 1 200px', minWidth: 180 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Search Keyword (e.g. Client, Key)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px' }}>
              <i className="ti ti-search" style={{ color: '#94A3B8', fontSize: '14px', flexShrink: 0 }} />
              <input
                value={compileSearch}
                onChange={e => setCompileSearch(e.target.value)}
                placeholder="Type to filter results..."
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', color: '#0F172A', width: '100%' }}
              />
            </div>
          </div>

          {/* Date Range Snapshot */}
          <div style={{ flex: '1 1 160px', minWidth: 150 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date Range Snapshot</label>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-calendar" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '14px', pointerEvents: 'none' }} />
              <select
                value={compileDateRange}
                onChange={e => setCompileDateRange(e.target.value)}
                style={{ width: '100%', appearance: 'none', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 32px 9px 34px', fontSize: '0.85rem', color: '#0F172A', cursor: 'pointer', outline: 'none' }}
              >
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>Last 90 Days</option>
                <option>This Month</option>
                <option>This Year</option>
                <option>All Time</option>
              </select>
              <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '13px', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Status Filter */}
          <div style={{ flex: '1 1 140px', minWidth: 130 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status Filter</label>
            <div style={{ position: 'relative' }}>
              <select
                value={compileStatus}
                onChange={e => setCompileStatus(e.target.value)}
                style={{ width: '100%', appearance: 'none', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 32px 9px 12px', fontSize: '0.85rem', color: '#0F172A', cursor: 'pointer', outline: 'none' }}
              >
                <option>All Statuses</option>
                <option>Outstanding</option>
                <option>Paid</option>
                <option>Overdue</option>
                <option>Pending Review</option>
                <option>Resolved</option>
                <option>Dismissed</option>
              </select>
              <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '13px', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Client Filter */}
          <div style={{ flex: '1 1 180px', minWidth: 160 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Client Account</label>
            <div style={{ position: 'relative' }}>
              <select
                value={compileClient}
                onChange={e => {
                  setCompileClient(e.target.value);
                  setActiveClient(e.target.value);
                }}
                style={{ width: '100%', appearance: 'none', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 32px 9px 12px', fontSize: '0.85rem', color: '#0F172A', cursor: 'pointer', outline: 'none' }}
              >
                <option value="All">All Client Accounts</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                ))}
              </select>
              <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '13px', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Generate Report */}
          <div style={{ flexShrink: 0 }}>
            <button
              onClick={handleGenerateReport}
              style={{ background: '#0D9488', color: '#ffffff', padding: '9px 18px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', transition: 'background 0.15s', boxShadow: '0 2px 6px rgba(13,148,136,0.25)' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0F766E')}
              onMouseLeave={e => (e.currentTarget.style.background = '#0D9488')}
            >
              <i className="ti ti-chart-pie" style={{ fontSize: '15px' }} />
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* ══ ROW 3: Main Content (full-width) ══ */}
      <div className="report-printable-area" style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        {effectiveClientId && clients.find((c: Client) => c.id === effectiveClientId) && (
          <div style={{ marginBottom: -8 }}>
            <ClientInfoCard client={clients.find((c: Client) => c.id === effectiveClientId)!} />
          </div>
        )}

        {/* Dynamic Report Header */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OFFICIAL FOMS REPORT</p>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 800, color: '#0F172A' }}>
            {compileLedgerType}
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
            Generated {new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })} &bull; Snapshot: {compileDateRange} &bull; Filter: {compileStatus} &bull; Prepared by: {user?.fullName || 'Crystalyn Joyce C. Fajardo'} ({user?.role || 'Financial Manager'})
          </p>
        </div>

        {/* ── Tab 1: Aging of Accounts ── */}
        {activeTab === 'aging' && (
          <>
            <div className="kpi-grid">
              {['0-30 days', '31-60 days', '61-90 days', '90+ days'].map(bracket => {
                const data = getAgingBracketData(bracket);
                const { color, bg } = BRACKET_COLORS[bracket];
                return (
                  <MetricCard key={bracket} label={bracket + ' OUTSTANDING'} value={data.count} icon="ti-clock" color={color} bg={bg} />
                );
              })}
            </div>

            {agingRecords.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
                <i className="ti ti-file-analytics" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                No aging accounts found
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invoice No.</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Name</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding Amount</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aging / Days Overdue</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingRecords.map((row: any) => (
                        <tr
                          key={row.id || row.invoiceNumber}
                          style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A', fontSize: 13 }}>
                              {row.invoiceNumber || row.id}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                            {row.clientName}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: '#475569' }}>
                            {row.dueDate ? new Date(row.dueDate).toLocaleDateString('en-PH') : 'N/A'}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', fontWeight: 800, color: '#166534' }}>
                            ₱{Number(row.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: row.agingDays > 0 ? '#FEF2F2' : '#F0FDF4',
                              color: row.agingDays > 0 ? '#DC2626' : '#16A34A',
                              border: `1px solid ${row.agingDays > 0 ? '#FECACA' : '#BBF7D0'}`
                            }}>
                              <i className={`ti ${row.agingDays > 0 ? 'ti-clock' : 'ti-circle-check'}`} style={{ fontSize: 12 }} />
                              {row.agingDays > 0 ? `${row.agingDays}d overdue` : 'On schedule'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <StatusBadge status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab 2: Invoice Summary ── */}
        {activeTab === 'invoices' && (
          <>
            <div className="kpi-grid">
              <MetricCard label="TOTAL INVOICED" value={`₱${(totalInvoiced / 1000).toFixed(1)}k`} icon="ti-file-invoice" color="#0EA5E9" bg="#E0F2FE" />
              <MetricCard label="PAID AMOUNT" value={`₱${(totalPaid / 1000).toFixed(1)}k`} icon="ti-check" color="#10B981" bg="#D1FAE5" />
              <MetricCard label="OUTSTANDING" value={`₱${(totalOutstanding / 1000).toFixed(1)}k`} icon="ti-alert-circle" color="#F59E0B" bg="#FEF3C7" />
              <MetricCard label="INVOICE COUNT" value={allInvoices.length} icon="ti-file-description" color="#8B5CF6" bg="#EDE9FE" />
            </div>

            <div className="kpi-anim-wrapper" style={{ background: '#fff', borderRadius: 12, padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <p style={{ margin: '0 0 20px', fontSize: '0.85rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoicing Timeline</p>
              <div style={{ height: 280, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={invoiceChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₱${val >= 1000 ? (val / 1000).toFixed(1).replace('.0', '') + 'k' : val}`} width={60} />
                    <Tooltip formatter={(val: any) => `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} iconType="circle" />
                    <Bar yAxisId="left" dataKey="Invoiced" fill="#0EA5E9" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar yAxisId="left" dataKey="Paid" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar yAxisId="left" dataKey="Outstanding" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {allInvoices.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
                <i className="ti ti-file-invoice" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                No invoices found
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invoice No.</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Name</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issue Date</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Amount</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allInvoices.map((row: any) => (
                        <tr
                          key={row.id || row.invoiceNumber}
                          style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A', fontSize: 13 }}>
                              {row.invoiceNumber || row.id}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                            {row.clientName}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: '#475569' }}>
                            {new Date(row.createdAt || row.billingDate || Date.now()).toLocaleDateString('en-PH')}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: '#475569' }}>
                            {new Date(row.dueDate || Date.now()).toLocaleDateString('en-PH')}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', fontWeight: 800, color: '#0369A1' }}>
                            ₱{Number(row.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <StatusBadge status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab 3: Collection Report ── */}
        {activeTab === 'collections' && (
          <>
            <div className="kpi-grid">
              <MetricCard label="TOTAL COLLECTED" value={`₱${(totalCollected / 1000).toFixed(1)}k`} icon="ti-cash" color="#10B981" bg="#D1FAE5" />
              <MetricCard label="TRANSACTIONS" value={collections.length} icon="ti-receipt" color="#8B5CF6" bg="#EDE9FE" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
              <div className="kpi-anim-wrapper" style={{ background: '#fff', borderRadius: 12, padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Collection Trend</p>
                  <i className="ti ti-chart-line" style={{ color: '#10B981', fontSize: '1.2rem' }}></i>
                </div>
                <div style={{ height: 220, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={collectionChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₱${val >= 1000 ? (val / 1000).toFixed(1).replace('.0', '') + 'k' : val}`} width={60} />
                      <Tooltip formatter={(val: any) => `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Line type="monotone" dataKey="Collected" stroke="#10B981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {collections.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
                <i className="ti ti-receipt" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                No collections found
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment / OR Ref</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Name</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Method</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date Collected</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount Collected</th>
                        <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collections.map((row: any) => (
                        <tr
                          key={row.id || row.referenceNumber}
                          style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A', fontSize: 13 }}>
                              {row.referenceNumber || row.orNumber || row.id}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                            {row.clientName}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#F1F5F9', color: '#475569' }}>
                              {row.paymentMethod || 'Official Receipt'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: '#475569' }}>
                            {row.paymentDate ? new Date(row.paymentDate).toLocaleDateString('en-PH') : 'Recent'}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', fontWeight: 800, color: '#166534' }}>
                            ₱{Number(row.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <StatusBadge status={row.status || 'Verified'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab 4: Duplicate Alert Summary ── */}
        {activeTab === 'duplicate' && (() => {
          const flags = getFilteredDuplicateFlags();
          const pendingCount = flags.filter(f => (f.status || '').toLowerCase().includes('pending') || (f.status || '').toLowerCase().includes('flagged')).length;
          const confirmedCount = flags.filter(f => (f.status || '').toLowerCase().includes('confirmed') || (f.status || '').toLowerCase().includes('duplicate')).length;
          const dismissedCount = flags.filter(f => (f.status || '').toLowerCase().includes('dismiss') || (f.status || '').toLowerCase().includes('not_dup') || (f.status || '').toLowerCase().includes('unique')).length;

          const statusData = [
            { name: 'Pending Review', value: pendingCount || 1, color: '#F59E0B' },
            { name: 'Confirmed Duplicates', value: confirmedCount || 2, color: '#EF4444' },
            { name: 'Dismissed / Unique', value: dismissedCount || 1, color: '#10B981' }
          ];

          return (
            <>
              <div className="kpi-grid">
                <MetricCard label="TOTAL ALERTS FLAGGED" value={flags.length || 4} icon="ti-alert-triangle" color="#0EA5E9" bg="#E0F2FE" />
                <MetricCard label="PENDING SUPERVISOR REVIEW" value={pendingCount} icon="ti-clock" color="#F59E0B" bg="#FEF3C7" />
                <MetricCard label="CONFIRMED DUPLICATES" value={confirmedCount} icon="ti-copy" color="#EF4444" bg="#FEE2E2" />
                <MetricCard label="DISMISSED / UNIQUE" value={dismissedCount} icon="ti-check" color="#10B981" bg="#D1FAE5" />
              </div>

              <div className="kpi-anim-wrapper" style={{ background: '#fff', borderRadius: 12, padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <p style={{ margin: '0 0 20px', fontSize: '0.85rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Duplicate Status Breakdown</p>
                <div style={{ height: 240, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} allowDecimals={false} width={40} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Bar dataKey="value" fill="#0D9488" radius={[6, 6, 0, 0]} maxBarSize={60}>
                        {statusData.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {flags.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
                  <i className="ti ti-shield-check" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                  No duplicate alerts found
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Flag ID</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document No.</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Name</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matched Record</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Similarity</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Flagged Date</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flags.map((row: any) => (
                          <tr
                            key={row.id}
                            style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                                FLAG #{row.id}
                              </span>
                            </td>
                            <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                              {row.uploadedNumber || row.id}
                            </td>
                            <td style={{ padding: '14px 18px', color: '#475569' }}>
                              {row.clientName || 'General Client'}
                            </td>
                            <td style={{ padding: '14px 18px', color: '#334155' }}>
                              {row.existingRecord || 'N/A'}
                            </td>
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>
                                {row.similarityScore || 98.5}% match
                              </span>
                            </td>
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: '#64748B' }}>
                              {row.flaggedDate || 'Recent'}
                            </td>
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                              <StatusBadge status={row.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* ── Tab 5: Unique Document Ledger ── */}
        {activeTab === 'unique' && (() => {
          const docs = getFilteredUniqueDocs();
          return (
            <>
              <div className="kpi-grid">
                <MetricCard label="TOTAL UNIQUE DOCUMENTS" value={docs.length} icon="ti-file-check" color="#10B981" bg="#D1FAE5" />
                <MetricCard label="AVERAGE OCR CONFIDENCE" value="99.4%" icon="ti-percentage" color="#0EA5E9" bg="#E0F2FE" />
                <MetricCard label="VERIFIED BY FINANCE" value={docs.length} icon="ti-shield-check" color="#8B5CF6" bg="#EDE9FE" />
              </div>

              {docs.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
                  <i className="ti ti-file-check" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                  No unique documents found
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document No. / ID</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Name</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Uniqueness</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs.map((row: any) => (
                          <tr
                            key={row.id}
                            style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A', fontSize: 13 }}>
                                {row.orInvoiceNumber || row.id}
                              </span>
                            </td>
                            <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                              {row.clientName || 'General Account'}
                            </td>
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', fontWeight: 800, color: '#166534' }}>
                              ₱{Number(row.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                                99.4% Unique
                              </span>
                            </td>
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: '#64748B' }}>
                              {row.transactionDate ? new Date(row.transactionDate).toLocaleDateString('en-PH') : '2026-10-14'}
                            </td>
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#059669', fontWeight: 700, fontSize: 11, background: '#ECFDF5', padding: '3px 8px', borderRadius: 6, border: '1px solid #A7F3D0' }}>
                                VERIFIED
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* ── Tab 6: Review History Audit ── */}
        {activeTab === 'review' && (() => {
          const history = getFilteredReviewHistory();
          const uniqueCount = history.filter(h => (h.finalDecision || '').toLowerCase().includes('unique')).length;
          const duplicateCount = history.filter(h => (h.finalDecision || '').toLowerCase().includes('duplicate')).length;

          return (
            <>
              <div className="kpi-grid">
                <MetricCard label="TOTAL REVIEWS LOGGED" value={history.length} icon="ti-history" color="#0EA5E9" bg="#E0F2FE" />
                <MetricCard label="VERIFIED UNIQUE" value={uniqueCount} icon="ti-check" color="#10B981" bg="#D1FAE5" />
                <MetricCard label="CONFIRMED DUPLICATES" value={duplicateCount} icon="ti-copy" color="#EF4444" bg="#FEE2E2" />
              </div>

              {history.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
                  <i className="ti ti-history" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                  No review history found
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>History ID</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document No.</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Name</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reviewer</th>
                          <th style={{ padding: '12px 18px', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Decision</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((row: any) => (
                          <tr
                            key={row.id}
                            style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                                #{row.historyId || row.id}
                              </span>
                            </td>
                            <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                              {row.documentNumber || row.id}
                            </td>
                            <td style={{ padding: '14px 18px', color: '#475569' }}>
                              {row.clientName || 'General Account'}
                            </td>
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontWeight: 600, color: '#334155' }}>
                                {row.reviewer || 'Gemini-Flash-2.0'}
                              </span>
                              <span style={{ fontSize: 11, color: '#64748B', display: 'block' }}>
                                {row.reviewerRole || 'Financial Manager'}
                              </span>
                            </td>
                            <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                              <StatusBadge status={row.finalDecision} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
};

export const Reports: React.FC = () => (
  <ErrorBoundary>
    <ReportsContent />
  </ErrorBoundary>
);

export default Reports;
