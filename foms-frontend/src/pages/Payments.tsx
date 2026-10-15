import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, CheckCircle, Clock, AlertTriangle, X, Search, Camera, ZoomIn, ZoomOut, Info } from 'lucide-react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { KpiCard } from '../components/shared/KpiCard';
import { Button } from '../components/Buttons';
import { Card } from '../components/Card';
import { CalendarPicker } from '../components/FormModals';
import { TableContainer } from '../components/TableContainer';
import { RecordHistoryModal } from '../components/RecordHistoryModal';
import { ClientInfoCard } from '../components/ClientInfoCard';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { useQuery } from '../hooks/useQuery';
import { paymentsService } from '../services/paymentsService';
import { invoicesService } from '../services/invoicesService';
import { clientsService } from '../services/clientsService';
import { waybillsService } from '../services/waybillsService';
import { speedpayService } from '../services/speedpayService';
import { cashFlowService } from '../services/cashFlowService';
import { auditLogsService } from '../services/auditLogsService';
import { duplicatesService } from '../services/duplicates.service';
import { invalidateForMutation } from '../services/invalidation';
import type { Payment, AuditLog, Invoice, Client, SpeedPaySubmission, Waybill, CashFlowRecord, Receipt } from '../types/entities';

const getEmployeeName = (id?: string, def?: string) => {
  return def || id || 'System';
};

const safeFormatDate = (dateVal: string | Date | undefined | null, options?: Intl.DateTimeFormatOptions) => {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', options || { month: 'short', day: 'numeric', year: 'numeric' });
};

class PaymentsErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#FEF2F2', color: '#991B1B', borderRadius: '12px', margin: '20px', border: '1px solid #FCA5A5' }}>
          <h2 style={{ marginTop: 0 }}>Payments Dashboard Encountered an Error</h2>
          <p>Please take a screenshot of this error so the developer can fix it.</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#FEE2E2', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontSize: '13px', fontFamily: 'monospace' }}>
            {this.state.error && this.state.error.toString()}
            {'\n\n'}
            {this.state.error && this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const PaymentsContent: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { id: clientIdParam } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const actionParam = searchParams.get('action') || 'view';
  const paymentIdParam = searchParams.get('paymentId');

  const isFinanceManager = user?.role === 'FINANCIAL_MANAGER';
  const isAssistant = user?.role === 'ASSISTANT_FM';
  const isHeadAccountant = user?.role === 'HEAD_ACCOUNTANT';
  const isAccountant = user?.role === 'ACCOUNTANT';

  const [showForm, setShowForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('Approve & Mark as Deposited');
  const [approvalStatus, setApprovalStatus] = useState<'Approve' | 'Return for Review'>('Approve');
  const [rejectionReason, setRejectionReason] = useState('');
  const [globalFilter, setGlobalFilter] = useState<'all' | 'inflow' | 'outflow'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // --- Expense state (local) ---
  const [expenses, setExpenses] = useState<Array<{
    id: string; description: string; amount: number; category: string;
    date: string; referenceNo: string; recordedBy: string;
  }>>([]);
  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', category: 'Office Supplies', date: '', referenceNo: '',
  });

  // --- Filters state ---
  const [filterType, setFilterType] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [cashFlowSearch, setCashFlowSearch] = useState<string>('');
  const [clientSearch, setClientSearch] = useState<string>('');
  const [clientFilterFlow, setClientFilterFlow] = useState<string>('All');
  const [clientFilterStatus, setClientFilterStatus] = useState<string>('All');

  const [form, setForm] = useState({
    invoiceId: '', invoiceNo: '', companyName: '', firstName: '', lastName: '', amount: '', paymentMethod: 'Bank Transfer', referenceNumber: '', bankConfirmed: false, notes: '', datePaid: '',
  });
  const [issueOrForm, setIssueOrForm] = useState({ orNumber: '', orDate: new Date().toISOString().split('T')[0] });
  const [refForm, setRefForm] = useState({ referenceNumber: '', depositSlipDetails: '', bankTransferDetails: '', onlinePaymentDetails: '', orNumber: '' });
  const [isEditingRef, setIsEditingRef] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<any | null>(null);
  const [showProofModal, setShowProofModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  // --- AI Scan States ---
  const [dragActive, setDragActive] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
  const [fullScreenPreview, setFullScreenPreview] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [checkingStep, setCheckingStep] = useState(0);
  const [checkingProgress, setCheckingProgress] = useState(0);
  const [scanResultMode, setScanResultMode] = useState<'NONE' | 'INVALID' | 'DUPLICATE' | 'CLEAR'>('NONE');
  const [ocrWarning, setOcrWarning] = useState('');
  const [similarityScore, setSimilarityScore] = useState(0);
  const [matchedRecordDetails, setMatchedRecordDetails] = useState<any>(null);

  // --- Manual Review States ---
  const [showManualReviewPanel, setShowManualReviewPanel] = useState(false);
  const [manualReviewDecision, setManualReviewDecision] = useState<any>('Mark as Duplicate');
  const [duplicateHandling, setDuplicateHandling] = useState('Flag and Block New Submission');
  const [uniqueReason, setUniqueReason] = useState('Different transaction');
  const [duplicateReason, setDuplicateReason] = useState('Same OR number');
  const [manualNote, setManualNote] = useState('');

  const getCellMatchStyle = (field: string, uploaded: string, existing: string) => {
    if (!existing) return { text: 'Missing', style: { fontStyle: 'italic', color: '#64748B', fontSize: '13px' } };
    if (!uploaded) return { text: 'Missing', style: { fontStyle: 'italic', color: '#64748B', fontSize: '13px' } };
    if (uploaded.trim().toLowerCase() === existing.trim().toLowerCase()) {
      return { text: 'Exact Match', style: { background: '#FEE2E2', color: '#B91C1C', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' } };
    }
    return { text: 'Mismatch', style: { background: '#F1F5F9', color: '#475569', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' } };
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const processSelectedFile = async (file: File) => {
    setUploadFile(file);
    setPreviewDocUrl(URL.createObjectURL(file));
    setCheckingStep(1);
    setCheckingProgress(25);
    setScanResultMode('NONE');

    try {
      setCheckingStep(2);
      setCheckingProgress(60);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document', file);

      // 1. Validation Gate
      let validation: any = null;
      try {
        validation = await duplicatesService.validate(formData);
      } catch (valErr: any) {
        if (valErr?.status === 422 || valErr?.data?.status === 'INVALID_DOCUMENT' || valErr?.data?.isAllowed === false) {
          setCheckingStep(0);
          setCheckingProgress(100);
          setScanResultMode('INVALID');
          setOcrWarning(valErr?.data?.message || 'Only official receipts, invoices, billing statements, or payment-related finance documents are allowed. Please upload a valid FOMS financial document.');
          toast.error('Invalid file content. Please upload an official receipt or invoice only.', 'Invalid Document Uploaded');
          return;
        }
      }

      if (validation && (!validation.isAllowed || validation.status === 'INVALID_DOCUMENT')) {
        setCheckingStep(0);
        setCheckingProgress(100);
        setScanResultMode('INVALID');
        setOcrWarning(validation.message || 'Only official receipts, invoices, billing statements, or payment-related finance documents are allowed. Please upload a valid FOMS financial document.');
        toast.error('Invalid file content. Please upload an official receipt or invoice only.', 'Invalid Document Uploaded');
        return;
      }

      // 2. Duplicate Detection (Only runs for valid financial documents)
      const res = await duplicatesService.scan(formData) as any;
      setCheckingStep(0);
      setCheckingProgress(100);

      if (res?.isDuplicate) {
        setScanResultMode('DUPLICATE');
        setSimilarityScore(res.similarityScore || 95);
        setMatchedRecordDetails(res.matchedRecord || null);
        toast.warning('Duplicate detected. Review required.', 'AI Scan');
      } else {
        setScanResultMode('CLEAR');
      }
    } catch (err: any) {
      setCheckingStep(0);
      setCheckingProgress(100);
      if (err?.status === 422 || err?.data?.status === 'INVALID_DOCUMENT') {
        setScanResultMode('INVALID');
        setOcrWarning(err?.data?.message || 'Only official receipts, invoices, billing statements, or payment-related finance documents are allowed.');
        toast.error('Invalid file content. Please upload an official receipt or invoice only.', 'Invalid Document Uploaded');
      } else {
        setScanResultMode('CLEAR');
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const resetUpload = () => {
    setUploadFile(null);
    setPreviewDocUrl(null);
    setScanResultMode('NONE');
    setCheckingStep(0);
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.description || !expenseForm.amount || !expenseForm.date) return;
    try {
      const parsedAmount = parseFloat(expenseForm.amount);
      await cashFlowService.create({
        type: 'Outflow',
        amount: parsedAmount,
        sourceReference: `${expenseForm.category}: ${expenseForm.description}`,
        date: expenseForm.date,
        recordedBy: user?.fullName || 'Finance Team',
      });
      await invalidateForMutation('recordCashFlow');
      setExpenseForm({ description: '', amount: '', category: 'Office Supplies', date: '', referenceNo: '' });
      setShowExpenseForm(false);
      toast.success(`Expense "${expenseForm.description}" recorded — ₱${parsedAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 'Expense Recorded');
    } catch {
      toast.error('Failed to record expense.');
    }
  };

  const { data: paymentsData, refetch: refreshPayments } = useQuery('payments', () => paymentsService.list({ pageSize: 100 }));
  const { data: invoicesData, refetch: refreshInvoices } = useQuery('invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: waybillsData } = useQuery('waybills', () => waybillsService.list({ pageSize: 100 }));
  const { data: speedPayData } = useQuery('speedPay', () => speedpayService.list({ pageSize: 100 }));
  const { data: clientsData } = useQuery('clients', () => clientsService.list({ pageSize: 100 }));
  const { data: receiptsData, refetch: refreshReceipts } = useQuery('receipts', () => paymentsService.receipts.list({ pageSize: 100 }));
  const { data: cashFlowData } = useQuery('cashFlow', () => cashFlowService.list({ pageSize: 100 }));

  const payments: Payment[] = paymentsData?.items || [];
  const invoices: Invoice[] = invoicesData?.items || [];
  const waybills: Waybill[] = waybillsData?.items || [];
  const speedPay: SpeedPaySubmission[] = speedPayData?.items || [];
  const clients: Client[] = clientsData?.items || [];
  const receipts: Receipt[] = receiptsData?.items || [];
  const cashFlowRecords: CashFlowRecord[] = cashFlowData?.items || [];

  const updatePayment = async (id: string, data: Partial<Payment>) => {
    await paymentsService.update(id, data);
    if (data.status === 'Approved' || data.status === 'Validated') {
      await invalidateForMutation('approvePayment');
    } else if (data.status === 'Rejected') {
      await invalidateForMutation('rejectPayment');
    } else {
      await invalidateForMutation('recordPayment');
    }
  };
  const addPayment = async (data: Partial<Payment>) => {
    await paymentsService.create(data);
    await invalidateForMutation('recordPayment');
  };
  const updateInvoice = async (id: string, data: Partial<Invoice>) => {
    await invoicesService.update(id, data);
    await invalidateForMutation('approveInvoice');
  };
  const addReceipt = async (data: Partial<Receipt>) => {
    await paymentsService.receipts.create(data);
    await invalidateForMutation('recordPayment');
  };
  const addAuditLog = (data: Partial<AuditLog>) => {
    auditLogsService.create(data).catch(() => {});
  };
  const addCashFlowRecord = (data: Partial<CashFlowRecord>) => {
    cashFlowService.create(data).catch(() => {});
  };

  const allowedPayments = payments;

  const filteredPayments = clientIdParam ? allowedPayments.filter((p: Payment) => p.clientId === clientIdParam) : allowedPayments;

  const totalVerified = useMemo(() => filteredPayments.filter((p: Payment) => p.status === 'Validated' || p.status === 'Approved').reduce((s: number, p: Payment) => s + p.amount, 0), [filteredPayments]);
  const filteredSpeedPay = clientIdParam ? speedPay.filter((s: SpeedPaySubmission) => {
    const invoice = invoices.find((i: Invoice) => i.id === s.invoiceId);
    return invoice?.clientId === clientIdParam;
  }) : speedPay;
  const pendingSpeedPay = filteredSpeedPay.filter((s: SpeedPaySubmission) => s.status === 'Pending Validation').length;
  const pendingFinal = useMemo(() => filteredPayments.filter((p: Payment) => p.status === 'Validated').length, [filteredPayments]);
  const checkCount = useMemo(() => filteredPayments.filter((p: Payment) => p.paymentMethod === 'Check').length, [filteredPayments]);
  const obtCount = useMemo(() => filteredPayments.filter((p: Payment) => p.paymentMethod === 'Online Bank Transfer').length, [filteredPayments]);

  const unpaidInvoices = invoices.filter((i: Invoice) => ['Sent', 'Overdue'].includes(i.status));

  let enriched: any[] = [];
  if (clientIdParam) {
    const pmtRows = allowedPayments.filter((p: Payment) => p.clientId === clientIdParam).map((p: Payment) => {
      const client = clients.find((c: Client) => c.id === p.clientId);
      const invoice = invoices.find((i: Invoice) => i.id === p.invoiceId);
      return { ...p, clientName: client?.name ?? 'Unknown', invoiceNumber: invoice?.invoiceNumber ?? p.invoiceId };
    });
    const spRows = speedPay
      .filter((s: SpeedPaySubmission) => {
        const targetClientId = (s as any).clientId || invoices.find((i: Invoice) => i.id === s.invoiceId)?.clientId;
        return targetClientId === clientIdParam;
      })
      .map((s: SpeedPaySubmission) => {
        const client = clients.find((c: Client) => c.id === clientIdParam);
        const invoice = invoices.find((i: Invoice) => i.id === s.invoiceId);
        const cleanId = s.id.startsWith('SP-') ? s.id : `SP-${s.id}`;
        return {
          id: cleanId,
          clientId: clientIdParam,
          clientName: client?.name ?? s.clientName ?? 'Unknown',
          invoiceId: s.invoiceId,
          invoiceNumber: s.invoiceNumber ?? invoice?.invoiceNumber ?? s.invoiceId,
          amount: s.amountPaid,
          paymentMethod: s.paymentMethod,
          referenceNumber: s.referenceNumber,
          recordedAt: s.submittedAt,
          status: s.status,
          recordedBy: 'Client (SpeedPay)',
          proofOfPaymentUrl: s.proofFileUrl,
          flow: 'inflow',
        };
      });
    enriched = [...pmtRows, ...spRows];
  } else {
    enriched = allowedPayments.map((p: Payment) => {
      const client = clients.find((c: Client) => c.id === p.clientId);
      const invoice = invoices.find((i: Invoice) => i.id === p.invoiceId);
      return {
        ...p,
        clientName: client?.name ?? 'Unknown',
        invoiceNumber: invoice?.invoiceNumber ?? p.invoiceId,
        isGrouped: false
      };
    });
  }

  const columns = [
    { key: 'id', label: 'PAYMENT ID' },
    {
      key: 'clientName', label: 'CLIENT NAME', sortable: true, render: (row: any) => (
        !clientIdParam ? (
          <span onClick={() => navigate(`/payments/${row.id}`)} style={{ color: '#0F172A', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>
            {row.clientName}
          </span>
        ) : (
          <span style={{ fontWeight: 600 }}>{row.clientName}</span>
        )
      )
    },
    {
      key: 'invoiceNumber', label: 'LINKED INVOICE NO.', render: (row: any) => (
        <span onClick={() => navigate(`/invoicing-desk/${row.invoiceId}`)} style={{ color: '#2563EB', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
          {row.invoiceNumber}
        </span>
      )
    },
    { key: 'paymentMethod', label: 'PAYMENT MODE' },
    { key: 'referenceNumber', label: 'REFERENCE / CHECK NO.' },
    { key: 'amount', label: 'AMOUNT PAID', render: (row: any) => `₱${Number(row.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` },
    { key: 'recordedAt', label: 'PAYMENT DATE', render: (row: any) => safeFormatDate(row.recordedAt) },
    {
      key: 'status', label: 'VERIFICATION STATUS', render: (row: any) => {
        let displayStatus = row.status;
        if (displayStatus === 'Pending Validation') displayStatus = 'Pending Verification';
        if (displayStatus === 'Validated') displayStatus = 'Verified & Deposited';
        return <StatusBadge status={displayStatus} />;
      }
    },
  ];

  const fmActions = [
    {
      label: 'Final Approve',
      icon: 'ti-shield-check',
      onClick: (row: any) => {
        navigate(`/payments/${clientIdParam || row.clientId}?paymentId=${row.paymentId || row.id}&action=view`);
      },
      hidden: (row: any) => row.status !== 'Validated',
    },
    {
      label: 'View Receipt',
      icon: 'ti-receipt',
      onClick: (row: any) => navigate(`/payments/${clientIdParam || row.clientId}?paymentId=${row.paymentId || row.id}&action=receipt`),
      hidden: (row: any) => row.status !== 'Approved',
    },
    {
      label: 'View Details',
      icon: 'ti-eye',
      onClick: (row: any) => navigate(`/payments/${clientIdParam || row.clientId}?paymentId=${row.paymentId || row.id}&action=view`),
      hidden: (row: any) => row.status !== 'Rejected',
    }
  ];

  const assistantActions = [
    {
      label: 'View Details',
      icon: 'ti-eye',
      onClick: (row: any) => {
        navigate(`/payments/${clientIdParam || row.clientId}?paymentId=${row.paymentId || row.id}&action=view`);
      },
      hidden: (row: any) => row.status !== 'Pending Validation',
    },
    {
      label: 'View Receipt',
      icon: 'ti-receipt',
      onClick: (row: any) => navigate(`/payments/${clientIdParam || row.clientId}?paymentId=${row.paymentId || row.id}&action=receipt`),
      hidden: (row: any) => row.status !== 'Validated' && row.status !== 'Approved',
    },
    {
      label: 'View Details',
      icon: 'ti-eye',
      onClick: (row: any) => navigate(`/payments/${clientIdParam || row.clientId}?paymentId=${row.paymentId || row.id}&action=view`),
      hidden: (row: any) => row.status !== 'Rejected',
    }
  ];

  const accountantActions = [
    {
      label: 'Payment Details',
      icon: 'ti-eye',
      onClick: (row: any) => navigate(`/payments/${clientIdParam || row.clientId}?paymentId=${row.paymentId || row.id}&action=view`)
    }
  ];

  let actions: any[] = [];
  if (isFinanceManager) actions = fmActions;
  else if (isAssistant || isHeadAccountant) actions = assistantActions;
  else if (isAccountant) actions = accountantActions;

  // Form submission handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.invoiceNo || !form.referenceNumber || !form.amount) {
      toast.error('Invoice, Amount, and Reference Number are required.');
      return;
    }
    const parsedAmount = parseFloat(form.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Invalid payment amount. Amount must be greater than zero.');
      return;
    }
    setSubmitted(true);

    // We are no longer validating against existing invoices, allowing walk-ins
    const clientFullName = form.companyName || `${form.firstName} ${form.lastName}`.trim() || 'Walk-in Client';

    try {
      const targetInvoice = invoices.find((i: Invoice) => i.id === form.invoiceId || i.invoiceNumber === form.invoiceNo);
      const targetClient = targetInvoice ? clients.find((c: Client) => c.id === targetInvoice.clientId) : undefined;
      const payload: Partial<Payment> = {
        invoiceId: targetInvoice?.id || form.invoiceId,
        clientId: targetClient?.id || targetInvoice?.clientId || '',
        amount: parsedAmount,
        paymentMethod: form.paymentMethod as any,
        referenceNumber: form.referenceNumber,
        notes: form.notes || 'Recorded via Finance Record Payment',
        recordedBy: user?.fullName || 'System',
        status: 'Pending Validation',
        recordedAt: form.datePaid || new Date().toISOString(),
      };
      await addPayment(payload);
      setShowForm(false);
      setForm({ invoiceId: '', invoiceNo: '', companyName: '', firstName: '', lastName: '', amount: '', paymentMethod: 'Bank Transfer', referenceNumber: '', bankConfirmed: false, notes: '', datePaid: '' });
      addAuditLog({
        userId: user?.employeeId || 'System',
        userFullName: user?.fullName || 'System',
        userRole: user?.role || 'ACCOUNTANT',
        action: 'RECORD_PAYMENT',
        module: 'Payments',
        recordId: form.invoiceNo,
        recordType: 'Invoice',
        ipAddress: '127.0.0.1',
        details: `Recorded payment for Invoice ${form.invoiceNo}`,
        timestamp: new Date().toISOString()
      });
      toast.success('Payment recorded and saved to database. Pending validation.');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to record payment.';
      toast.error(msg, 'Record Payment Failed');
    } finally {
      setSubmitted(false);
    }
  };

  // Head Accountant / Finance Manager validate or reject a payment — PERSISTS TO DB
  const handleAFMSubmit = async (viewPayment: any) => {
    if (verificationStatus === 'Reject' && !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason.', 'Required Field Missing');
      return;
    }
    setSubmitted(true);
    try {
      if (verificationStatus === 'Reject') {
        await updatePayment(viewPayment.id, { status: 'Rejected' });
        toast.error(`Payment rejected.`, 'Payment Rejected');
      } else {
        await updatePayment(viewPayment.id, { status: 'Validated', validatedBy: user?.fullName, validatedAt: new Date().toISOString() });

        const invoice = invoices.find((i: Invoice) => i.id === viewPayment.invoiceId);
        if (invoice) {
          const previouslyPaid = payments.filter((p: Payment) => p.invoiceId === invoice.id && (p.status === 'Validated' || p.status === 'Approved') && p.id !== viewPayment.id).reduce((sum: number, p: Payment) => sum + p.amount, 0);
          if (previouslyPaid + viewPayment.amount >= invoice.totalAmount) {
            updateInvoice(invoice.id, { paymentStatus: 'Paid', status: 'Paid' });
          }
        }
        
        addCashFlowRecord({
          sourceReference: viewPayment.id,
          type: 'Inflow',
          amount: viewPayment.amount,
          date: new Date().toISOString(),
          recordedBy: user?.fullName || 'System'
        });

        toast.success(`Payment validated. Invoice and AR updated.`, 'Payment Validated');
      }
      addAuditLog({
        userId: user?.employeeId || 'System',
        userFullName: user?.fullName || 'System',
        userRole: user?.role || 'ACCOUNTANT',
        action: 'VALIDATE_PAYMENT',
        module: 'Payments',
        recordId: viewPayment.id,
        recordType: 'Payment',
        ipAddress: '127.0.0.1',
        details: `${verificationStatus} payment ${viewPayment.id}`,
        timestamp: new Date().toISOString()
      });
      navigate('/payments');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Action failed.';
      toast.error(msg, 'Validation Error');
    } finally {
      setSubmitted(false);
    }
  };

  // Finance Manager final approve — calls same validate endpoint (FM also validates)
  const handleFMSubmit = async (viewPayment: any) => {
    if (approvalStatus === 'Return for Review' && !rejectionReason.trim()) {
      toast.error('Please provide remarks for returning.', 'Required Field Missing');
      return;
    }
    setSubmitted(true);
    try {
      if (approvalStatus === 'Return for Review') {
        await updatePayment(viewPayment.id, { status: 'Pending Validation' });
        toast.info(`Payment returned for correction and saved to database.`, 'Payment Returned');
      } else {
        await updatePayment(viewPayment.id, { status: 'Approved', validatedBy: user?.fullName, validatedAt: new Date().toISOString() });

        // Auto-mark invoice as Paid if fully covered
        const invoice = invoices.find((i: Invoice) => i.id === viewPayment.invoiceId);
        if (invoice) {
          const previouslyPaid = payments.filter((p: Payment) => p.invoiceId === invoice.id && (p.status === 'Validated' || p.status === 'Approved') && p.id !== viewPayment.id).reduce((sum: number, p: Payment) => sum + p.amount, 0);
          if (previouslyPaid + viewPayment.amount >= invoice.totalAmount) {
            updateInvoice(invoice.id, { paymentStatus: 'Paid', status: 'Paid' });
          }
        }
        
        // Auto-record Cash Flow Inflow if not already recorded
        const isRecorded = cashFlowRecords?.some((c: CashFlowRecord) => c.sourceReference === viewPayment.id);
        if (!isRecorded) {
          addCashFlowRecord({
            sourceReference: viewPayment.id,
            type: 'Inflow',
            amount: viewPayment.amount,
            date: new Date().toISOString(),
            recordedBy: user?.fullName || 'System'
          });
        }

        toast.success(`Payment approved. Invoice = Paid. AR updated. OR generated.`, 'Payment Approved');
      }
      addAuditLog({
        userId: user?.employeeId || 'System',
        userFullName: user?.fullName || 'System',
        userRole: user?.role || 'FINANCIAL_MANAGER',
        action: 'APPROVE_PAYMENT',
        module: 'Payments',
        recordId: viewPayment.id,
        recordType: 'Payment',
        ipAddress: '127.0.0.1',
        details: `FM ${approvalStatus} payment ${viewPayment.id}`,
        timestamp: new Date().toISOString()
      });
      navigate('/payments');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Action failed.';
      toast.error(msg, 'Approval Error');
    } finally {
      setSubmitted(false);
    }
  };

  // --- Detail Views logic is now at the bottom of the file as modals ---
  let viewPayment: any = null;
  if (paymentIdParam) {
    let viewPaymentRaw: any = allowedPayments.find((p: Payment) => p.id === paymentIdParam);
    if (!viewPaymentRaw) {
      const cleanSpId = paymentIdParam.replace(/^SP-(SP-)+/, 'SP-');
      const baseSpId = cleanSpId.replace(/^SP-/, '');
      const sp = speedPay.find((s: SpeedPaySubmission) =>
        s.id === paymentIdParam ||
        s.id === cleanSpId ||
        s.id === baseSpId ||
        `SP-${s.id}` === paymentIdParam
      );
      if (sp) {
        viewPaymentRaw = {
          ...sp,
          id: paymentIdParam,
          amount: sp.amountPaid,
          recordedAt: sp.submittedAt,
          proofOfPaymentUrl: sp.proofFileUrl
        };
      }
    }

    if (viewPaymentRaw) {
      const client = clients.find((c: Client) => c.id === viewPaymentRaw.clientId);
      const invoice = invoices.find((i: Invoice) => i.id === viewPaymentRaw.invoiceId);
      viewPayment = {
        ...viewPaymentRaw,
        clientName: client?.name ?? viewPaymentRaw.clientName ?? 'Unknown',
        invoiceNumber: invoice?.invoiceNumber ?? viewPaymentRaw.invoiceNumber ?? viewPaymentRaw.invoiceId
      };
    }
  }

  const filteredClientPayments = useMemo(() => {
    if (!clientIdParam) return [];
    return enriched.filter((row: any) => {
      if (clientFilterFlow !== 'All') {
        const rowFlow = (row.flow || 'inflow').toLowerCase();
        if (rowFlow !== clientFilterFlow.toLowerCase()) return false;
      }
      if (clientFilterStatus !== 'All') {
        if (row.status !== clientFilterStatus) return false;
      }
      if (clientSearch.trim()) {
        const q = clientSearch.toLowerCase().trim();
        const matchInv = (row.invoiceNumber || '').toLowerCase().includes(q);
        const matchRef = (row.referenceNumber || '').toLowerCase().includes(q);
        const matchId = (row.id || '').toLowerCase().includes(q);
        const matchMethod = (row.paymentMethod || '').toLowerCase().includes(q);
        const matchStatus = (row.status || '').toLowerCase().includes(q);
        if (!matchInv && !matchRef && !matchId && !matchMethod && !matchStatus) return false;
      }
      return true;
    });
  }, [clientIdParam, enriched, clientFilterFlow, clientFilterStatus, clientSearch]);

  const renderSharedPaymentModals = () => (
    <>
      {actionParam === 'view' && viewPayment && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99990, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => navigate(clientIdParam ? `/payments/${clientIdParam}` : '/payments')}>
          <div style={{ background: '#F8FAFC', borderRadius: '12px', width: '100%', maxWidth: '750px', maxHeight: '95vh', overflowY: 'auto', padding: '32px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '20px' }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* TOP COLUMN */}
              <Card style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px dashed #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => navigate(clientIdParam ? `/payments/${clientIdParam}` : '/payments')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', padding: 0 }}>
                      <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
                    </button>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0F172A', fontWeight: 800 }}>Payment Information</h3>
                  </div>
                  <span style={{ background: viewPayment.status === 'Validated' ? '#DCFCE7' : viewPayment.status === 'Pending Validation' ? '#FEF3C7' : '#F1F5F9', color: viewPayment.status === 'Validated' ? '#15803D' : viewPayment.status === 'Pending Validation' ? '#B45309' : '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className={viewPayment.status === 'Validated' ? "ti ti-lock" : "ti ti-clock"} /> {viewPayment.status}
                  </span>
                </div>
                
                <div style={{ fontSize: '13px', color: '#0F172A', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-info-circle" style={{ fontSize: '16px', color: '#0F172A' }} />
                  <span><strong>Notice:</strong> Please ensure all payment details are correct. Verification actions are available in the summary section on the right.</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Client Name <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B' }}>{viewPayment.clientName}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Invoice Ref No.</label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B' }}>
                      {viewPayment.invoiceNumber}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Payment Method <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B' }}>{viewPayment.paymentMethod}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Reference Number <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B', fontFamily: 'monospace' }}>{viewPayment.referenceNumber || '—'}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Amount <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ECFDF5', border: '1px solid #10B981', borderRadius: '8px', fontSize: '15px', color: '#047857', fontWeight: 800 }}>
                      ₱{Number(viewPayment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Date Recorded <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="ti ti-calendar" style={{ color: '#64748B' }} />
                      {safeFormatDate(viewPayment.recordedAt || new Date())}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '12px', marginTop: '16px' }}>
                  <Button
                    title="View Invoice"
                    variant="secondary"
                    icon="ti-file-invoice"
                    style={{ background: '#ffffff', color: '#475569', borderColor: '#E2E8F0' }}
                    onClick={() => {
                      const found = invoices.find((i: Invoice) => i.id === viewPayment.invoiceId || i.invoiceNumber === viewPayment.invoiceId || i.invoiceNumber === viewPayment.invoiceNumber);
                      if (found) {
                        setSelectedInvoiceForModal(found);
                      } else {
                        toast.info('No corresponding invoice record found in the database.');
                      }
                    }}
                  />

                  <Button
                    title="Proof of Payment"
                    variant="secondary"
                    icon="ti-photo"
                    style={{ background: '#EFF6FF', color: '#2563EB', borderColor: '#BFDBFE' }}
                    onClick={() => setShowProofModal(true)}
                  />

                  {isAccountant && (
                    <div style={{ marginLeft: 'auto' }}>
                      <Button
                        title="Save OR"
                        variant="primary"
                        disabled={!['Validated', 'Verified', 'Approved'].includes(viewPayment.status)}
                        onClick={() => navigate(clientIdParam ? `/payments/${clientIdParam}?action=issue-or&id=${viewPayment.id}` : `?action=issue-or&id=${viewPayment.id}`)}
                      />
                    </div>
                  )}
                </div>

              </Card>

              {/* RIGHT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* Summary Card */}
                <Card style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0F172A', fontWeight: 800 }}>Payment Summary</h3>
                    <StatusBadge status={viewPayment.status} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Payment ID</span>
                      <span style={{ fontSize: '13px', color: '#0D9488', fontWeight: 800 }}>{viewPayment.id}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Recorded By</span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>{getEmployeeName(viewPayment.recordedBy, 'System')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Verified By</span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>{getEmployeeName(viewPayment.validatedBy, '—')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Status</span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>{viewPayment.status}</span>
                    </div>
                  </div>
                </Card>

                {/* Accountant Verification Card */}
                {isAccountant && viewPayment.status === 'Pending Validation' && (
                  <Card style={{ padding: '24px', borderTop: '4px solid #10B981' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', color: '#0F172A', fontWeight: 800 }}>Accountant Verification</h3>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                      <select
                        value={verificationStatus}
                        onChange={(e) => setVerificationStatus(e.target.value as 'Validate' | 'Reject')}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', fontWeight: 600, flex: 1, cursor: 'pointer' }}
                      >
                        <option value="Validate">Validate Payment</option>
                        <option value="Reject">Reject Payment</option>
                      </select>
                    </div>

                    {verificationStatus === 'Reject' && (
                      <div style={{ marginBottom: '16px' }}>
                        <textarea
                          placeholder="Reason for rejection..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', resize: 'none', height: '80px', boxSizing: 'border-box' }}
                        />
                      </div>
                    )}

                    <Button
                      title={verificationStatus === 'Validate' ? 'Confirm Validation' : 'Reject Payment'}
                      variant={verificationStatus === 'Validate' ? 'primary' : 'danger'}
                      onClick={() => handleAFMSubmit(viewPayment)}
                      fullWidth
                    />
                  </Card>
                )}

                {/* Finance Manager Final Decision Card */}
                {(isFinanceManager && viewPayment.status === 'Validated') && (
                  <Card style={{ padding: '24px', border: '1px solid #3B82F6', borderRadius: '8px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', color: '#0F172A', fontWeight: 800 }}>Final Decision</h3>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                      <select
                        value={approvalStatus}
                        onChange={(e) => setApprovalStatus(e.target.value as 'Approve' | 'Return for Review')}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', fontWeight: 600, flex: 1, cursor: 'pointer', background: '#ffffff', color: '#1E293B' }}
                      >
                        <option value="Approve">Approve</option>
                        <option value="Return for Review">Return for Review</option>
                      </select>
                    </div>

                    {approvalStatus === 'Return for Review' && (
                      <div style={{ marginBottom: '16px' }}>
                        <textarea
                          placeholder="Reason for return..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', resize: 'none', height: '80px', boxSizing: 'border-box' }}
                        />
                      </div>
                    )}
                    
                    <Button
                      title="Confirm Final Approval"
                      variant="primary"
                      fullWidth
                      style={{ background: '#10B981', borderColor: '#10B981' }}
                      onClick={() => setShowApprovalModal(true)}
                    />
                  </Card>
                )}
              </div>
            </div>

            {/* Modal for Invoice Details */}
            {selectedInvoiceForModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => setSelectedInvoiceForModal(null)}>
                <div style={{ background: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>Invoice Details</h3>
                    <button onClick={() => setSelectedInvoiceForModal(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center' }}><i className="ti ti-x" /></button>
                  </div>

                  <div style={{ maxHeight: 'calc(90vh - 100px)', overflowY: 'auto' }}>
                    <PaymentsErrorBoundary>
                      <InvoiceDocument invoice={selectedInvoiceForModal} />
                    </PaymentsErrorBoundary>
                  </div>
                </div>
              </div>
            )}

            {/* Modal for Proof of Payment */}
            {showProofModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => setShowProofModal(false)}>
                <div style={{ background: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '500px', padding: '24px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>Proof of Payment</h3>
                    <button onClick={() => setShowProofModal(false)} style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}><i className="ti ti-x" /></button>
                  </div>
                  
                  <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {viewPayment.proofOfPaymentUrl ? (
                      <img src={viewPayment.proofOfPaymentUrl} alt="Proof of Payment" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #E2E8F0' }} />
                    ) : (
                      <>
                        <i className="ti ti-file-invoice" style={{ fontSize: '48px', color: '#CBD5E1' }} />
                        <div style={{ fontWeight: 700, color: '#475569', fontSize: '15px' }}>
                          {`${viewPayment.paymentMethod?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'receipt'}-${viewPayment.invoiceNumber?.toLowerCase() || viewPayment.referenceNumber?.toLowerCase() || '0001'}.jpg`}
                        </div>
                      </>
                    )}
                    <div style={{ color: '#64748B', fontSize: '13px', marginTop: '8px' }}>uploaded by {viewPayment.recordedBy || 'System'}</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#64748B' }}>Reference Number</span>
                      <span style={{ fontSize: '13px', color: '#0D9488', fontWeight: 800 }}>{viewPayment.referenceNumber || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#64748B' }}>Amount on receipt</span>
                      <span style={{ fontSize: '13px', color: '#0D9488', fontWeight: 800 }}>₱{Number(viewPayment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#64748B' }}>Uploaded</span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>{safeFormatDate(viewPayment.recordedAt || new Date())}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <Button
                      title="Close"
                      variant="secondary"
                      onClick={() => setShowProofModal(false)}
                      style={{ flex: 1, padding: '12px', fontWeight: 700 }}
                    />
                    <Button
                      title="Download"
                      variant="primary"
                      icon="ti-arrow-down"
                      onClick={() => {
                        if (viewPayment.proofOfPaymentUrl) {
                          window.open(viewPayment.proofOfPaymentUrl, '_blank');
                        } else {
                          toast.info('No file available to download.');
                        }
                      }}
                      style={{ flex: 1, padding: '12px', fontWeight: 700, background: '#10B981', borderColor: '#10B981' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Modal for Final Approval Confirmation */}
            {showApprovalModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => setShowApprovalModal(false)}>
                <div style={{ background: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '24px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '20px' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>Confirm Action</h3>
                    <button onClick={() => setShowApprovalModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center' }}><i className="ti ti-x" /></button>
                  </div>
                  
                  <div style={{ fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>
                    You are about to <strong style={{ color: approvalStatus === 'Approve' ? '#10B981' : '#F59E0B' }}>{approvalStatus}</strong> this payment record. Do you want to proceed?
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <Button
                      title="Cancel"
                      variant="secondary"
                      onClick={() => setShowApprovalModal(false)}
                    />
                    <Button
                      title="Confirm"
                      variant="primary"
                      onClick={() => {
                        setShowApprovalModal(false);
                        handleFMSubmit(viewPayment);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {paymentIdParam && actionParam === 'receipt' && viewPayment && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999, padding: '24px' }} onClick={() => navigate(clientIdParam ? `/payments/${clientIdParam}` : '/payments')}>
          <div style={{ background: '#F8FAFC', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            
            {/* STICKY HEADER */}
            <div style={{ position: 'sticky', top: 0, background: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', zIndex: 10, borderTopLeftRadius: '12px', borderTopRightRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
                <button 
                  onClick={() => navigate(clientIdParam ? `/payments/${clientIdParam}` : '/payments')} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: '50%', color: '#64748B', transition: 'background 0.2s', marginRight: '-8px' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'} 
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  title="Close and Go Back"
                >
                  <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>PAYMENT STATUS</span>
                  <span style={{ color: '#D97706', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: '#FEF3C7', display: 'flex', padding: '2px', borderRadius: '50%' }}><i className="ti ti-alert-circle" style={{ color: '#D97706', fontSize: '14px' }} /></span> Issued OR
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>INVOICE STATUS</span>
                  <span style={{ color: '#059669', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: '#D1FAE5', display: 'flex', padding: '2px', borderRadius: '50%' }}><i className="ti ti-check" style={{ color: '#059669', fontSize: '14px' }} /></span> Paid
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>DATE ISSUED</span>
                  <span style={{ color: '#0F172A', fontWeight: 700, fontSize: '13px' }}>{safeFormatDate(viewPayment.recordedAt || new Date())}</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button onClick={(e) => { e.stopPropagation(); toast.info(`Downloading PDF Official Receipt for ${viewPayment.invoiceNumber}...`, 'Download Started'); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0D9488', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                  <i className="ti ti-printer" style={{ fontSize: '16px' }} /> Print / PDF
                </button>
              </div>
            </div>

            {/* RECEIPT BODY */}
            <div style={{ padding: '24px' }}>
              <div style={{ background: '#fff', padding: '48px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', border: '1px solid #E2E8F0', position: 'relative', overflow: 'hidden', minHeight: '500px' }}>
                
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', color: '#0F172A', fontWeight: 800 }}>Speedex Courier & Forwarder, Inc.</h2>
                  <p style={{ margin: 0, color: '#64748B', fontSize: '0.85rem' }}>123 Rizal St, Brgy. Poblacion, Cebu City</p>
                </div>
                
                <h1 style={{ textAlign: 'center', margin: '0 0 40px', fontSize: '1.6rem', letterSpacing: '0.4em', color: '#0F172A', fontWeight: 800 }}>R E C E I P T</h1>
                
                <div style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%) rotate(-15deg)', fontSize: '140px', fontWeight: 900, color: 'rgba(239, 68, 68, 0.08)', pointerEvents: 'none', zIndex: 0, letterSpacing: '0.1em' }}>PAID</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', fontSize: '0.85rem', color: '#475569', position: 'relative', zIndex: 1 }}>
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ color: '#94A3B8' }}>Receipt #:</span>
                      <strong style={{ color: '#0F172A' }}>{viewPayment.orNumber || `OR-2026-0001`}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ color: '#94A3B8' }}>Issue Date:</span>
                      <strong style={{ color: '#0F172A' }}>{safeFormatDate(viewPayment.recordedAt || new Date())}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ color: '#94A3B8' }}>Payment Method:</span>
                      <strong style={{ color: '#0F172A' }}>{viewPayment.paymentMethod || 'N/A'}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ color: '#94A3B8' }}>Reference #:</span>
                      <strong style={{ color: '#0F172A' }}>{viewPayment.referenceNumber || 'CHK-999888'}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#94A3B8', marginBottom: '6px' }}>Received From:</div>
                    <strong style={{ display: 'block', color: '#0F172A', fontSize: '1.05rem', marginBottom: '6px' }}>{viewPayment.clientName || 'Shopee Express'}</strong>
                    <div style={{ color: '#64748B', marginBottom: '4px' }}>Code: {viewPayment.clientId || 'CL-002'}</div>
                    <div style={{ color: '#64748B' }}>Invoice No: {viewPayment.invoiceNumber || 'LZD-2026-0002'}</div>
                  </div>
                </div>

                <div style={{ marginTop: '50px', position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #CBD5E1', paddingBottom: '12px', marginBottom: '16px', fontWeight: 700, color: '#0F172A' }}>
                    <span>Description</span>
                    <span>Total</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px', color: '#475569' }}>
                    <span>Full payment for logistics and delivery services covered by Invoice No. {viewPayment.invoiceNumber}</span>
                    <strong style={{ color: '#0F172A', fontSize: '1.1rem' }}>₱{Number(viewPayment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );

  // --- Client Detail View ---
  if (clientIdParam) {
    const client = clients.find((c: Client) => c.id === clientIdParam);
    if (!client) return <div>Client not found</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        <ClientInfoCard client={client} />

        {/* Payment Transaction History - Modern Card Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header & Controls Toolbar */}
          <div style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #E2E8F0',
            padding: '18px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0F172A', fontWeight: 800, letterSpacing: '-0.01em' }}>
                  Payment Transaction History
                </h3>
                <span style={{
                  padding: '2px 10px',
                  borderRadius: 9999,
                  background: '#F1F5F9',
                  color: '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 700
                }}>
                  {filteredClientPayments.length} record{filteredClientPayments.length === 1 ? '' : 's'}
                </span>
              </div>

              {isAccountant && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    background: '#0D9488',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 4px rgba(13,148,136,0.2)',
                    transition: 'all 0.2s'
                  }}
                >
                  <i className="ti ti-plus" /> Record Payment
                </button>
              )}
            </div>

            {/* Filter controls row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* Search input */}
              <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 220 }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 16 }} />
                <input
                  type="text"
                  placeholder="Search payments..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 36px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    fontSize: '0.875rem',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {clientSearch && (
                  <button
                    type="button"
                    onClick={() => setClientSearch('')}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                  >
                    <i className="ti ti-x" style={{ fontSize: 14 }} />
                  </button>
                )}
              </div>

              {/* Flow Direction dropdown */}
              <select
                value={clientFilterFlow}
                onChange={e => setClientFilterFlow(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', fontSize: '0.85rem', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
              >
                <option value="All">Flow Direction</option>
                <option value="inflow">Inflow</option>
                <option value="outflow">Outflow</option>
              </select>

              {/* Status dropdown */}
              <select
                value={clientFilterStatus}
                onChange={e => setClientFilterStatus(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', fontSize: '0.85rem', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
              >
                <option value="All">All Statuses</option>
                <option value="Pending Validation">Pending Validation</option>
                <option value="Validated">Verified & Deposited</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>

              {(clientSearch || clientFilterFlow !== 'All' || clientFilterStatus !== 'All') && (
                <button
                  type="button"
                  onClick={() => { setClientSearch(''); setClientFilterFlow('All'); setClientFilterStatus('All'); }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #FCA5A5',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <i className="ti ti-x" /> Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* Cards Grid or Empty State */}
          {filteredClientPayments.length === 0 ? (
            <div style={{
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              padding: '60px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12
            }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 28 }}>
                <i className="ti ti-receipt-off" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>No payment records found</div>
              <p style={{ margin: 0, fontSize: 13, color: '#64748B', maxWidth: 400 }}>
                {clientSearch || clientFilterFlow !== 'All' || clientFilterStatus !== 'All'
                  ? 'No payment transactions match the selected filters. Try clearing your filters.'
                  : 'No payment transaction history recorded for this client yet.'}
              </p>
              {(clientSearch || clientFilterFlow !== 'All' || clientFilterStatus !== 'All') && (
                <button
                  onClick={() => { setClientSearch(''); setClientFilterFlow('All'); setClientFilterStatus('All'); }}
                  style={{ marginTop: 8, padding: '8px 18px', borderRadius: 8, background: '#0F172A', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
              {filteredClientPayments.map((row: any) => {
                let displayStatus = row.status;
                if (displayStatus === 'Pending Validation') displayStatus = 'Pending Verification';
                if (displayStatus === 'Validated') displayStatus = 'Verified & Deposited';

                const isApprovedOrValidated = row.status === 'Approved' || row.status === 'Validated';

                return (
                  <div
                    key={row.id}
                    style={{
                      background: '#fff',
                      border: '1px solid #E2E8F0',
                      borderRadius: 14,
                      padding: 22,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 18px -4px rgba(0,0,0,0.08)';
                      e.currentTarget.style.borderColor = '#CBD5E1';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                      e.currentTarget.style.borderColor = '#E2E8F0';
                    }}
                  >
                    {/* Top Row: Payment ID chip + Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          color: '#0F172A',
                          background: '#F1F5F9',
                          padding: '3px 9px',
                          borderRadius: 6,
                          border: '1px solid #E2E8F0'
                        }}>
                          #{row.id}
                        </span>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 9999,
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          background: '#DCFCE7',
                          color: '#15803D',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <i className="ti ti-arrow-down-left" /> Inflow
                        </span>
                      </div>
                      <StatusBadge status={displayStatus} />
                    </div>

                    {/* Linked Invoice & Payment Mode */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          LINKED INVOICE NO.
                        </div>
                        <div
                          onClick={() => navigate(`/invoicing-desk/${row.invoiceId}`)}
                          style={{
                            color: '#2563EB',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            marginTop: 3,
                            textDecoration: 'underline'
                          }}
                          title="View Invoice in Invoicing Desk"
                        >
                          <i className="ti ti-file-invoice" style={{ textDecoration: 'none' }} />
                          {row.invoiceNumber || row.invoiceId || '—'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          PAYMENT MODE
                        </div>
                        <div style={{ marginTop: 3 }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            background: row.paymentMethod === 'SpeedPay' ? '#F0FDFA' : '#F8FAFC',
                            border: `1px solid ${row.paymentMethod === 'SpeedPay' ? '#99F6E4' : '#E2E8F0'}`,
                            color: row.paymentMethod === 'SpeedPay' ? '#0D9488' : '#334155',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700
                          }}>
                            {row.paymentMethod || 'Direct'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Amount Paid Box */}
                    <div style={{
                      padding: '14px 18px',
                      borderRadius: 10,
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#166534', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                          AMOUNT PAID
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#15803D', marginTop: 2 }}>
                          ₱{Number(row.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>PAYMENT DATE</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#14532D', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <i className="ti ti-calendar" />
                          {safeFormatDate(row.recordedAt || row.paymentDate || row.dateRecorded || row.submittedAt || row.createdAt)}
                        </div>
                      </div>
                    </div>

                    {/* Metadata Section */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 10,
                      padding: '12px 14px',
                      background: '#F8FAFC',
                      borderRadius: 8,
                      border: '1px solid #F1F5F9'
                    }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>REFERENCE / CHECK NO.</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.referenceNumber}>
                          {row.referenceNumber || '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>RECORDED BY</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {getEmployeeName(row.recordedBy, 'System')}
                        </div>
                      </div>
                    </div>

                    {/* Actions Footer */}
                    <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {/* Final Approve Button (for FM when row is Validated) */}
                      {isFinanceManager && row.status === 'Validated' && (
                        <button
                          type="button"
                          onClick={() => navigate(`/payments/${clientIdParam}?paymentId=${row.id}&action=view`)}
                          style={{
                            flex: 1,
                            minWidth: 120,
                            padding: '9px 14px',
                            background: '#10B981',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 12.5,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
                          }}
                        >
                          <i className="ti ti-shield-check" /> Final Approve
                        </button>
                      )}

                      {/* Validate Button for Assistant / Head Accountant when Pending Validation */}
                      {(isAssistant || isHeadAccountant) && row.status === 'Pending Validation' && (
                        <button
                          type="button"
                          onClick={() => navigate(`/payments/${clientIdParam}?paymentId=${row.id}&action=view`)}
                          style={{
                            flex: 1,
                            minWidth: 120,
                            padding: '9px 14px',
                            background: '#0D9488',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 12.5,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <i className="ti ti-checklist" /> Validate
                        </button>
                      )}

                      {/* Official Receipt Button */}
                      {isApprovedOrValidated && (
                        <button
                          type="button"
                          onClick={() => navigate(`/payments/${clientIdParam}?paymentId=${row.id}&action=receipt`)}
                          style={{
                            padding: '9px 14px',
                            background: '#F0FDF4',
                            color: '#15803D',
                            border: '1px solid #BBF7D0',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 12.5,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <i className="ti ti-receipt" /> OR Receipt
                        </button>
                      )}

                      {/* Inspect / View Details Button */}
                      <button
                        type="button"
                        onClick={() => navigate(`/payments/${clientIdParam}?paymentId=${row.id}&action=view`)}
                        style={{
                          flex: (isFinanceManager && row.status === 'Validated') || ((isAssistant || isHeadAccountant) && row.status === 'Pending Validation') ? 0 : 1,
                          minWidth: 90,
                          padding: '9px 14px',
                          background: '#0F172A',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: 12.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <i className="ti ti-eye" /> Inspect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showForm && createPortal(
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 99999, padding: '20px'
          }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%', maxWidth: '840px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Record Payment</h3>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 20 }}>×</button>
              </div>
              <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Invoice No. <span style={{ color: '#EF4444' }}>*</span></label>
                  <input required type="text" placeholder="Enter Invoice Number" value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box', fontWeight: 600 }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Company Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input required type="text" placeholder="Enter Company Name" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>First Name</label>
                  <input type="text" placeholder="First Name" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Last Name</label>
                  <input type="text" placeholder="Last Name" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Amount Paid <span style={{ color: '#EF4444' }}>*</span></label>
                  <input required type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box', fontWeight: 600 }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Payment Method <span style={{ color: '#EF4444' }}>*</span></label>
                  <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box' }}>
                    <option value="Check">Check</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                    {form.paymentMethod === 'Cash' ? 'Cash Receipt No. (Optional)' : (
                      <>{form.paymentMethod === 'Check' ? 'Check Number' : 'Bank Reference Number'} <span style={{ color: '#EF4444' }}>*</span></>
                    )}
                  </label>
                  <input required={form.paymentMethod !== 'Cash'} type="text" placeholder={form.paymentMethod === 'Cash' ? 'e.g. CR-0012' : 'e.g. BPI-887211'} value={form.referenceNumber}
                    onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <CalendarPicker
                    label="DATE PAID"
                    value={form.datePaid}
                    onChange={v => setForm(f => ({ ...f, datePaid: v }))}
                    required={true}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 12 }}>Upload Proof of Payment</label>
                  
                  {scanResultMode === 'NONE' && checkingStep === 0 && (
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      style={{
                        padding: '24px 20px', borderRadius: '12px',
                        border: dragActive ? '2px dashed #0D9488' : '2px dashed #CBD5E1',
                        background: dragActive ? '#F0FDFA' : '#fff',
                        textAlign: 'center', transition: 'all 0.2s',
                      }}
                    >
                      <input type="file" id="file-upload-2" style={{ display: 'none' }} onChange={handleFileChange} accept=".jpg,.jpeg,.png,.pdf" />
                      <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', boxShadow: '0 4px 12px rgba(13,148,136,0.3)' }}>
                        <UploadCloud size={20} color="#ffffff" />
                      </div>
                      <div style={{ fontSize: '0.95rem', color: '#0F172A', fontWeight: 700, marginBottom: '6px' }}>
                        Drag & Drop or Upload Document
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '16px' }}>
                        Support JPG, JPEG, and PNG receipt statements up to 10MB.
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                        <button type="button" onClick={() => document.getElementById('file-upload-2')?.click()} style={{ background: '#0D9488', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}>Choose File</button>
                        <button type="button" onClick={() => document.getElementById('file-upload-2')?.click()} style={{ background: '#fff', color: '#0F172A', border: '1px solid #CBD5E1', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Camera size={16} color="#475569" /> Scan Document
                        </button>
                      </div>
                    </div>
                  )}

                  {checkingStep > 0 && (
                    <div style={{ padding: '24px', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ marginBottom: 12, fontWeight: 600, color: '#0F172A' }}>AI Scanning Document...</div>
                      <div style={{ width: '100%', height: 6, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                        <div style={{ width: `${checkingProgress}%`, height: '100%', background: '#0EA5E9', transition: 'width 0.3s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', justifyContent: 'center', gap: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: checkingStep >= 1 ? '#0F172A' : '#94A3B8' }}>{checkingStep > 1 ? <CheckCircle size={14} color="#10B981" /> : <Clock size={14} />} Reading</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: checkingStep >= 2 ? '#0F172A' : '#94A3B8' }}>{checkingStep > 2 ? <CheckCircle size={14} color="#10B981" /> : <Clock size={14} />} Checking</span>
                      </div>
                    </div>
                  )}

                  {(scanResultMode === 'INVALID' || scanResultMode === 'DUPLICATE' || scanResultMode === 'CLEAR') && previewDocUrl && (
                    <div style={{ marginBottom: 16, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 12, fontSize: '0.9rem', textAlign: 'left' }}>Uploaded Document Preview:</div>
                      <img src={previewDocUrl} alt="Uploaded Proof" onClick={() => setFullScreenPreview(true)} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', objectFit: 'contain', border: '1px solid #E2E8F0', cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'} title="Click to view full size" />
                    </div>
                  )}

                  {scanResultMode === 'INVALID' && (
                    <div style={{ padding: '20px', borderRadius: '12px', border: '1px solid #FECACA', background: '#FEF2F2' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <AlertTriangle size={24} color="#EF4444" style={{ flexShrink: 0 }} />
                        <div>
                          <h4 style={{ margin: '0 0 6px', color: '#991B1B', fontWeight: 700 }}>Invalid Document Uploaded</h4>
                          <p style={{ margin: 0, fontSize: '0.85rem', color: '#B91C1C', lineHeight: 1.5 }}>{ocrWarning}</p>
                        </div>
                      </div>
                      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={resetUpload} style={{ background: '#fff', border: '1px solid #FECACA', padding: '6px 16px', borderRadius: 6, color: '#991B1B', fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                      </div>
                    </div>
                  )}

                  {scanResultMode === 'DUPLICATE' && matchedRecordDetails && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: 16 }}>
                      <div style={{ padding: '32px', borderRadius: '16px', border: '1px solid rgba(225, 29, 72, 0.2)', background: '#fff' }}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <AlertTriangle size={24} />
                          </div>
                          <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800, color: '#EF4444' }}>Possible Duplicate Detected</h3>
                            <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>A possible matching Official Receipt or Invoice already exists in FOMS.</p>
                          </div>
                        </div>

                        {/* Document Previews side-by-side */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                          <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                            <h4 style={{ margin: '0 0 12px', fontSize: '12.5px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Uploaded / Scanned Document</h4>
                            <div style={{ overflow: 'hidden', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                              {previewDocUrl ? (
                                <img src={previewDocUrl} alt="Uploaded candidate preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                              ) : (
                                <i className="ti ti-file-text" style={{ fontSize: '3rem', color: '#94A3B8' }} />
                              )}
                            </div>
                          </div>
                          <div style={{ padding: '16px', background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                            <h4 style={{ margin: '0 0 12px', fontSize: '12.5px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Existing Matching FOMS Record</h4>
                            <div style={{ overflow: 'hidden', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                              {matchedRecordDetails?.proofUrl ? (
                                <img src={matchedRecordDetails.proofUrl} alt="Existing database match preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', opacity: 0.85 }} />
                              ) : (
                                <i className="ti ti-file-check" style={{ fontSize: '3rem', color: '#94A3B8' }} />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Similarity Banner info */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px', background: '#FFF7ED', borderRadius: '8px', border: '1px solid rgba(249, 115, 22, 0.2)', marginBottom: '24px', fontSize: '13.5px', fontWeight: 600 }}>
                          <span style={{ color: '#9A3412' }}>Highest Similarity: {similarityScore}% Match Score</span>
                          <span style={{ color: '#334155' }}>Checked Date & Time: {new Date().toLocaleString()}</span>
                        </div>

                        {/* Comparison Matrix */}
                        <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: '#0F172A' }}>Comparison Parameters Matrix</h4>
                        <div style={{ overflowX: 'auto', marginBottom: '28px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Field</th>
                                <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Uploaded Document</th>
                                <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Existing FOMS Record</th>
                                <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Match Result</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Document Type</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px' }}>OFFICIAL RECEIPT</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px' }}>Official Receipt</td>
                                <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('type', 'OFFICIAL_RECEIPT', 'OFFICIAL_RECEIPT').style}>{getCellMatchStyle('type', 'OFFICIAL_RECEIPT', 'OFFICIAL_RECEIPT').text}</span></td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>OR / Invoice Number</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace' }}>{form.referenceNumber || '—'}</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace' }}>{matchedRecordDetails?.registered_or}</td>
                                <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('docNum', form.referenceNumber || '—', matchedRecordDetails?.registered_or).style}>{getCellMatchStyle('docNum', form.referenceNumber || '—', matchedRecordDetails?.registered_or).text}</span></td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Client Name</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px' }}>{form.companyName || form.firstName || 'SPEEDEX USER'}</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px' }}>{matchedRecordDetails?.client_name}</td>
                                <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('client', form.companyName || form.firstName || 'SPEEDEX USER', matchedRecordDetails?.client_name).style}>{getCellMatchStyle('client', form.companyName || form.firstName || 'SPEEDEX USER', matchedRecordDetails?.client_name).text}</span></td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Amount</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700 }}>₱{parseFloat(form.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700 }}>₱{parseFloat(matchedRecordDetails?.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('amount', form.amount || '0', matchedRecordDetails?.amount).style}>{getCellMatchStyle('amount', form.amount || '0', matchedRecordDetails?.amount).text}</span></td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Transaction Date</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px' }}>{form.datePaid || '2026-09-15'}</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px' }}>{matchedRecordDetails?.entry_date || '2026-09-15'}</td>
                                <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('date', form.datePaid || '2026-09-15', matchedRecordDetails?.entry_date || '2026-09-15').style}>{getCellMatchStyle('date', form.datePaid || '2026-09-15', matchedRecordDetails?.entry_date || '2026-09-15').text}</span></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                          <button type="button" onClick={resetUpload} style={{ background: '#fff', border: '1px solid #CBD5E1', padding: '10px 20px', borderRadius: 8, color: '#334155', fontWeight: 600, cursor: 'pointer' }}>Cancel / Reset</button>
                          <button type="button" onClick={() => setShowManualReviewPanel(true)} style={{ background: '#fff', border: '1px solid #CBD5E1', padding: '10px 20px', borderRadius: 8, color: '#0F172A', fontWeight: 600, cursor: 'pointer' }}>Need Manual Review</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {scanResultMode === 'CLEAR' && (
                    <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #A7F3D0', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircle size={20} color="#10B981" />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#065F46', fontSize: '0.9rem' }}>{uploadFile?.name}</div>
                          <div style={{ fontSize: '0.8rem', color: '#059669' }}>Scanned successfully. No duplicates found.</div>
                        </div>
                      </div>
                      <button type="button" onClick={resetUpload} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={20} color="#059669" />
                      </button>
                    </div>
                  )}
                </div>
                {!isFinanceManager && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                    <input type="checkbox" id="bankConfirmed" checked={form.bankConfirmed} onChange={e => setForm(f => ({ ...f, bankConfirmed: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    <label htmlFor="bankConfirmed" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', cursor: 'pointer' }}>
                      I confirm that this payment has been received and entered into the company account.
                    </label>
                  </div>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Notes (Optional)</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Additional payment notes..."
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', resize: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  <button type="button" onClick={() => setShowForm(false)} style={{ padding: '10px 24px', borderRadius: 8, background: '#F1F5F9', color: '#475569', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button
                    type="submit"
                    disabled={!form.invoiceNo || !form.companyName || (form.paymentMethod !== 'Cash' && !form.referenceNumber) || !form.datePaid}
                    style={{ padding: '10px 24px', borderRadius: 8, background: (!form.invoiceNo || !form.companyName || (form.paymentMethod !== 'Cash' && !form.referenceNumber) || !form.datePaid) ? '#94A3B8' : '#0F172A', color: '#fff', border: 'none', fontWeight: 700, cursor: (!form.invoiceNo || !form.companyName || (form.paymentMethod !== 'Cash' && !form.referenceNumber) || !form.datePaid) ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}>Record Payment</button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

        {renderSharedPaymentModals()}
      </div>
    );
  }

  // --- List View — Cash Flow Table ---
  // Only VALIDATED payments count as confirmed cash inflows
  const validatedPayments = payments.filter((p: Payment) => p.status === 'Validated' || p.status === 'Approved');
  const pendingPayments = payments.filter((p: Payment) => p.status === 'Pending Validation');

  const cashFlowRows = validatedPayments.map((p: Payment) => {
    const cli = clients.find((c: Client) => c.id === p.clientId);
    const invoice = invoices.find((i: Invoice) => i.id === p.invoiceId);
    return {
      ...p,
      clientName: (p as any).clientName || cli?.name || p.clientId || '—',
      invoiceNumber: (p as any).invoiceNumber || invoice?.invoiceNumber || p.invoiceId || '—',
      recordedAt: p.recordedAt || (p as any).paymentDate || (p as any).dateRecorded || (p as any).submittedAt || (p as any).createdAt,
      type: 'Inflow' as const,
      classification: 'Client Collection',
    };
  });

  // Validated SpeedPay submissions as inflow rows
  const speedPayRows = speedPay
    .filter((s: SpeedPaySubmission) => s.status === 'Validated')
    .map((s: SpeedPaySubmission) => {
      const invoice = invoices.find((i: Invoice) => i.id === s.invoiceId);
      const targetClientId = (s as any).clientId || invoice?.clientId || '';
      const cli = clients.find((c: Client) => c.id === targetClientId);
      const cleanId = s.id.startsWith('SP-') ? s.id : `SP-${s.id}`;
      return {
        id: cleanId,
        clientId: targetClientId || (cli ? cli.id : ''),
        clientName: cli?.name ?? s.clientName ?? '—',
        invoiceId: s.invoiceId,
        invoiceNumber: s.invoiceNumber ?? invoice?.invoiceNumber ?? s.invoiceId ?? '—',
        amount: s.amountPaid ?? 0,
        paymentMethod: s.paymentMethod,
        referenceNumber: s.referenceNumber,
        recordedAt: s.submittedAt,
        status: 'Validated' as const,
        type: 'Inflow' as const,
        classification: 'SpeedPay Collection',
        proofOfPaymentUrl: s.proofFileUrl,
      };
    });

  // Map expenses as Outflow rows
  const expenseRows = expenses.map(exp => ({
    id: exp.id,
    clientId: '',
    clientName: exp.category,
    invoiceId: '',
    invoiceNumber: exp.referenceNo || '—',
    amount: exp.amount,
    paymentMethod: 'Internal',
    referenceNumber: exp.referenceNo || '—',
    recordedAt: exp.date + 'T00:00:00Z',
    status: 'Validated' as const,
    type: 'Outflow' as const,
    classification: exp.description,
  }));

  const dbOutflowRows = (cashFlowRecords || [])
    .filter(c => c.type === 'Outflow')
    .map(c => ({
      id: c.id,
      clientId: '',
      clientName: 'Operating Disbursement',
      invoiceId: '',
      invoiceNumber: c.sourceReference || '—',
      amount: c.amount,
      paymentMethod: 'Bank Transfer',
      referenceNumber: c.sourceReference || '—',
      recordedAt: c.date ? (c.date.includes('T') ? c.date : `${c.date}T00:00:00Z`) : new Date().toISOString(),
      status: 'Validated' as const,
      type: 'Outflow' as const,
      classification: c.sourceReference || 'Disbursement',
    }));

  const allCashFlowRows = [...cashFlowRows, ...speedPayRows, ...expenseRows, ...dbOutflowRows]
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  const totalInflow = allCashFlowRows
    .filter(r => r.type === 'Inflow')
    .reduce((sum: number, r) => sum + r.amount, 0);

  const totalOutflow = allCashFlowRows
    .filter(r => r.type === 'Outflow')
    .reduce((sum: number, e) => sum + e.amount, 0);
  const netCashFlow = totalInflow - totalOutflow;

  const pendingInflowAmt = pendingPayments.reduce((s: number, p: Payment) => s + p.amount, 0);

  const filteredCashFlow = allCashFlowRows.filter(r => {
    if (filterType !== 'All' && r.type !== filterType) return false;
    if (filterStatus !== 'All' && r.status !== filterStatus) return false;
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      if (new Date(r.recordedAt) < from) return false;
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59);
      if (new Date(r.recordedAt) > to) return false;
    }
    if (cashFlowSearch.trim()) {
      const q = cashFlowSearch.toLowerCase().trim();
      const matchClient = (r.clientName || '').toLowerCase().includes(q);
      const matchInv = (r.invoiceNumber || '').toLowerCase().includes(q);
      const matchRef = (r.referenceNumber || '').toLowerCase().includes(q);
      const matchCls = (r.classification || '').toLowerCase().includes(q);
      const matchMethod = (r.paymentMethod || '').toLowerCase().includes(q);
      if (!matchClient && !matchInv && !matchRef && !matchCls && !matchMethod) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Record Expense Modal */}
      {showExpenseForm && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999, padding: '20px'
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Record Expense</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>Log a cash outflow/expense transaction</p>
              </div>
              <button onClick={() => setShowExpenseForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 20 }}>×</button>
            </div>
            <form onSubmit={handleSubmitExpense} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Description *</label>
                <input required type="text" placeholder="e.g. Office rent for October 2026" value={expenseForm.description}
                  onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Category *</label>
                  <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box' }}>
                    <option>Office Supplies</option>
                    <option>Utilities</option>
                    <option>Salaries</option>
                    <option>Transport</option>
                    <option>Maintenance</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Amount (₱) *</label>
                  <input required type="number" step="0.01" min="0" placeholder="0.00" value={expenseForm.amount}
                    onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box', fontWeight: 700 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Date *</label>
                  <input required type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Reference No. (Optional)</label>
                  <input type="text" placeholder="e.g. OR-001, INV-2026" value={expenseForm.referenceNo}
                    onChange={e => setExpenseForm(f => ({ ...f, referenceNo: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowExpenseForm(false)} style={{ padding: '10px 20px', borderRadius: 8, background: '#F1F5F9', color: '#475569', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 24px', borderRadius: 8, background: '#EF4444', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-arrow-down-right" /> Record Expense
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Record Payment Modal - available from main list view */}
      {showForm && createPortal(

        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 99999, padding: '20px'
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%', maxWidth: '840px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Record Payment</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 20 }}>×</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Invoice No. <span style={{ color: '#EF4444' }}>*</span></label>
                <input required type="text" placeholder="Enter Invoice Number" value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box', fontWeight: 600 }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Company Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input required type="text" list="payments-client-datalist" placeholder="Enter Company Name" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                <datalist id="payments-client-datalist">
                  {clients.map(c => <option key={c.id} value={c.name}>{c.name} ({c.id})</option>)}
                </datalist>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>First Name</label>
                <input type="text" placeholder="First Name" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Last Name</label>
                <input type="text" placeholder="Last Name" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Amount Paid <span style={{ color: '#EF4444' }}>*</span></label>
                <input required type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.9rem', boxSizing: 'border-box', fontWeight: 600 }} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Payment Method <span style={{ color: '#EF4444' }}>*</span></label>
                <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box' }}>
                  <option value="Check">Check</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                  {form.paymentMethod === 'Cash' ? 'Cash Receipt No. (Optional)' : (
                    <>{form.paymentMethod === 'Check' ? 'Check Number' : 'Bank Reference Number'} <span style={{ color: '#EF4444' }}>*</span></>
                  )}
                </label>
                <input required={form.paymentMethod !== 'Cash'} type="text" placeholder={form.paymentMethod === 'Cash' ? 'e.g. CR-0012' : 'e.g. BPI-887211'} value={form.referenceNumber}
                  onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <CalendarPicker
                  label="DATE PAID"
                  value={form.datePaid}
                  onChange={v => setForm(f => ({ ...f, datePaid: v }))}
                  required={true}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 12 }}>Upload Proof of Payment</label>
                
                {scanResultMode === 'NONE' && checkingStep === 0 && (
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    style={{
                      padding: '24px 20px', borderRadius: '12px',
                      border: dragActive ? '2px dashed #0D9488' : '2px dashed #CBD5E1',
                      background: dragActive ? '#F0FDFA' : '#fff',
                      textAlign: 'center', transition: 'all 0.2s',
                    }}
                  >
                    <input type="file" id="file-upload-1" style={{ display: 'none' }} onChange={handleFileChange} accept=".jpg,.jpeg,.png,.pdf" />
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', boxShadow: '0 4px 12px rgba(13,148,136,0.3)' }}>
                      <UploadCloud size={20} color="#ffffff" />
                    </div>
                    <div style={{ fontSize: '0.95rem', color: '#0F172A', fontWeight: 700, marginBottom: '6px' }}>
                      Drag & Drop or Upload Document
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '16px' }}>
                      Support JPG, JPEG, and PNG receipt statements up to 10MB.
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                      <button type="button" onClick={() => document.getElementById('file-upload-1')?.click()} style={{ background: '#0D9488', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}>Choose File</button>
                      <button type="button" onClick={() => document.getElementById('file-upload-1')?.click()} style={{ background: '#fff', color: '#0F172A', border: '1px solid #CBD5E1', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Camera size={16} color="#475569" /> Scan Document
                      </button>
                    </div>
                  </div>
                )}

                {checkingStep > 0 && (
                  <div style={{ padding: '24px', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                    <div style={{ marginBottom: 12, fontWeight: 600, color: '#0F172A' }}>AI Scanning Document...</div>
                    <div style={{ width: '100%', height: 6, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ width: `${checkingProgress}%`, height: '100%', background: '#0EA5E9', transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', justifyContent: 'center', gap: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: checkingStep >= 1 ? '#0F172A' : '#94A3B8' }}>{checkingStep > 1 ? <CheckCircle size={14} color="#10B981" /> : <Clock size={14} />} Reading</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: checkingStep >= 2 ? '#0F172A' : '#94A3B8' }}>{checkingStep > 2 ? <CheckCircle size={14} color="#10B981" /> : <Clock size={14} />} Checking</span>
                    </div>
                  </div>
                )}

                {(scanResultMode === 'INVALID' || scanResultMode === 'DUPLICATE' || scanResultMode === 'CLEAR') && previewDocUrl && (
                  <div style={{ marginBottom: 16, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 12, fontSize: '0.9rem', textAlign: 'left' }}>Uploaded Document Preview:</div>
                    <img src={previewDocUrl} alt="Uploaded Proof" onClick={() => setFullScreenPreview(true)} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', objectFit: 'contain', border: '1px solid #E2E8F0', cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'} title="Click to view full size" />
                  </div>
                )}

                {scanResultMode === 'INVALID' && (
                  <div style={{ padding: '20px', borderRadius: '12px', border: '1px solid #FECACA', background: '#FEF2F2' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <AlertTriangle size={24} color="#EF4444" style={{ flexShrink: 0 }} />
                      <div>
                        <h4 style={{ margin: '0 0 6px', color: '#991B1B', fontWeight: 700 }}>Invalid Document Uploaded</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#B91C1C', lineHeight: 1.5 }}>{ocrWarning}</p>
                      </div>
                    </div>
                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={resetUpload} style={{ background: '#fff', border: '1px solid #FECACA', padding: '6px 16px', borderRadius: 6, color: '#991B1B', fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                    </div>
                  </div>
                )}

                {scanResultMode === 'DUPLICATE' && matchedRecordDetails && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: 16 }}>
                    <div style={{ padding: '32px', borderRadius: '16px', border: '1px solid rgba(225, 29, 72, 0.2)', background: '#fff' }}>
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <AlertTriangle size={24} />
                        </div>
                        <div>
                          <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800, color: '#EF4444' }}>Possible Duplicate Detected</h3>
                          <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>A possible matching Official Receipt or Invoice already exists in FOMS.</p>
                        </div>
                      </div>

                      {/* Document Previews side-by-side */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                          <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                            <h4 style={{ margin: '0 0 12px', fontSize: '12.5px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Uploaded / Scanned Document</h4>
                            <div style={{ overflow: 'hidden', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                              {previewDocUrl ? (
                                <img src={previewDocUrl} alt="Uploaded candidate preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                              ) : (
                                <i className="ti ti-file-text" style={{ fontSize: '3rem', color: '#94A3B8' }} />
                              )}
                            </div>
                          </div>
                          <div style={{ padding: '16px', background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                            <h4 style={{ margin: '0 0 12px', fontSize: '12.5px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Existing Matching FOMS Record</h4>
                            <div style={{ overflow: 'hidden', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                              {matchedRecordDetails?.proofUrl ? (
                                <img src={matchedRecordDetails.proofUrl} alt="Existing database match preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', opacity: 0.85 }} />
                              ) : (
                                <i className="ti ti-file-check" style={{ fontSize: '3rem', color: '#94A3B8' }} />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Similarity Banner info */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px', background: '#FFF7ED', borderRadius: '8px', border: '1px solid rgba(249, 115, 22, 0.2)', marginBottom: '24px', fontSize: '13.5px', fontWeight: 600 }}>
                          <span style={{ color: '#9A3412' }}>Highest Similarity: {similarityScore}% Match Score</span>
                          <span style={{ color: '#334155' }}>Checked Date & Time: {new Date().toLocaleString()}</span>
                        </div>

                        {/* Comparison Matrix */}
                        <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: '#0F172A' }}>Comparison Parameters Matrix</h4>
                        <div style={{ overflowX: 'auto', marginBottom: '28px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Field</th>
                                <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Uploaded Document</th>
                                <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Existing FOMS Record</th>
                                <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Match Result</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Document Type</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px' }}>OFFICIAL RECEIPT</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px' }}>Official Receipt</td>
                                <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('type', 'OFFICIAL_RECEIPT', 'OFFICIAL_RECEIPT').style}>{getCellMatchStyle('type', 'OFFICIAL_RECEIPT', 'OFFICIAL_RECEIPT').text}</span></td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>OR / Invoice Number</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace' }}>{form.referenceNumber || '—'}</td>
                                <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace' }}>{matchedRecordDetails?.registered_or}</td>
                                <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('docNum', form.referenceNumber || '—', matchedRecordDetails?.registered_or).style}>{getCellMatchStyle('docNum', form.referenceNumber || '—', matchedRecordDetails?.registered_or).text}</span></td>
                              </tr>
                            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                              <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Client Name</td>
                              <td style={{ padding: '12px 14px', fontSize: '13px' }}>{form.companyName || form.firstName || 'SPEEDEX USER'}</td>
                              <td style={{ padding: '12px 14px', fontSize: '13px' }}>{matchedRecordDetails?.client_name}</td>
                              <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('client', form.companyName || form.firstName || 'SPEEDEX USER', matchedRecordDetails?.client_name).style}>{getCellMatchStyle('client', form.companyName || form.firstName || 'SPEEDEX USER', matchedRecordDetails?.client_name).text}</span></td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                              <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Amount</td>
                              <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700 }}>₱{parseFloat(form.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700 }}>₱{parseFloat(matchedRecordDetails?.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('amount', form.amount || '0', matchedRecordDetails?.amount).style}>{getCellMatchStyle('amount', form.amount || '0', matchedRecordDetails?.amount).text}</span></td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                              <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600 }}>Transaction Date</td>
                              <td style={{ padding: '12px 14px', fontSize: '13px' }}>{form.datePaid || '2026-09-15'}</td>
                              <td style={{ padding: '12px 14px', fontSize: '13px' }}>{matchedRecordDetails?.entry_date || '2026-09-15'}</td>
                              <td style={{ padding: '12px 14px' }}><span style={getCellMatchStyle('date', form.datePaid || '2026-09-15', matchedRecordDetails?.entry_date || '2026-09-15').style}>{getCellMatchStyle('date', form.datePaid || '2026-09-15', matchedRecordDetails?.entry_date || '2026-09-15').text}</span></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button type="button" onClick={resetUpload} style={{ background: '#fff', border: '1px solid #CBD5E1', padding: '10px 20px', borderRadius: 8, color: '#334155', fontWeight: 600, cursor: 'pointer' }}>Cancel / Reset</button>
                        <button type="button" onClick={() => setShowManualReviewPanel(true)} style={{ background: '#fff', border: '1px solid #CBD5E1', padding: '10px 20px', borderRadius: 8, color: '#0F172A', fontWeight: 600, cursor: 'pointer' }}>Need Manual Review</button>
                      </div>
                    </div>
                  </div>
                )}

                {scanResultMode === 'CLEAR' && (
                  <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #A7F3D0', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={20} color="#10B981" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#065F46', fontSize: '0.9rem' }}>{uploadFile?.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#059669' }}>Scanned successfully. No duplicates found.</div>
                      </div>
                    </div>
                    <button type="button" onClick={resetUpload} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      <X size={20} color="#059669" />
                    </button>
                  </div>
                )}
              </div>
              {!isFinanceManager && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <input type="checkbox" id="bankConfirmedMain" checked={form.bankConfirmed} onChange={e => setForm(f => ({ ...f, bankConfirmed: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <label htmlFor="bankConfirmedMain" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', cursor: 'pointer' }}>
                    I confirm that this payment has been received and entered into the company account.
                  </label>
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Notes (Optional)</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional payment notes..."
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.9rem', resize: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '10px 24px', borderRadius: 8, background: '#F1F5F9', color: '#475569', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button
                  type="submit"
                  disabled={!form.invoiceNo || !form.companyName || (form.paymentMethod !== 'Cash' && !form.referenceNumber) || !form.datePaid}
                  style={{ padding: '10px 24px', borderRadius: 8, background: (!form.invoiceNo || !form.companyName || (form.paymentMethod !== 'Cash' && !form.referenceNumber) || !form.datePaid) ? '#94A3B8' : '#0F172A', color: '#fff', border: 'none', fontWeight: 700, cursor: (!form.invoiceNo || !form.companyName || (form.paymentMethod !== 'Cash' && !form.referenceNumber) || !form.datePaid) ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}>Record Payment</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* KPI Summary Cards */}
      <div className="kpi-grid">
        {[
          { label: 'Total Cash Inflow', value: `₱${Number(totalInflow || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, variant: 'success' as const, icon: 'ti-trending-up', sub: 'Validated payments only' },
          { label: 'Total Cash Outflow', value: `₱${Number(totalOutflow || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, variant: 'danger' as const, icon: 'ti-trending-down', sub: 'Approved outgoing transactions' },
          { label: 'Net Cash Flow', value: `₱${Number(netCashFlow || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, variant: netCashFlow >= 0 ? 'info' as const : 'danger' as const, icon: 'ti-currency-peso', sub: 'Total Inflow minus Outflow' },
          { label: 'Pending Validation', value: `₱${Number(pendingInflowAmt || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, variant: 'warning' as const, icon: 'ti-clock', sub: `${pendingPayments.length} payment(s) awaiting` },
        ].map(kpi => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} variant={kpi.variant} icon={kpi.icon} description={kpi.sub} hideTrend />
        ))}
      </div>

      {/* Cash Flow Toolbar & Card Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Toolbar: Search, Filters, and Action Buttons */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          background: '#fff',
          padding: '14px 20px',
          borderRadius: 14,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '1 1 auto' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: 220, minWidth: 180, flexShrink: 0 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 15 }} />
              <input
                type="text"
                placeholder="Search by client, invoice, or reference..."
                value={cashFlowSearch}
                onChange={e => setCashFlowSearch(e.target.value)}
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 32px 0 36px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  fontSize: '0.85rem',
                  color: '#0F172A',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {cashFlowSearch && (
                <button
                  type="button"
                  onClick={() => setCashFlowSearch('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0 }}
                >
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', fontSize: '0.85rem', color: '#334155', fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box', flexShrink: 0 }}
            >
              <option value="All">All Types</option>
              <option value="Inflow">Inflow</option>
              <option value="Outflow">Outflow</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', fontSize: '0.85rem', color: '#334155', fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box', flexShrink: 0 }}
            >
              <option value="All">All Statuses</option>
              <option value="Validated">Validated</option>
              <option value="Approved">Approved</option>
              <option value="Pending Validation">Pending Validation</option>
              <option value="Rejected">Rejected</option>
            </select>

            {/* Date Range Group (From & To always together) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <CalendarPicker
                label="From:"
                placeholder="Start date..."
                value={filterDateFrom}
                onChange={date => setFilterDateFrom(date)}
                maxDate={filterDateTo || "2026-12-31"}
                variant="toolbar"
              />

              <CalendarPicker
                label="To:"
                placeholder="End date..."
                value={filterDateTo}
                onChange={date => setFilterDateTo(date)}
                minDate={filterDateFrom}
                maxDate="2026-12-31"
                variant="toolbar"
              />
            </div>

            {(filterType !== 'All' || filterStatus !== 'All' || filterDateFrom || filterDateTo || cashFlowSearch) && (
              <button
                type="button"
                onClick={() => { setFilterType('All'); setFilterStatus('All'); setFilterDateFrom(''); setFilterDateTo(''); setCashFlowSearch(''); }}
                style={{ height: 38, padding: '0 14px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, boxSizing: 'border-box', flexShrink: 0 }}
              >
                <i className="ti ti-x" /> Clear Filters
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 'auto' }}>
            {isAccountant && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                style={{
                  height: 38,
                  padding: '0 18px',
                  borderRadius: 8,
                  background: '#0D9488',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 4px rgba(13,148,136,0.2)',
                  boxSizing: 'border-box',
                  whiteSpace: 'nowrap'
                }}
              >
                <i className="ti ti-plus" /> Record Payment
              </button>
            )}
            {isAssistant && (
              <button
                type="button"
                onClick={() => setShowExpenseForm(true)}
                style={{
                  height: 38,
                  padding: '0 18px',
                  borderRadius: 8,
                  background: '#fff',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxSizing: 'border-box',
                  whiteSpace: 'nowrap'
                }}
              >
                <i className="ti ti-receipt-refund" /> Record Expense
              </button>
            )}
          </div>
        </div>

        {/* Results Count Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748B' }}>
            Showing <strong style={{ color: '#0F172A' }}>{filteredCashFlow.length}</strong> cash flow transaction{filteredCashFlow.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Cards Grid */}
        {filteredCashFlow.length === 0 ? (
          <div style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #E2E8F0',
            padding: '60px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12
          }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 28 }}>
              <i className="ti ti-receipt-off" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>No cash flow records found</div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748B', maxWidth: 400 }}>
              No transactions match your current search and filter settings. Try adjusting the filters or record a new transaction.
            </p>
            {(filterType !== 'All' || filterStatus !== 'All' || filterDateFrom || filterDateTo || cashFlowSearch) && (
              <button
                onClick={() => { setFilterType('All'); setFilterStatus('All'); setFilterDateFrom(''); setFilterDateTo(''); setCashFlowSearch(''); }}
                style={{ marginTop: 8, padding: '8px 18px', borderRadius: 8, background: '#0F172A', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 20 }}>
            {filteredCashFlow.map((row: any) => {
              const isInflow = row.type === 'Inflow';
              return (
                <div
                  key={row.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 22,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px -4px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                  }}
                >
                  {/* Top Row: Type Pill + Status Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 9999,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      background: isInflow ? '#DCFCE7' : '#FEE2E2',
                      color: isInflow ? '#15803D' : '#DC2626',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <i className={`ti ${isInflow ? 'ti-arrow-down-left' : 'ti-arrow-up-right'}`} />
                      {row.type}
                    </span>
                    <StatusBadge status={row.status} />
                  </div>

                  {/* Client & Reference Info */}
                  <div>
                    <div
                      onClick={() => row.clientId ? navigate(`/payments/${row.clientId}`) : undefined}
                      style={{
                        fontWeight: 800,
                        fontSize: 17,
                        color: '#0F172A',
                        cursor: row.clientId ? 'pointer' : 'default',
                        lineHeight: 1.3
                      }}
                    >
                      {row.clientName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: 4 }}>
                        {row.invoiceNumber}
                      </span>
                      {row.classification && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>
                          • {row.classification}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount Highlight Box */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: isInflow ? '#F0FDF4' : '#FEF2F2',
                    border: `1px solid ${isInflow ? '#BBF7D0' : '#FECACA'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: isInflow ? '#166534' : '#991B1B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        {isInflow ? 'CASH INFLOW' : 'CASH OUTFLOW'}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: isInflow ? '#15803D' : '#DC2626', marginTop: 2 }}>
                        {isInflow ? '+' : '-'}₱{Number(row.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        background: '#fff',
                        borderRadius: 6,
                        border: '1px solid #E2E8F0',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#334155'
                      }}>
                        {row.paymentMethod || 'Internal'}
                      </span>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                    padding: '10px 14px',
                    background: '#F8FAFC',
                    borderRadius: 8,
                    border: '1px solid #F1F5F9'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>REFERENCE NO.</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.referenceNumber}>
                        {row.referenceNumber || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>TRANSACTION DATE</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginTop: 2 }}>
                        {safeFormatDate(row.recordedAt || row.paymentDate || row.dateRecorded || row.submittedAt || row.createdAt || row.date)}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', gap: 8 }}>
                    {isInflow ? (
                      <>
                        <button
                          type="button"
                          onClick={() => navigate(`/payments/${row.clientId || 'all'}?paymentId=${row.id}&action=view`)}
                          style={{
                            flex: 1,
                            padding: '9px 12px',
                            background: '#0F172A',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 12.5,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <i className="ti ti-eye" /> Payment Details
                        </button>
                        {(row.status === 'Validated' || row.status === 'Approved') && (
                          <button
                            type="button"
                            onClick={() => {
                              const cId = row.clientId || (row.invoiceId ? invoices.find(i => i.id === row.invoiceId)?.clientId : '') || 'all';
                              navigate(`/receipts/${cId}?receiptId=${row.id}`);
                            }}
                            title="View / Print Official Receipt"
                            style={{
                              padding: '9px 14px',
                              background: '#F0FDF4',
                              color: '#15803D',
                              border: '1px solid #BBF7D0',
                              borderRadius: 8,
                              fontWeight: 700,
                              fontSize: 12.5,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6
                            }}
                          >
                            <i className="ti ti-receipt" /> OR
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toast.info(`Expense: ${row.classification} - ₱${Number(row.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          background: '#F8FAFC',
                          color: '#334155',
                          border: '1px solid #CBD5E1',
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: 12.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <i className="ti ti-file-text" /> Outflow Voucher
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Screen Image Preview Modal */}
      {fullScreenPreview && previewDocUrl && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', overflow: 'auto' }} onClick={() => { setFullScreenPreview(false); setPreviewZoom(1); }}>
          <div style={{ position: 'fixed', top: '24px', right: '24px', display: 'flex', gap: '12px', zIndex: 1000000 }} onClick={(e) => e.stopPropagation()}>
            <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '12px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.4)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onClick={() => setPreviewZoom(prev => Math.min(prev + 0.5, 4))} title="Zoom In">
              <ZoomIn size={24} />
            </button>
            <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '12px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.4)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onClick={() => setPreviewZoom(prev => Math.max(prev - 0.5, 0.5))} title="Zoom Out">
              <ZoomOut size={24} />
            </button>
            <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '12px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.4)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onClick={() => { setFullScreenPreview(false); setPreviewZoom(1); }} title="Close">
              <X size={24} />
            </button>
          </div>
          <div style={{ transform: `scale(${previewZoom})`, transition: 'transform 0.2s ease-in-out', transformOrigin: 'center' }} onClick={(e) => e.stopPropagation()}>
            <img src={previewDocUrl} alt="Full screen preview" style={{ maxWidth: '100vw', maxHeight: '100vh', objectFit: 'contain', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', borderRadius: '4px' }} />
          </div>
        </div>,
        document.body
      )}

      {/* Manual Review Modal from ai-frontend */}
      {showManualReviewPanel && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(3.5px)' }}>
          <div style={{ background: '#ffffff', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', width: '100%', maxWidth: '840px', maxHeight: '94vh', overflowY: 'auto', padding: '32px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1E293B' }}>Duplicate Record Comparison (Alert #28)</h3>
              <button onClick={() => setShowManualReviewPanel(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', gap: '12px', padding: '16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', marginBottom: '24px', alignItems: 'flex-start' }}>
              <Info size={18} style={{ color: '#D97706', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: '13.5px', fontWeight: 700, color: '#92400E' }}>Matching Factors Confidence: {similarityScore}%</h5>
                <p style={{ margin: 0, fontSize: '13px', color: '#B45309', lineHeight: '1.4' }}>Highly similar {matchedRecordDetails?.registered_or ? 'receipt' : 'invoice'} numbers: {form.referenceNumber || '—'} and {matchedRecordDetails?.registered_or || matchedRecordDetails?.registered_invoice || '—'}.</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Document Image Comparison View</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button style={{ border: '1px solid #CBD5E1', background: '#fff', borderRadius: 4, cursor: 'pointer', padding: '4px 8px', height: '28px', fontSize: '11px' }} onClick={() => setPreviewZoom(z => Math.max(z - 0.25, 0.5))}><ZoomOut size={12} /></button>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', minWidth: '40px', textAlign: 'center' }}>{previewZoom.toFixed(2)}x</span>
                <button style={{ border: '1px solid #CBD5E1', background: '#fff', borderRadius: 4, cursor: 'pointer', padding: '4px 8px', height: '28px', fontSize: '11px' }} onClick={() => setPreviewZoom(z => Math.min(z + 0.25, 3))}><ZoomIn size={12} /></button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div style={{ overflow: 'hidden', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                {previewDocUrl ? (
                  <img src={previewDocUrl} alt="Uploaded original doc" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', transform: `scale(${previewZoom})`, transition: 'transform 0.15s ease' }} />
                ) : (
                  <i className="ti ti-file-text" style={{ fontSize: '2.5rem', color: '#94A3B8' }} />
                )}
              </div>
              <div style={{ overflow: 'hidden', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                {matchedRecordDetails?.proofUrl ? (
                  <img src={matchedRecordDetails.proofUrl} alt="Existing match doc" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', opacity: 0.85, transform: `scale(${previewZoom})`, transition: 'transform 0.15s ease' }} />
                ) : (
                  <i className="ti ti-file-check" style={{ fontSize: '2.5rem', color: '#94A3B8' }} />
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', background: '#FFFFFF' }}>
                <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: '#0F766E', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>Original Record details</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>amount</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>{parseFloat(form.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>dueDate</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>{form.datePaid || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>clientName</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>{form.companyName || form.firstName || 'Client'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>invoiceNumber</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>{form.referenceNumber || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>paymentStatus</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>Unpaid</span>
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', background: '#FFFFFF' }}>
                <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: '#0F766E', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>Possible Matching record</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>amount</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>{parseFloat(matchedRecordDetails?.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>dueDate</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>{matchedRecordDetails?.entry_date || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>clientName</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>{matchedRecordDetails?.client_name || 'Client'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>invoiceNumber</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>{matchedRecordDetails?.registered_or || matchedRecordDetails?.registered_invoice || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                    <span style={{ color: '#64748B' }}>paymentStatus</span>
                    <span style={{ color: '#0D9488', fontWeight: 700 }}>{matchedRecordDetails?.status === 'Validated' ? 'Paid' : 'Unpaid'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '20px', marginBottom: '14px' }}>
              <h4 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>Log Human Validation Action</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px', color: '#334155' }}>Review Decision</label>
                  <select style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px' }} value={manualReviewDecision} onChange={(e) => setManualReviewDecision(e.target.value as any)}>
                    <option value="Mark as Duplicate">Mark as Duplicate</option>
                    <option value="Mark as Unique">Mark as Unique</option>
                  </select>
                </div>
                <div>
                  {manualReviewDecision === 'Mark as Duplicate' ? (
                    <>
                      <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px', color: '#334155' }}>Recommended Legacy Action</label>
                      <select style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px' }} value={duplicateHandling} onChange={(e) => setDuplicateHandling(e.target.value)}>
                        <option value="Flag and Block New Submission">Flag and Block New Submission</option>
                        <option value="Link to Existing Record">Link to Existing Record</option>
                        <option value="Return for Correction">Return for Correction</option>
                        <option value="Keep for Investigation">Keep for Investigation</option>
                      </select>
                    </>
                  ) : (
                    <>
                      <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px', color: '#334155' }}>Reason why the document is unique</label>
                      <select style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px' }} value={uniqueReason} onChange={(e) => setUniqueReason(e.target.value)}>
                        <option value="Different transaction">Different transaction</option>
                        <option value="Different client">Different client</option>
                        <option value="Different amount">Different amount</option>
                        <option value="Other">Other</option>
                      </select>
                    </>
                  )}
                </div>
              </div>

              {manualReviewDecision === 'Mark as Duplicate' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px', color: '#334155' }}>Duplicate Reason Option</label>
                  <select style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px' }} value={duplicateReason} onChange={(e) => setDuplicateReason(e.target.value)}>
                    <option value="Same OR number">Same OR number</option>
                    <option value="Same Invoice number">Same Invoice number</option>
                    <option value="Same client and amount">Same client and amount</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px', color: '#334155' }}>Remarks / Audit Notes <span style={{ color: '#EF4444' }}>*</span></label>
                <textarea style={{ width: '100%', minHeight: '80px', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid #CBD5E1' }} placeholder="Explain matches or safety checks (required for auditor compliance logs)..." value={manualNote} onChange={(e) => setManualNote(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '20px', alignItems: 'flex-start', fontSize: '12.5px', color: '#64748B' }}>
                <Info size={16} style={{ color: '#94A3B8', marginTop: '2px', flexShrink: 0 }} />
                <span>Note: Submitting this review records your validation inside the AI audit service database. It does not directly modify transaction data in the legacy FOMS MSSQL tables.</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
              <button style={{ height: '36px', minWidth: '90px', border: '1px solid #CBD5E1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: '#334155' }} onClick={() => setShowManualReviewPanel(false)}>Close</button>
              <button style={{ height: '36px', minWidth: '130px', backgroundColor: '#00A99D', border: 'none', borderRadius: '6px', color: '#FFFFFF', fontWeight: 700, cursor: manualNote.trim() ? 'pointer' : 'not-allowed', opacity: manualNote.trim() ? 1 : 0.6 }} onClick={() => { setShowManualReviewPanel(false); setScanResultMode('NONE'); }} disabled={!manualNote.trim()}>Submit Review</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {actionParam === 'view' && viewPayment && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99990, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => navigate('/payments')}>
          <div style={{ background: '#F8FAFC', borderRadius: '12px', width: '100%', maxWidth: '750px', maxHeight: '95vh', overflowY: 'auto', padding: '32px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '20px' }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* TOP COLUMN (was left) */}
              <Card style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px dashed #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => navigate('/payments')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', padding: 0 }}>
                      <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
                    </button>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0F172A', fontWeight: 800 }}>Payment Information</h3>
                  </div>
                  <span style={{ background: viewPayment.status === 'Validated' ? '#DCFCE7' : viewPayment.status === 'Pending Validation' ? '#FEF3C7' : '#F1F5F9', color: viewPayment.status === 'Validated' ? '#15803D' : viewPayment.status === 'Pending Validation' ? '#B45309' : '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className={viewPayment.status === 'Validated' ? "ti ti-lock" : "ti ti-clock"} /> {viewPayment.status}
                  </span>
                </div>
                
                <div style={{ fontSize: '13px', color: '#0F172A', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-info-circle" style={{ fontSize: '16px', color: '#0F172A' }} />
                  <span><strong>Notice:</strong> Please ensure all payment details are correct. Verification actions are available in the summary section on the right.</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Client Name <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B' }}>{viewPayment.clientName}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Invoice Ref No.</label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B' }}>
                      {viewPayment.invoiceNumber}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Payment Method <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B' }}>{viewPayment.paymentMethod}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Reference Number <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B', fontFamily: 'monospace' }}>{viewPayment.referenceNumber || '—'}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Amount <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ECFDF5', border: '1px solid #10B981', borderRadius: '8px', fontSize: '15px', color: '#047857', fontWeight: 800 }}>
                      ₱{Number(viewPayment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Date Recorded <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="ti ti-calendar" style={{ color: '#64748B' }} />
                      {safeFormatDate(viewPayment.recordedAt || new Date())}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '12px', marginTop: '16px' }}>
                  <Button
                    title="View Invoice"
                    variant="secondary"
                    icon="ti-file-invoice"
                    style={{ background: '#ffffff', color: '#475569', borderColor: '#E2E8F0' }}
                    onClick={() => {
                      const found = invoices.find((i: Invoice) => i.id === viewPayment.invoiceId || i.invoiceNumber === viewPayment.invoiceId || i.invoiceNumber === viewPayment.invoiceNumber);
                      if (found) {
                        setSelectedInvoiceForModal(found);
                      } else {
                        toast.info('No corresponding invoice record found in the database.');
                      }
                    }}
                  />

                  <Button
                    title="Proof of Payment"
                    variant="secondary"
                    icon="ti-photo"
                    style={{ background: '#EFF6FF', color: '#2563EB', borderColor: '#BFDBFE' }}
                    onClick={() => setShowProofModal(true)}
                  />

                  {isAccountant && (
                    <div style={{ marginLeft: 'auto' }}>
                      <Button
                        title="Save OR"
                        variant="primary"
                        disabled={!['Validated', 'Verified', 'Approved'].includes(viewPayment.status)}
                        onClick={() => navigate(`?action=issue-or&id=${viewPayment.id}`)}
                      />
                    </div>
                  )}
                </div>

              </Card>

              {/* RIGHT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* Summary Card */}
                <Card style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0F172A', fontWeight: 800 }}>Payment Summary</h3>
                    <StatusBadge status={viewPayment.status} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Payment ID</span>
                      <span style={{ fontSize: '13px', color: '#0D9488', fontWeight: 800 }}>{viewPayment.id}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Recorded By</span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>{getEmployeeName(viewPayment.recordedBy, 'System')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Verified By</span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>{getEmployeeName(viewPayment.validatedBy, '—')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Status</span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>{viewPayment.status}</span>
                    </div>
                  </div>
                </Card>

                {/* Accountant Verification Card */}
                {isAccountant && viewPayment.status === 'Pending Validation' && (
                  <Card style={{ padding: '24px', borderTop: '4px solid #10B981' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', color: '#0F172A', fontWeight: 800 }}>Accountant Verification</h3>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                      <select
                        value={verificationStatus}
                        onChange={(e) => setVerificationStatus(e.target.value as 'Validate' | 'Reject')}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', fontWeight: 600, flex: 1, cursor: 'pointer' }}
                      >
                        <option value="Validate">Validate Payment</option>
                        <option value="Reject">Reject Payment</option>
                      </select>
                    </div>

                    {verificationStatus === 'Reject' && (
                      <div style={{ marginBottom: '16px' }}>
                        <textarea
                          placeholder="Reason for rejection..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', resize: 'none', height: '80px', boxSizing: 'border-box' }}
                        />
                      </div>
                    )}

                    <Button
                      title={verificationStatus === 'Validate' ? 'Confirm Validation' : 'Reject Payment'}
                      variant={verificationStatus === 'Validate' ? 'primary' : 'danger'}
                      onClick={() => handleAFMSubmit(viewPayment)}
                      fullWidth
                    />
                  </Card>
                )}

                {/* Finance Manager Final Decision Card */}
                {(isFinanceManager && viewPayment.status === 'Validated') && (
                  <Card style={{ padding: '24px', border: '1px solid #3B82F6', borderRadius: '8px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', color: '#0F172A', fontWeight: 800 }}>Final Decision</h3>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                      <select
                        value={approvalStatus}
                        onChange={(e) => setApprovalStatus(e.target.value as 'Approve' | 'Return for Review')}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', fontWeight: 600, flex: 1, cursor: 'pointer', background: '#ffffff', color: '#1E293B' }}
                      >
                        <option value="Approve">Approve</option>
                        <option value="Return for Review">Return for Review</option>
                      </select>
                    </div>

                    {approvalStatus === 'Return for Review' && (
                      <div style={{ marginBottom: '16px' }}>
                        <textarea
                          placeholder="Reason for return..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', resize: 'none', height: '80px', boxSizing: 'border-box' }}
                        />
                      </div>
                    )}
                    
                    <Button
                      title="Confirm Final Approval"
                      variant="primary"
                      fullWidth
                      style={{ background: '#10B981', borderColor: '#10B981' }}
                      onClick={() => setShowApprovalModal(true)}
                    />
                  </Card>
                )}
              </div>
            </div>

            {/* Modal for Invoice Details (Nested inside this View modal portal) */}
            {selectedInvoiceForModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => setSelectedInvoiceForModal(null)}>
                <div style={{ background: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>Invoice Details</h3>
                    <button onClick={() => setSelectedInvoiceForModal(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center' }}><i className="ti ti-x" /></button>
                  </div>

                  <div style={{ maxHeight: 'calc(90vh - 100px)', overflowY: 'auto' }}>
                    <PaymentsErrorBoundary>
                      <InvoiceDocument invoice={selectedInvoiceForModal} />
                    </PaymentsErrorBoundary>
                  </div>
                </div>
              </div>
            )}

            {/* Modal for Proof of Payment (Nested inside this View modal portal) */}
            {showProofModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => setShowProofModal(false)}>
                <div style={{ background: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '500px', padding: '24px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A' }}>Proof of Payment</h3>
                    <button onClick={() => setShowProofModal(false)} style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}><i className="ti ti-x" /></button>
                  </div>
                  
                  <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {viewPayment.proofOfPaymentUrl ? (
                      <img src={viewPayment.proofOfPaymentUrl} alt="Proof of Payment" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #E2E8F0' }} />
                    ) : (
                      <>
                        <i className="ti ti-file-invoice" style={{ fontSize: '48px', color: '#CBD5E1' }} />
                        <div style={{ fontWeight: 700, color: '#475569', fontSize: '15px' }}>
                          {`${viewPayment.paymentMethod?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'receipt'}-${viewPayment.invoiceNumber?.toLowerCase() || viewPayment.referenceNumber?.toLowerCase() || '0001'}.jpg`}
                        </div>
                      </>
                    )}
                    <div style={{ color: '#64748B', fontSize: '13px', marginTop: '8px' }}>uploaded by {viewPayment.recordedBy || 'System'}</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#64748B' }}>Reference Number</span>
                      <span style={{ fontSize: '13px', color: '#0D9488', fontWeight: 800 }}>{viewPayment.referenceNumber || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#64748B' }}>Amount on receipt</span>
                      <span style={{ fontSize: '13px', color: '#0D9488', fontWeight: 800 }}>₱{Number(viewPayment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#64748B' }}>Uploaded</span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>{safeFormatDate(viewPayment.recordedAt || new Date())}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <Button
                      title="Close"
                      variant="secondary"
                      onClick={() => setShowProofModal(false)}
                      style={{ flex: 1, padding: '12px', fontWeight: 700 }}
                    />
                    <Button
                      title="Download"
                      variant="primary"
                      icon="ti-arrow-down"
                      onClick={() => {
                        if (viewPayment.proofOfPaymentUrl) {
                          window.open(viewPayment.proofOfPaymentUrl, '_blank');
                        } else {
                          toast.info('No file available to download.');
                        }
                      }}
                      style={{ flex: 1, padding: '12px', fontWeight: 700, background: '#10B981', borderColor: '#10B981' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Modal for Final Approval Confirmation (Nested inside this View modal portal) */}
            {showApprovalModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => setShowApprovalModal(false)}>
                <div style={{ background: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '24px', color: '#334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '20px' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>Confirm Action</h3>
                    <button onClick={() => setShowApprovalModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center' }}><i className="ti ti-x" /></button>
                  </div>
                  
                  <div style={{ fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>
                    You are about to <strong style={{ color: approvalStatus === 'Approve' ? '#10B981' : '#F59E0B' }}>{approvalStatus}</strong> this payment record. Do you want to proceed?
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <Button
                      title="Cancel"
                      variant="secondary"
                      onClick={() => setShowApprovalModal(false)}
                    />
                    <Button
                      title="Confirm"
                      variant="primary"
                      onClick={() => {
                        setShowApprovalModal(false);
                        handleFMSubmit(viewPayment);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {paymentIdParam && actionParam === 'receipt' && viewPayment && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999, padding: '24px' }} onClick={() => navigate('/payments')}>
          <div style={{ background: '#F8FAFC', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            
            {/* STICKY HEADER */}
            <div style={{ position: 'sticky', top: 0, background: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', zIndex: 10, borderTopLeftRadius: '12px', borderTopRightRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
                <button 
                  onClick={() => navigate('/payments')} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: '50%', color: '#64748B', transition: 'background 0.2s', marginRight: '-8px' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'} 
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  title="Close and Go Back"
                >
                  <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>PAYMENT STATUS</span>
                  <span style={{ color: '#D97706', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: '#FEF3C7', display: 'flex', padding: '2px', borderRadius: '50%' }}><i className="ti ti-alert-circle" style={{ color: '#D97706', fontSize: '14px' }} /></span> Issued OR
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>INVOICE STATUS</span>
                  <span style={{ color: '#059669', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: '#D1FAE5', display: 'flex', padding: '2px', borderRadius: '50%' }}><i className="ti ti-check" style={{ color: '#059669', fontSize: '14px' }} /></span> Paid
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>DATE ISSUED</span>
                  <span style={{ color: '#0F172A', fontWeight: 700, fontSize: '13px' }}>{safeFormatDate(viewPayment.recordedAt || new Date())}</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button onClick={(e) => { e.stopPropagation(); toast.info(`Downloading PDF Official Receipt for ${viewPayment.invoiceNumber}...`, 'Download Started'); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0D9488', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                  <i className="ti ti-printer" style={{ fontSize: '16px' }} /> Print / PDF
                </button>
              </div>
            </div>

            {/* RECEIPT BODY */}
            <div style={{ padding: '24px' }}>
              <div style={{ background: '#fff', padding: '48px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', border: '1px solid #E2E8F0', position: 'relative', overflow: 'hidden', minHeight: '500px' }}>
                
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', color: '#0F172A', fontWeight: 800 }}>Speedex Courier & Forwarder, Inc.</h2>
                  <p style={{ margin: 0, color: '#64748B', fontSize: '0.85rem' }}>123 Rizal St, Brgy. Poblacion, Cebu City</p>
                </div>
                
                <h1 style={{ textAlign: 'center', margin: '0 0 40px', fontSize: '1.6rem', letterSpacing: '0.4em', color: '#0F172A', fontWeight: 800 }}>R E C E I P T</h1>
                
                <div style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%) rotate(-15deg)', fontSize: '140px', fontWeight: 900, color: 'rgba(239, 68, 68, 0.08)', pointerEvents: 'none', zIndex: 0, letterSpacing: '0.1em' }}>PAID</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', fontSize: '0.85rem', color: '#475569', position: 'relative', zIndex: 1 }}>
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ color: '#94A3B8' }}>Receipt #:</span>
                      <strong style={{ color: '#0F172A' }}>{viewPayment.orNumber || `OR-2026-0001`}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ color: '#94A3B8' }}>Issue Date:</span>
                      <strong style={{ color: '#0F172A' }}>{safeFormatDate(viewPayment.recordedAt || new Date())}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ color: '#94A3B8' }}>Payment Method:</span>
                      <strong style={{ color: '#0F172A' }}>{viewPayment.paymentMethod || 'N/A'}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ color: '#94A3B8' }}>Reference #:</span>
                      <strong style={{ color: '#0F172A' }}>{viewPayment.referenceNumber || 'CHK-999888'}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#94A3B8', marginBottom: '6px' }}>Received From:</div>
                    <strong style={{ display: 'block', color: '#0F172A', fontSize: '1.05rem', marginBottom: '6px' }}>{viewPayment.clientName || 'Shopee Express'}</strong>
                    <div style={{ color: '#64748B', marginBottom: '4px' }}>Code: {viewPayment.clientId || 'CL-002'}</div>
                    <div style={{ color: '#64748B' }}>Invoice No: {viewPayment.invoiceNumber || 'LZD-2026-0002'}</div>
                  </div>
                </div>

                <div style={{ marginTop: '50px', position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #CBD5E1', paddingBottom: '12px', marginBottom: '16px', fontWeight: 700, color: '#0F172A' }}>
                    <span>Description</span>
                    <span>Total</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px', color: '#475569' }}>
                    <span>Full payment for logistics and delivery services covered by Invoice No. {viewPayment.invoiceNumber}</span>
                    <strong style={{ color: '#0F172A', fontSize: '1.1rem' }}>₱{Number(viewPayment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );

};

export const Payments = () => (
  <PaymentsErrorBoundary>
    <PaymentsContent />
  </PaymentsErrorBoundary>
);

export default Payments;
