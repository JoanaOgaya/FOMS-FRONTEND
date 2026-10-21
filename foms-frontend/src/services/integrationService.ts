import { http } from './apiClient';
import { invalidateQueries } from '../hooks/useQuery';

export interface CoordinatorRoutingMetric {
  coordinatorId: string;
  fullName: string;
  activeTasksCount: number;
  overdueTasksCount: number;
  completedTasksCount: number;
  workloadScore: number;
  availabilityPercentage: number;
  isOptimalCandidate: boolean;
}

export interface StarsCollectionTask {
  taskId: number;
  taskNumber: string;
  taskType: string;
  invoiceNumber: string;
  clientName: string;
  amountDue: number;
  daysOverdue: number;
  assignedCoordinatorId: string;
  assignedCoordinatorName: string;
  routingScore: number;
  routingReason: string;
  status: 'Assigned' | 'In Progress' | 'Completed' | 'Escalated' | string;
  actionTaken?: string | null;
  outcome?: string | null;
  promisedPaymentDate?: string | null;
  executionNotes?: string | null;
  executedAt?: string | null;
  executedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StarsCollectionExecutionDto {
  actionTaken: string;
  outcome: string;
  promisedPaymentDate?: string;
  executionNotes?: string;
  executedBy?: string;
}

export interface StarsCollectionTaskRequestDto {
  invoiceNumber: string;
  clientName: string;
  amountDue: number;
  daysOverdue: number;
}

export interface DmsDeliveryCompletedDto {
  waybillNumber: string;
  clientCode?: string;
  clientId?: number;
  clientName?: string;
  origin?: string;
  destination?: string;
  deliveryArea: string;
  actualWeight: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  numberOfBoxes?: number;
  declaredValue?: number;
  podUrl: string;
  podStatus?: string;
  recipientName?: string;
  deliveryDate?: string;
  driverName?: string;
  autoGenerateInvoice?: boolean;
}

export interface DmsDeliveryFailedDto {
  waybillNumber: string;
  failureReason: string;
  attemptCount: number;
  driverName?: string;
  remarks?: string;
  failedAt?: string;
}

export interface DmsRedeliveryCompletedDto {
  waybillNumber: string;
  podUrl: string;
  recipientName?: string;
  driverName?: string;
  completedAt?: string;
  remarks?: string;
}

export interface CashAdvanceItem {
  advanceId: string;
  courierName: string;
  tripReference: string;
  amountGiven: number;
  releaseDate?: string;
  releasedBy?: string;
  status: string; // 'Pending Finance Review' | 'Approved' | 'Disbursed' | 'Liquidated'
  notes?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  disbursedBy?: string | null;
  disbursedAt?: string | null;
  createdAt?: string;
}

export interface DmsLiquidationItemDto {
  description: string;
  amount: number;
  receiptUrl?: string;
}

export interface DmsLiquidationDto {
  referenceNumber?: string;
  cashAdvanceId: string;
  courierName?: string;
  submittedByName?: string;
  tripReference?: string;
  totalExpenses: number;
  leftoverCash?: number;
  reimbursementAmount?: number;
  expenses: DmsLiquidationItemDto[];
  documentUrls: string[];
  remarks?: string;
}

// Pre-shared 256-bit API key for DMS integration calls
const dmsConfig = {
  headers: {
    'X-Api-Key':
      import.meta.env.VITE_DMS_TO_FOMS_KEY ||
      'b84a1182dcd51ea1ee102585f61b0ed0dd779121b44fe42723fa789438e5e613',
  },
};

export const integrationService = {
  // ─── STARS Collection Workflow ──────────────────────────────────────────
  getRoutingMetrics: async (): Promise<CoordinatorRoutingMetric[]> => {
    return await http.get<CoordinatorRoutingMetric[]>('/api/integration/stars/routing-metrics');
  },

  getCollectionTasks: async (status?: string): Promise<StarsCollectionTask[]> => {
    const params = status ? { status } : undefined;
    return await http.get<StarsCollectionTask[]>('/api/integration/stars/collection-tasks', params);
  },

  createCollectionTask: async (dto: StarsCollectionTaskRequestDto) => {
    const res = await http.post<{ isSuccess: boolean; message: string; data?: StarsCollectionTask }>(
      '/api/integration/stars/collection-task',
      dto
    );
    invalidateQueries('stars:tasks');
    invalidateQueries('stars:routing');
    invalidateQueries('invoices');
    invalidateQueries('ar');
    return res;
  },

  executeCollectionTask: async (taskId: number, dto: StarsCollectionExecutionDto) => {
    const res = await http.post<{ isSuccess: boolean; message: string; data?: StarsCollectionTask }>(
      `/api/integration/stars/collection-task/${taskId}/execute`,
      dto
    );
    invalidateQueries('stars:tasks');
    invalidateQueries('stars:routing');
    invalidateQueries('invoices');
    invalidateQueries('ar');
    return res;
  },

  triggerEndorsement: async (invoiceNo: string, remarks?: string) => {
    const res = await http.post<{ isSuccess: boolean; message: string; data?: any }>(
      `/api/integration/stars/trigger-endorsement/${encodeURIComponent(invoiceNo)}`,
      {},
      { params: { remarks } }
    );
    invalidateQueries('invoices');
    return res;
  },

  triggerStatusSync: async (invoiceNo: string) => {
    const res = await http.post<{ isSuccess: boolean; message: string }>(
      `/api/integration/stars/trigger-status-sync/${encodeURIComponent(invoiceNo)}`,
      {}
    );
    invalidateQueries('invoices');
    invalidateQueries('ar');
    return res;
  },

  triggerOverdueAlert: async (invoiceNo: string) => {
    const res = await http.post<{ isSuccess: boolean; message: string }>(
      `/api/integration/stars/trigger-overdue-alert/${encodeURIComponent(invoiceNo)}`,
      {}
    );
    invalidateQueries('stars:tasks');
    invalidateQueries('stars:routing');
    invalidateQueries('invoices');
    invalidateQueries('ar');
    return res;
  },

  // ─── DMS ↔ FOMS #1 & #2 (Deliveries, Rates, Invoices & Holds) ───────────

  submitDeliveryCompleted: async (dto: DmsDeliveryCompletedDto) => {
    const payload = {
      ...dto,
      podImageUrl: dto.podUrl,
    };
    const res = await http.post<{ isSuccess: boolean; message: string; data?: any }>(
      '/api/integration/dms/delivery-completed',
      payload,
      dmsConfig
    );
    invalidateQueries('waybills');
    invalidateQueries('billing:waybills');
    invalidateQueries('billing:records');
    invalidateQueries('invoices');
    invalidateQueries('ar');
    invalidateQueries('dashboard');
    return res;
  },

  submitDeliveryFailed: async (dto: DmsDeliveryFailedDto) => {
    const res = await http.post<{ isSuccess: boolean; message: string; data?: any }>(
      '/api/integration/dms/delivery-failed',
      dto,
      dmsConfig
    );
    invalidateQueries('waybills');
    invalidateQueries('billing:waybills');
    invalidateQueries('invoices');
    return res;
  },

  submitRedeliveryCompleted: async (dto: DmsRedeliveryCompletedDto) => {
    const payload = {
      ...dto,
      newPodImageUrl: dto.podUrl,
      updatedStatus: 'Completed',
    };
    let res: any;
    try {
      res = await http.post<{ isSuccess: boolean; message: string; data?: any }>(
        '/api/integration/dms/delivery-redelivered',
        payload,
        dmsConfig
      );
    } catch {
      res = await http.post<{ isSuccess: boolean; message: string; data?: any }>(
        '/api/integration/dms/redelivery-completed',
        dto,
        dmsConfig
      );
    }
    invalidateQueries('waybills');
    invalidateQueries('billing:waybills');
    invalidateQueries('invoices');
    invalidateQueries('ar');
    return res;
  },

  // ─── DMS ↔ FOMS #3 (Cash Advances & Liquidations) ───────────────────────
  getCashAdvances: async (status?: string): Promise<CashAdvanceItem[]> => {
    const params = status ? { status } : undefined;
    const res = await http.get<any>('/api/cash-advances', params);
    if (res && res.items && Array.isArray(res.items)) return res.items;
    if (Array.isArray(res)) return res;
    return [];
  },

  submitCashAdvance: async (dto: Partial<CashAdvanceItem>) => {
    const payload = {
      ...dto,
      requestId: dto.advanceId || `ADV-${Date.now()}`,
      deliveryReference: dto.tripReference,
      requesterName: dto.courierName,
      purpose: dto.tripReference || 'Delivery Trip Cash Advance',
      requestedAmount: dto.amountGiven,
    };
    let res: any;
    try {
      res = await http.post<{ isSuccess: boolean; message: string; data?: CashAdvanceItem }>(
        '/api/integration/dms/cash-advance-request',
        payload,
        dmsConfig
      );
    } catch {
      res = await http.post<{ isSuccess: boolean; message: string; data?: CashAdvanceItem }>(
        '/api/integration/dms/cash-advance',
        dto,
        dmsConfig
      );
    }
    invalidateQueries('cashAdvances');
    invalidateQueries('cashflow');
    return res;
  },

  approveCashAdvance: async (id: string, reviewerName?: string, remarks?: string) => {
    const res = await http.post<{ isSuccess: boolean; message: string; data?: CashAdvanceItem }>(
      `/api/cash-advances/${encodeURIComponent(id)}/approve`,
      { reviewerName, remarks }
    );
    invalidateQueries('cashAdvances');
    invalidateQueries('cashflow');
    return res;
  },

  rejectCashAdvance: async (id: string, reviewerName?: string, reason?: string) => {
    const res = await http.post<{ isSuccess: boolean; message: string; data?: CashAdvanceItem }>(
      `/api/cash-advances/${encodeURIComponent(id)}/reject`,
      { reviewerName, reason }
    );
    invalidateQueries('cashAdvances');
    return res;
  },

  disburseCashAdvance: async (
    id: string,
    disbursedBy?: string,
    disbursementMethod?: string,
    voucherNumber?: string
  ) => {
    const res = await http.post<{ isSuccess: boolean; message: string; data?: CashAdvanceItem }>(
      `/api/cash-advances/${encodeURIComponent(id)}/disburse`,
      { disbursedBy, disbursementMethod, voucherNumber }
    );
    invalidateQueries('cashAdvances');
    invalidateQueries('cashflow');
    invalidateQueries('dashboard');
    return res;
  },

  submitDmsLiquidation: async (dto: DmsLiquidationDto) => {
    let res: any;
    try {
      res = await http.post<{ isSuccess: boolean; message: string; data?: any }>(
        '/api/integration/dms/liquidation-submission',
        dto,
        dmsConfig
      );
    } catch {
      res = await http.post<{ isSuccess: boolean; message: string; data?: any }>(
        '/api/integration/dms/liquidation',
        dto,
        dmsConfig
      );
    }
    invalidateQueries('liquidations');
    invalidateQueries('cashAdvances');
    invalidateQueries('cashflow');
    return res;
  },

  actOnLiquidation: async (id: string, action: string, remarks?: string) => {
    const res = await http.post<{ isSuccess: boolean; message: string; data?: any }>(
      `/api/liquidations/${encodeURIComponent(id)}/act`,
      { action, remarks }
    );
    invalidateQueries('liquidations');
    invalidateQueries('cashAdvances');
    invalidateQueries('cashflow');
    return res;
  },
};
