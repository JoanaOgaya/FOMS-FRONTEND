/**
 * Entity types — one interface per backend entity. Types only; no data lives here.
 */




export { Role, ROLES } from './auth';

// ─── Clients ──────────────────────────────────────────────────────

export interface Client {
  id: string;
  clientId?: string;
  clientCode?: string;
  name: string;
  businessName?: string;
  rateType?: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  creditLimit?: number;
  tin?: string | null;
  archived?: boolean;
  region: 'Luzon' | 'Visayas' | 'Mindanao' | 'Metro Manila';
  serviceArea?: string;
  billingSchedule: 'Monthly' | 'Semi-monthly' | 'Weekly';
  status: 'Active' | 'Inactive';
  vatStatus: 'VATable' | 'Non-VATable';
  vatRate: number | null;
  createdAt: string;
}


// ─── Billing Rates ────────────────────────────────────────────────

export interface BillingRate {
  id: string;
  clientId: string;
  region: 'NCR' | 'Luzon' | 'Visayas' | 'Mindanao' | 'ODA';
  minimumWeight: number;
  minimumRate: number;
  excessRate: number;
  valuationRate: number;
  fuelSurchargeRate: number;
  vatRate: number;
  effectiveDate: string;
  status: 'Active' | 'Inactive';
}


// ─── Billing Records ──────────────────────────────────────────────

export type BillingRecordStatus = 'Pending Review' | 'Approved' | 'Returned';

export interface BillingRecord {
  id: string;
  waybillId: string;
  clientId: string;
  rateId: string; // Rate configuration used
  
  volumeWeight: number;
  actualWeight: number;
  chargeableWeight: number;
  
  freightCost: number;
  valuation: number;
  odaCharge: number;
  subtotal: number;
  vat: number;
  fuelSurcharge: number;
  grandTotal: number;

  status: BillingRecordStatus;
  remarks?: string;
  computedBy: string;
  computedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}


// ─── Waybills ─────────────────────────────────────────────────────

export type WaybillStatus = 'For Checking' | 'Validated' | 'Validated (CTC)' | 'Missing' | 'Pending' | 'Billed' | 'Failed' | 'Pending Validation' | 'Returned' | 'Not Completed';

export interface Waybill {
  id: string;
  waybillNumber: string;
  clientCode: string;
  deliveryDate: string;
  status: WaybillStatus;
  hasOriginalPOD: boolean;
  hasApprovedCTC: boolean;
  encodedBy: string;
  encodedAt: string;
  destinationArea?: string;
  clientId?: string;
  clientName?: string;
  
  // Verification features
  pod_image_url?: string;
  uploaded_by?: string;
  uploaded_date?: string;
  is_ctc?: boolean;
  certified_by?: string;
  certification_date?: string;
  reason_for_missing?: string;
  invoiceId?: string | null;
  notes?: string;

  // Extended Waybill Details
  senderName?: string;
  senderContact?: string;
  senderAddress?: string;
  receiverName?: string;
  receiverContact?: string;
  receiverAddress?: string;
  itemDescription?: string;
  itemQuantity?: number; // Number of boxes
  itemWeight?: string | number; // Actual weight in kg
  itemDimensions?: { length: number; width: number; height: number };
  deliveryType?: 'Delivery' | 'Pick Up';
  assignedCourier?: string;
  specialInstructions?: string;
  declaredValue?: number;
  isODA?: boolean; // Outside Delivery Area
  actualWeight?: number;
  chargeableWeight?: number;
  isBilled?: boolean;
  podStatus?: string;
  deliveryStatus?: string;
  deliveryArea?: string;
}


// ─── Invoices ─────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceNo?: string;
  clientId: string;
  clientName?: string;
  waybillIds: string[];
  amount: number;
  vatAmount: number;
  surchargeAmount: number;
  totalAmount: number;
  amountPaid?: number;
  balance?: number;
  billingSchedule: 'Monthly' | 'Semi-monthly' | 'Weekly';
  billingPeriod: string;
  status: 'Draft' | 'Pending Approval' | 'Needs Revision' | 'Approved' | 'Sent' | 'Paid' | 'Overdue' | 'Outstanding';
  paymentStatus?: 'Unpaid' | 'Due Soon' | 'Overdue' | 'Outstanding' | 'Paid';
  createdBy: string;
  createdAt: string;
  dueDate: string;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  finalizedAt?: string;
  notes?: string;
  proofFileUrl?: string;
  clientReceiptDate?: string;
  appliedRates?: any[];
}


// ─── Payments ────────────────────────────────────────────────────

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  clientId: string;
  clientName?: string;
  amount: number;
  flow: 'outflow' | 'inflow';
  paymentMethod: 'Check' | 'Cash' | 'Bank Transfer' | 'Online Bank Transfer' | 'GCash' | 'Maya';
  referenceNumber: string;
  bankConfirmed: boolean;
  proofOfPaymentUrl?: string;
  recordedBy: string;
  recordedAt: string;
  validatedBy?: string;
  validatedAt?: string;
  status: 'Pending Validation' | 'Validated' | 'Approved' | 'Rejected';
  notes?: string;
  orNumber?: string;
  depositSlipDetails?: string;
  bankTransferDetails?: string;
  onlinePaymentDetails?: string;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  referenceNumber?: string;
  paymentId: string;
  clientId: string;
  clientName?: string;
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
  issuedAt: string;
  issuedBy: string;
  paymentMethod: string;
  status: 'Issued' | 'Cancelled' | 'Issued OR';
  notes?: string;
}


// ─── Accounts Receivable ──────────────────────────────────────────

export interface ARRecord {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  clientId: string;
  invoiceDate: string;
  dueDate: string;
  originalAmount: number;
  paidAmount: number;
  outstandingBalance: number;
  agingBracket: 'Current' | '0-30 days' | '31-60 days' | '61-90 days' | '90+ days';
  agingDays: number;
  status: 'Current' | 'Due Soon' | 'Overdue' | 'Outstanding';
}

export type AccountsReceivableRecord = ARRecord;


// ─── SpeedPay Submissions ─────────────────────────────────────────

export interface SpeedPaySubmission {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  clientId?: string;
  clientName: string;
  clientEmail: string;
  paymentMethod: 'GCash' | 'Maya' | 'BDO Online' | 'BPI Online';
  referenceNumber: string;
  amountPaid: number;
  proofFileName: string;
  proofFileUrl?: string;
  submittedAt: string;
  status: 'Pending Validation' | 'Validated' | 'Rejected';
  validatedBy?: string;
  validatedAt?: string;
  rejectionReason?: string;
}


// ─── Audit Trail ─────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userFullName: string;
  userRole: string;
  action: string;
  module: string;
  recordId: string;
  recordType: string;
  details: string;
  ipAddress: string;
}


// ─── Extended Invoice Data for Modals ─────────────────────────────

export interface ExtendedInvoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientBillingAddress: string;
  clientContactDetails: string;
  billingSchedule: 'Weekly' | 'Semi-monthly' | 'Monthly';
  invoiceDate: string;
  dueDate: string;
  waybills: {
    waybillNumber: string;
    documentType: 'Original' | 'Certified True Copy';
    deliveryDate: string;
    deliveryArea: string;
    baseFreightRate: number;
  }[];
  financials: {
    totalBaseFreight: number;
    vatAmount: number;
    surcharges: number;
    invoiceGrossTotal: number;
    creditMemos: number;
    netOutstandingBalance: number;
    invoiceStatus: 'Unpaid' | 'Overdue' | 'Paid';
  };
}


// ─── Follow Up Logs ───────────────────────────────────────────────

export interface FollowUpRecord {
  id: string;
  invoiceId: string;
  referenceFields: {
    clientName: string;
    invoiceRefNumber: string;
    agingCategory: '0-30 days' | '31-60 days' | '61-90 days' | '90+ days';
    totalOutstandingAmount: number;
  };
  formInputs: {
    followUpTimestamp: string;
    communicationChannel: 'Phone Call' | 'Email' | 'SMS';
    clientContactPerson: string;
    clientPaymentStatus: 'Billing Approved/Processing Check' | 'Billing Under Review' | 'Check Ready for Pick-up' | 'Discrepancy Flagged by Client';
    expectedCollectionDate: string;
    actionRemarks: string;
    authorizedUserLogged: string;
  };
}

export const FOLLOW_UP_CHANNELS = ['Phone Call', 'Email', 'SMS'] as const;
export const FOLLOW_UP_STATUSES = ['Billing Approved/Processing Check', 'Billing Under Review', 'Check Ready for Pick-up', 'Discrepancy Flagged by Client'] as const;


// ─── Liquidations ──────────────────────────────────────────────────

export interface SpeedPayValidation {
  id: string;
  invoiceId: string;
  clientId: string;
  amountPaid: number;
  paymentMethod: string;
  referenceNumber: string;
  receiptUrl: string;
  status: 'Pending Validation' | 'Validated' | 'Rejected';
  submittedAt: string;
  remarks?: string;
  screenshotUrl?: string;
}

// ─── Financial Adjustment ──────────────────────────────────────────

export interface FinancialAdjustment {
  id: string;
  type: 'Adjustment' | 'Credit Memo';
  amount: number;
  reason: string;
  referenceNo: string;
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Recorded' | 'Submitted' | 'PendingFinanceManager' | 'ReturnedForRevision' | 'Returned' | string;
  affectedRecordId: string;
  clientId: string;
  createdAt: string;
  createdBy: string;
  remarks?: string;
  notes?: string;
  rejectionReason?: string;
}


// ─── Liquidations ──────────────────────────────────────────────────

export interface LiquidationExpense {
  type: 'Fuel' | 'Toll Fee' | 'Parking Fee' | 'Vehicle Maintenance' | 'Trip Expense' | 'Other';
  description: string;
  amount: number;
}

export interface Liquidation {
  id: string;
  // Primary fields (as returned by backend, both alias forms)
  reference?: string;
  referenceNumber?: string;
  amount?: number;
  totalAmount?: number;
  submittedBy?: string;
  submittedByName?: string;
  submittedAt?: string;
  dateSubmitted?: string;
  createdAt?: string;
  reimbursementAmount?: number;
  leftoverCash?: number;
  status: string;
  purpose?: string;
  notes?: string;
  remarks?: string;
  documents?: { name: string; url: string; size: string }[];
  expenses?: LiquidationExpense[];
}


// ─── Cash Flow Records ───────────────────────────────────────────

export interface CashFlowRecord {
  id: string;
  type: 'Inflow' | 'Outflow';
  amount: number;
  sourceReference: string;
  date: string;
  recordedBy: string;
  category?: string;
}


// ─── Settlements ───────────────────────────────────────────────────

export interface Settlement {
  id: string;
  type: 'Leftover return' | 'Reimbursement' | 'Expense liquidation' | string;
  courierName: string;
  tripRef: string;
  submittedAt: string;
  amount: number;
  discrepancy?: number;
  status: 'For validation' | 'Validated' | 'Rejected' | 'ReturnedForRevision' | 'Returned' | string;
  cashAdvance: number;
  totalExpenses: number;
  envelopeNo?: string;
  cashCounted?: number;
  recordedBy: string;
  recordedAt: string;
  rejectionReason?: string;
  remarks?: string;
}



// --- API envelope & shared shapes ---------------------------------

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  [extra: string]: string | number | undefined;
}

export interface Paged<T> {
  items: T[];
  total: number;
}

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
  type: 'info' | 'alert' | 'success' | 'system';
  category: string;
  link?: string;
  actionLabel?: string;
  waybillNo?: string;
  statusBadge?: string;
  source?: string;
}

export interface AppUserRecord {
  id: string;
  employeeNumber?: string;
  username?: string;
  fullName: string;
  email?: string;
  role: string;
  roleId?: string;
  phone?: string;
  salaryRate?: number;
  dateHired?: string;
  status: 'Active' | 'Inactive' | 'Locked' | 'Pending';
  isActive?: boolean;
  createdAt?: string;
}

export interface Report {
  id: string;
  name: string;
  type: string;
  generatedBy: string;
  generatedAt: string;
  downloadUrl?: string;
}

// --- Dashboard ----------------------------------------------------

export type KpiFormat = 'currency' | 'number' | 'percent';

export interface DashboardKpi {
  key: string;
  label: string;
  value: number | null;
  format: KpiFormat;
  icon?: string;
  variant?: 'teal' | 'success' | 'warning' | 'danger' | 'info' | 'new' | 'delivery';
  caption?: string;
  /** Percent change vs previous period; null when the API cannot compute it. */
  trend: number | null;
  path?: string;
}

export interface DashboardAttentionItem {
  id: string;
  severity: 'danger' | 'warning' | 'info';
  title: string;
  detail?: string;
  path: string;
}

export interface DashboardSummary {
  headline?: string;
  kpis: DashboardKpi[];
  attention: DashboardAttentionItem[];
  topClients: { id: string; name: string; amount: number }[];
  agingBuckets: { label: string; value: number }[];
  cashFlowTrend: { period: string; inflow: number; outflow: number }[];
  statusTrend: { period: string; validated: number; pending: number; returned: number }[];
  duplicateDistribution: { label: string; value: number }[];
  recentActivity: AuditLog[];
}

export interface FinanceManagerDashboardSummary {
  asOf: string;
  period: 'weekly' | 'monthly';
  clientId?: string;
  totalInvoicesBilled: number;
  totalInvoiceAmount: number;
  totalCollected: number;
  totalArOutstanding: number;
  collectionRate: number;
  cashInflowThisMonth: number;
  duplicateAlerts: number;
  accountsNearDueDate: number;
  cashFlowAnalytics: { period: string; inflow: number; outflow: number; net: number }[];
  agingBuckets: { label: string; value: number }[];
  topPayingClients: { clientId: string; clientName: string; amount: number }[];
  nearDueAccounts: {
    clientId: string;
    clientName: string;
    invoiceNumber: string;
    amountDue: number;
    dueDate: string;
    daysRemaining: number;
  }[];
  recentActivity: AuditLog[];
  insights: {
    id: string;
    type: 'collection' | 'duplicate' | 'liquidation';
    title: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    entityId?: string;
    targetRoute: string;
    createdAt: string;
  }[];
}

/** Sidebar badge counts keyed by module key (e.g. { invoiceReview: 4 }). */
export type NavBadges = Record<string, number>;
