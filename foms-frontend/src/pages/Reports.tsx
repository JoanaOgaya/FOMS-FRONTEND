import React, { Component, ErrorInfo, useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { TableContainer } from '../components/TableContainer';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { ClientInfoCard } from '../components/ClientInfoCard';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, ComposedChart, Cell, AreaChart, Area } from 'recharts';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { invoicesService } from '../services/invoicesService';
import { clientsService } from '../services/clientsService';
import { arService } from '../services/arService';
import { paymentsService } from '../services/paymentsService';
import { liquidationsService } from '../services/liquidationsService';
import { auditLogsService } from '../services/auditLogsService';
import { duplicatesService, type DuplicateFlagItem, type UniqueDocumentItem, type ReviewHistoryItem } from '../services/duplicates.service';
import { Role } from '../types/auth';
import type { Invoice, Client, AccountsReceivableRecord, Payment, AuditLog, Liquidation } from '../types/entities';
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

  const roleStr = String(user?.role || '');
  const isAFM = roleStr === 'ASSISTANT_FM' || roleStr.toLowerCase().includes('assistant');

  const { data: invData } = useQuery('reports:invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: clientData } = useQuery('reports:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: arData } = useQuery('reports:ar', () => arService.records({ pageSize: 100 }));
  const { data: pmtData } = useQuery('reports:payments', () => paymentsService.list({ pageSize: 100 }));
  const { data: liqData } = useQuery('reports:liquidations', () => liquidationsService.list({ pageSize: 100 }));
  const { data: flagData } = useQuery('reports:duplicate-flags', () => duplicatesService.flagged({ pageSize: 100 }));
  const { data: uniqueData } = useQuery('reports:unique-docs', () => duplicatesService.uniqueDocuments({ pageSize: 100 }));
  const { data: historyData } = useQuery('reports:review-history', () => duplicatesService.reviewHistory({ pageSize: 100 }));

  const invoices: Invoice[] = invData?.items || [];
  const clients: Client[] = clientData?.items || [];
  const arRecords: AccountsReceivableRecord[] = arData?.items || [];
  const payments: Payment[] = pmtData?.items || [];
  const liquidations: Liquidation[] = liqData?.items || [];
  const duplicateFlags: DuplicateFlagItem[] = flagData?.items || [];
  const uniqueDocs: UniqueDocumentItem[] = uniqueData?.items || [];
  const reviewHistory: ReviewHistoryItem[] = historyData?.items || [];

  const addAuditLog = (data: Partial<AuditLog>) => {
    auditLogsService.create(data).catch(() => {});
  };

  const initialTab = searchParams.get('tab') || (isAFM ? 'liquidation' : 'aging');
  const initialLedger = initialTab === 'liquidation' ? 'Liquidation Summary' :
                        initialTab === 'invoices' ? 'Invoice Summary' :
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
  const [liqTrendMode, setLiqTrendMode] = useState<'timeline' | 'cumulative'>('timeline');
  const [showLiqExpense, setShowLiqExpense] = useState(true);
  const [showLiqReimburse, setShowLiqReimburse] = useState(true);
  const [showLiqLeftover, setShowLiqLeftover] = useState(false);

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
    setIsGenerated(true);

    if (compileLedgerType === 'Aging of Accounts') setReportType('aging');
    else if (compileLedgerType === 'Liquidation Summary') setReportType('liquidation');
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

  const getFilteredLiquidations = () => {
    return liquidations.filter((l: Liquidation) => {
      const d = (l.dateSubmitted || (l as any).createdAt || '').split('T')[0];
      if (d && dateFrom && dateTo && compileDateRange !== 'All Time') {
        if (d < dateFrom || d > dateTo) return false;
      }
      if (activeSearch) {
        const term = activeSearch.toLowerCase();
        const ref = (l.reference || l.referenceNumber || l.id || '').toLowerCase();
        const sub = (l.submittedBy || (l as any).submittedByName || '').toLowerCase();
        if (!ref.includes(term) && !sub.includes(term)) return false;
      }
      if (compileStatus && compileStatus !== 'All Statuses') {
        const s = (l.status || '').toLowerCase();
        if (!s.includes(compileStatus.toLowerCase())) return false;
      }
      return true;
    });
  };

  const liquidationColumns = [
    { key: 'reference', label: 'REFERENCE NO.', sortable: true, render: (row: any) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.reference || row.referenceNumber || row.id}</span> },
    { key: 'submittedBy', label: 'SUBMITTED BY', sortable: true, render: (row: any) => <span style={{ color: '#0F172A', fontWeight: 700 }}>{row.submittedBy || (row as any).submittedByName}</span> },
    { key: 'dateSubmitted', label: 'DATE SUBMITTED', render: (row: any) => row.dateSubmitted ? new Date(row.dateSubmitted).toLocaleDateString('en-PH') : 'N/A' },
    { key: 'amount', label: 'TOTAL EXPENSE', render: (row: any) => <span style={{ fontWeight: 800 }}>₱{Number(row.amount || (row as any).totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span> },
    { key: 'reimbursementAmount', label: 'REIMBURSEMENT', render: (row: any) => <span>₱{Number(row.reimbursementAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span> },
    { key: 'status', label: 'STATUS', render: (row: any) => <StatusBadge status={row.status} /> }
  ];

  // --- Aging Tab Data ---
  let agingRecords: any[] = [];
  if (selectedClientId) {
    agingRecords = getFilteredAR().filter((ar: AccountsReceivableRecord) => ar.clientId === selectedClientId).map((ar: AccountsReceivableRecord) => {
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
    const base = selectedClientId
      ? getFilteredAR().filter((r: AccountsReceivableRecord) => r.clientId === selectedClientId)
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
  if (selectedClientId) {
    allInvoices = getFilteredInvoices().filter((i: Invoice) => i.clientId === selectedClientId).map((i: Invoice) => {
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
    } else if (activeTab === 'liquidation') {
      const liqs = getFilteredLiquidations();
      dataToExport = liqs.map(l => [
        l.reference || l.referenceNumber || l.id,
        l.submittedBy || (l as any).submittedByName || 'N/A',
        l.dateSubmitted ? new Date(l.dateSubmitted).toLocaleDateString('en-PH') : 'N/A',
        l.amount || (l as any).totalAmount || 0,
        l.reimbursementAmount || 0,
        l.status || 'Pending Validation'
      ]);
      headers = ['REFERENCE NO.', 'SUBMITTED BY', 'DATE SUBMITTED', 'TOTAL EXPENSE', 'REIMBURSEMENT', 'STATUS'];
      filename = `liquidation_summary_${new Date().toISOString().split('T')[0]}.csv`;
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
    } else if (activeTab === 'liquidation') {
      const liqs = getFilteredLiquidations();
      headers = [['Reference No.', 'Submitted By', 'Date Submitted', 'Total Expense', 'Reimbursement', 'Status']];
      bodyData = liqs.map(l => [
        l.reference || l.referenceNumber || l.id,
        l.submittedBy || (l as any).submittedByName || 'N/A',
        l.dateSubmitted ? new Date(l.dateSubmitted).toLocaleDateString('en-PH') : 'N/A',
        `PHP ${Number(l.amount || (l as any).totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `PHP ${Number(l.reimbursementAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        l.status || 'Pending Validation'
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

  const MetricCard = ({ label, value, icon, color, bg }: any) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', lineHeight: 1.2, maxWidth: '70%' }}>{label}</div>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className={`ti ${icon}`} style={{ fontSize: '1.1rem' }}></i>
        </div>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>{value}</div>
    </div>
  );

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '14px 24px', borderBottom: '1px solid #F1F5F9' }}>
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
                  else if (val === 'Liquidation Summary') setReportType('liquidation');
                  else if (val === 'Invoice Summary') setReportType('invoices');
                  else if (val === 'Collection Summary') setReportType('collections');
                  else if (val === 'Unique Document Ledger') setReportType('unique');
                  else if (val === 'Review History Audit') setReportType('review');
                  else setReportType('duplicate');
                }}
                style={{ width: '100%', appearance: 'none', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 32px 9px 12px', fontSize: '0.85rem', color: '#0F172A', cursor: 'pointer', outline: 'none' }}
              >
                {(roleStr === Role.FINANCIAL_MANAGER || isAFM) && (
                  <optgroup label="── Liquidation Reports ──">
                    <option value="Liquidation Summary">Liquidation Summary</option>
                  </optgroup>
                )}
                {(roleStr === Role.FINANCIAL_MANAGER || roleStr === Role.HEAD_ACCOUNTANT || roleStr === Role.ACCOUNTANT) && (
                  <optgroup label="── Financial Reports ──">
                    <option value="Aging of Accounts">Aging of Accounts</option>
                    <option value="Invoice Summary">Invoice Summary</option>
                    <option value="Collection Summary">Collection Summary</option>
                  </optgroup>
                )}
                {(roleStr === Role.FINANCIAL_MANAGER || roleStr === Role.HEAD_ACCOUNTANT || isAFM) && (
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
        {selectedClientId && clients.find((c: Client) => c.id === selectedClientId) && (
          <div style={{ marginBottom: -8 }}>
            <ClientInfoCard client={clients.find((c: Client) => c.id === selectedClientId)!} />
          </div>
        )}

        {/* Dynamic Report Header */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OFFICIAL FOMS REPORT</p>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0F172A' }}>
            {compileLedgerType}
          </h2>
        </div>

        {/* ── Tab: Liquidation Summary ── */}
        {activeTab === 'liquidation' && (() => {
          const liqs = getFilteredLiquidations();
          const totalExpense = liqs.reduce((acc, l) => acc + (l.amount || (l as any).totalAmount || 0), 0);
          const totalReimburse = liqs.reduce((acc, l) => acc + (l.reimbursementAmount || 0), 0);
          const validatedCount = liqs.filter(l => l.status === 'Validated' || l.status === 'Endorsed').length;
          const pendingCount = liqs.filter(l => l.status === 'Pending Validation' || l.status === 'Pending Review').length;

          // Sort liquidations chronologically by submission / creation date
          const sortedLiqs = [...liqs].sort((a: any, b: any) => {
            const da = new Date(a.dateSubmitted || a.submittedAt || a.createdAt || 0).getTime();
            const db = new Date(b.dateSubmitted || b.submittedAt || b.createdAt || 0).getTime();
            return da - db;
          });

          // Aggregate by Date (Day / Time progression)
          const dateMap: Record<string, { date: string; displayDate: string; fullDate: string; Expense: number; Reimbursement: number; Leftover: number; count: number; refs: string[] }> = {};

          sortedLiqs.forEach((item: any) => {
            const rawDate = item.dateSubmitted || item.submittedAt || item.createdAt;
            const d = rawDate ? new Date(rawDate) : new Date();
            const key = d.toISOString().split('T')[0];
            const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const fullDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

            if (!dateMap[key]) {
              dateMap[key] = {
                date: key,
                displayDate,
                fullDate,
                Expense: 0,
                Reimbursement: 0,
                Leftover: 0,
                count: 0,
                refs: []
              };
            }
            const amt = Number(item.amount || (item as any).totalAmount || 0);
            const reimb = Number(item.reimbursementAmount || 0);
            const left = Number(item.leftoverCash || 0);
            dateMap[key].Expense += amt;
            dateMap[key].Reimbursement += reimb;
            dateMap[key].Leftover += left;
            dateMap[key].count += 1;
            const ref = item.referenceNumber || item.reference;
            if (ref && !dateMap[key].refs.includes(ref)) {
              dateMap[key].refs.push(ref);
            }
          });

          const rawTimeline = Object.values(dateMap);
          let cumulativeExpense = 0;
          let cumulativeReimburse = 0;

          const trendData = rawTimeline.map(pt => {
            cumulativeExpense += pt.Expense;
            cumulativeReimburse += pt.Reimbursement;
            return {
              ...pt,
              CumulativeExpense: cumulativeExpense,
              CumulativeReimburse: cumulativeReimburse,
            };
          });

          // If only 1 date exists, prepend a baseline date point with 0 so a trend line can always be drawn smoothly
          const chartPoints = trendData.length === 1 ? [
            {
              date: 'start',
              displayDate: 'Baseline',
              fullDate: 'Baseline Period',
              Expense: 0,
              Reimbursement: 0,
              Leftover: 0,
              CumulativeExpense: 0,
              CumulativeReimburse: 0,
              count: 0,
              refs: []
            },
            ...trendData
          ] : trendData;

          const maxExpense = Math.max(...trendData.map(d => d.Expense), 0);
          const avgDailyExpense = trendData.length > 0 ? (totalExpense / trendData.length) : 0;

          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <MetricCard label="TOTAL LIQUIDATIONS" value={liqs.length} icon="ti-file-text" color="#0EA5E9" bg="#E0F2FE" />
                <MetricCard label="VALIDATED / ENDORSED" value={validatedCount} icon="ti-circle-check" color="#10B981" bg="#D1FAE5" />
                <MetricCard label="PENDING VALIDATION" value={pendingCount} icon="ti-clock" color="#F59E0B" bg="#FEF3C7" />
                <MetricCard label="TOTAL EXPENSE" value={`₱${totalExpense.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} icon="ti-cash" color="#8B5CF6" bg="#EDE9FE" />
              </div>

              {trendData.length > 0 && (
                <div className="kpi-anim-wrapper" style={{ background: '#fff', borderRadius: 12, padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="ti ti-chart-line" style={{ color: '#0D9488', fontSize: '1.2rem' }}></i>
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.3px' }}>
                            Liquidation Expense Trend Over Time
                          </h3>
                          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                            {liqTrendMode === 'timeline'
                              ? 'Daily timeline progression of courier expenses, leftover cash, and reimbursements'
                              : 'Cumulative spend accumulation across submitted liquidation batches'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                      {/* Metric Badges */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#F8FAFC', padding: '4px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: '0.78rem' }}>
                        <span style={{ color: '#64748B' }}>Peak Day:</span>
                        <strong style={{ color: '#0F172A' }}>₱{maxExpense.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                        <span style={{ color: '#CBD5E1' }}>|</span>
                        <span style={{ color: '#64748B' }}>Daily Avg:</span>
                        <strong style={{ color: '#0D9488' }}>₱{avgDailyExpense.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                      </div>

                      {/* Mode Switcher */}
                      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', padding: '3px', borderRadius: 8 }}>
                        <button
                          type="button"
                          onClick={() => setLiqTrendMode('timeline')}
                          style={{
                            padding: '5px 12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            borderRadius: 6,
                            border: 'none',
                            cursor: 'pointer',
                            background: liqTrendMode === 'timeline' ? '#fff' : 'transparent',
                            color: liqTrendMode === 'timeline' ? '#0F172A' : '#64748B',
                            boxShadow: liqTrendMode === 'timeline' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          Daily Progression
                        </button>
                        <button
                          type="button"
                          onClick={() => setLiqTrendMode('cumulative')}
                          style={{
                            padding: '5px 12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            borderRadius: 6,
                            border: 'none',
                            cursor: 'pointer',
                            background: liqTrendMode === 'cumulative' ? '#fff' : 'transparent',
                            color: liqTrendMode === 'cumulative' ? '#0F172A' : '#64748B',
                            boxShadow: liqTrendMode === 'cumulative' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          Cumulative Total
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 280, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartPoints} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="liqExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0D9488" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="liqReimburseGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="liqCumulGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="liqLeftoverGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis
                          dataKey="displayDate"
                          stroke="#94A3B8"
                          fontSize={12}
                          tickLine={false}
                          dy={6}
                        />
                        <YAxis
                          stroke="#94A3B8"
                          fontSize={12}
                          tickLine={false}
                          tickFormatter={v => `₱${v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k` : v}`}
                          width={60}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const item = payload[0].payload;
                            return (
                              <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', minWidth: 200 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
                                  {item.fullDate || item.displayDate}
                                </div>
                                {item.refs && item.refs.length > 0 && (
                                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {item.refs.map((r: string) => (
                                      <span key={r} style={{ background: '#F1F5F9', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>{r}</span>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0D9488' }} />
                                      {liqTrendMode === 'timeline' ? 'Daily Expense:' : 'Cumulative Expense:'}
                                    </span>
                                    <strong style={{ color: '#0F172A' }}>
                                      ₱{(liqTrendMode === 'timeline' ? item.Expense : item.CumulativeExpense).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                    </strong>
                                  </div>
                                  {item.Reimbursement > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                      <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                                        Reimbursement:
                                      </span>
                                      <strong style={{ color: '#D97706' }}>
                                        ₱{item.Reimbursement.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                      </strong>
                                    </div>
                                  )}
                                  {item.Leftover > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                      <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />
                                        Leftover Cash:
                                      </span>
                                      <strong style={{ color: '#2563EB' }}>
                                        ₱{item.Leftover.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                      </strong>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }}
                        />
                        {liqTrendMode === 'timeline' ? (
                          <>
                            {showLiqExpense && (
                              <Area
                                type="monotone"
                                dataKey="Expense"
                                stroke="#0D9488"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#liqExpenseGrad)"
                                activeDot={{ r: 7, fill: '#0D9488', stroke: '#fff', strokeWidth: 2 }}
                                dot={{ r: 4, fill: '#0D9488', stroke: '#fff', strokeWidth: 2 }}
                                name="Expense Amount"
                              />
                            )}
                            {showLiqReimburse && (
                              <Area
                                type="monotone"
                                dataKey="Reimbursement"
                                stroke="#F59E0B"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#liqReimburseGrad)"
                                activeDot={{ r: 6, fill: '#F59E0B', stroke: '#fff', strokeWidth: 2 }}
                                dot={{ r: 3.5, fill: '#F59E0B', stroke: '#fff', strokeWidth: 2 }}
                                name="Reimbursement"
                              />
                            )}
                            {showLiqLeftover && (
                              <Area
                                type="monotone"
                                dataKey="Leftover"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#liqLeftoverGrad)"
                                activeDot={{ r: 5, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
                                dot={{ r: 3, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
                                name="Leftover Cash"
                              />
                            )}
                          </>
                        ) : (
                          <>
                            <Area
                              type="monotone"
                              dataKey="CumulativeExpense"
                              stroke="#6366F1"
                              strokeWidth={3}
                              fillOpacity={1}
                              fill="url(#liqCumulGrad)"
                              activeDot={{ r: 7, fill: '#6366F1', stroke: '#fff', strokeWidth: 2 }}
                              dot={{ r: 4, fill: '#6366F1', stroke: '#fff', strokeWidth: 2 }}
                              name="Cumulative Total"
                            />
                            {showLiqReimburse && (
                              <Area
                                type="monotone"
                                dataKey="CumulativeReimburse"
                                stroke="#F59E0B"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#liqReimburseGrad)"
                                activeDot={{ r: 5, fill: '#F59E0B', stroke: '#fff', strokeWidth: 2 }}
                                dot={{ r: 3, fill: '#F59E0B', stroke: '#fff', strokeWidth: 2 }}
                                name="Cumulative Reimbursement"
                              />
                            )}
                          </>
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Interactive Legend */}
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, paddingTop: 14, borderTop: '1px solid #F1F5F9', marginTop: 12 }}>
                    {liqTrendMode === 'timeline' ? (
                      <>
                        <div
                          onClick={() => setShowLiqExpense(!showLiqExpense)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', opacity: showLiqExpense ? 1 : 0.4, transition: 'opacity 0.2s' }}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0D9488' }} />
                          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Expense Amount</span>
                        </div>
                        <div
                          onClick={() => setShowLiqReimburse(!showLiqReimburse)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', opacity: showLiqReimburse ? 1 : 0.4, transition: 'opacity 0.2s' }}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }} />
                          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Reimbursement</span>
                        </div>
                        <div
                          onClick={() => setShowLiqLeftover(!showLiqLeftover)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', opacity: showLiqLeftover ? 1 : 0.4, transition: 'opacity 0.2s' }}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3B82F6' }} />
                          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Leftover Cash</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366F1' }} />
                          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Cumulative Expense</span>
                        </div>
                        <div
                          onClick={() => setShowLiqReimburse(!showLiqReimburse)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', opacity: showLiqReimburse ? 1 : 0.4, transition: 'opacity 0.2s' }}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }} />
                          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Cumulative Reimbursement</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <TableContainer>
                <DataTable
                  data={liqs}
                  columns={liquidationColumns}
                  rowKey="id"
                  exportable={false}
                  hideSearch={true}
                />
              </TableContainer>
            </>
          );
        })()}

        {/* ── Tab 1: Aging of Accounts ── */}
        {activeTab === 'aging' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {['0-30 days', '31-60 days', '61-90 days', '90+ days'].map(bracket => {
                const data = getAgingBracketData(bracket);
                const { color, bg } = BRACKET_COLORS[bracket];
                return (
                  <MetricCard key={bracket} label={bracket + ' OUTSTANDING'} value={data.count} icon="ti-clock" color={color} bg={bg} />
                );
              })}
            </div>

            <TableContainer>
              <DataTable
                data={agingRecords}
                columns={agingColumns}
                rowKey="id"
                exportable={false}
                hideSearch={true}
              />
            </TableContainer>
          </>
        )}

        {/* ── Tab 2: Invoice Summary ── */}
        {activeTab === 'invoices' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
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

            <TableContainer>
              <DataTable
                data={allInvoices}
                columns={invoiceColumns}
                rowKey="id"
                exportable={false}
                hideSearch={true}
              />
            </TableContainer>
          </>
        )}

        {/* ── Tab 3: Collection Report ── */}
        {activeTab === 'collections' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
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

            <TableContainer>
              <DataTable
                data={collections}
                columns={collectionColumns}
                rowKey="id"
                exportable={false}
                hideSearch={true}
              />
            </TableContainer>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
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

              <TableContainer>
                <DataTable
                  data={flags}
                  columns={duplicateColumns}
                  rowKey="id"
                  exportable={false}
                  hideSearch={true}
                />
              </TableContainer>
            </>
          );
        })()}

        {/* ── Tab 5: Unique Document Ledger ── */}
        {activeTab === 'unique' && (() => {
          const docs = getFilteredUniqueDocs();
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <MetricCard label="TOTAL UNIQUE DOCUMENTS" value={docs.length} icon="ti-file-check" color="#10B981" bg="#D1FAE5" />
                <MetricCard label="AVERAGE OCR CONFIDENCE" value="99.4%" icon="ti-percentage" color="#0EA5E9" bg="#E0F2FE" />
                <MetricCard label="VERIFIED BY FINANCE" value={docs.length} icon="ti-shield-check" color="#8B5CF6" bg="#EDE9FE" />
              </div>

              <TableContainer>
                <DataTable
                  data={docs}
                  columns={uniqueColumns}
                  rowKey="id"
                  exportable={false}
                  hideSearch={true}
                />
              </TableContainer>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <MetricCard label="TOTAL REVIEWS LOGGED" value={history.length} icon="ti-history" color="#0EA5E9" bg="#E0F2FE" />
                <MetricCard label="VERIFIED UNIQUE" value={uniqueCount} icon="ti-check" color="#10B981" bg="#D1FAE5" />
                <MetricCard label="CONFIRMED DUPLICATES" value={duplicateCount} icon="ti-copy" color="#EF4444" bg="#FEE2E2" />
              </div>

              <TableContainer>
                <DataTable
                  data={history}
                  columns={reviewHistoryColumns}
                  rowKey="id"
                  exportable={false}
                  hideSearch={true}
                />
              </TableContainer>
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
