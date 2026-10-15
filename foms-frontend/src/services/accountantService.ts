import { http } from './apiClient';

export interface AccountantDashboardData {
  totalInvoicesCreated: number;
  pendingBillingValidation: number;
  accountsReceivableTotal: number;
  pendingPayments: number;
  speedPayPending: number;
  flaggedDuplicates: number;
  recentActivities: Array<{
    id: number;
    action: string;
    module: string;
    actor: string;
    remarks: string;
    timestamp: string;
  }>;
}

export const accountantService = {
  getDashboard: async (): Promise<{ success: boolean; data: AccountantDashboardData }> => {
    return http.get<{ success: boolean; data: AccountantDashboardData }>('/accountant/dashboard');
  },
  getClients: async () => {
    return http.get<any>('/accountant/clients');
  },
  getInvoices: async () => {
    return http.get<any>('/accountant/invoices');
  },
  getEligibleClients: async () => {
    return http.get<any>('/accountant/invoices/eligible-clients');
  },
  createInvoice: async (payload: { clientId: number }) => {
    return http.post<any>('/accountant/invoices/create', payload);
  },
  getBillingValidation: async () => {
    return http.get<any>('/accountant/billing-validation');
  },
  submitBillingValidation: async (id: number | string) => {
    return http.post<any>(`/accountant/billing-validation/${id}/submit`, {});
  },
  returnBillingValidation: async (id: number | string) => {
    return http.post<any>(`/accountant/billing-validation/${id}/return`, {});
  },
  getAccountsReceivable: async () => {
    return http.get<any>('/accountant/accounts-receivable');
  },
  getPayments: async () => {
    return http.get<any>('/accountant/payments');
  },
  recordPayment: async (payload: { invoiceId: number; amount: number; paymentMethod?: string; referenceNumber?: string }) => {
    return http.post<any>('/accountant/payments/record', payload);
  },
  getPaymentHistory: async (invoiceId: number | string) => {
    return http.get<any>(`/accountant/payments/history/${invoiceId}`);
  },
  getSpeedPayValidation: async () => {
    return http.get<any>('/accountant/speedpay-validation');
  },
  getOfficialReceipts: async () => {
    return http.get<any>('/accountant/official-receipts');
  },
  getSettlements: async () => {
    return http.get<any>('/accountant/settlements');
  },
  recordSettlement: async (payload: { courierName?: string; tripRef?: string; recordType?: string; amount: number }) => {
    return http.post<any>('/accountant/record-settlement', payload);
  },
  getFinancialAdjustments: async () => {
    return http.get<any>('/accountant/financial-adjustments');
  },
  createFinancialAdjustment: async (payload: { invoiceId: number; adjustmentType?: string; amount: number; reason?: string }) => {
    return http.post<any>('/accountant/financial-adjustments', payload);
  },
  getUniqueDocuments: async () => {
    return http.get<any>('/accountant/ai/unique-documents');
  },
  getFlaggedDuplicates: async () => {
    return http.get<any>('/accountant/ai/flagged-duplicates');
  },
  getReviewHistory: async () => {
    return http.get<any>('/accountant/review-history');
  },
  generateReport: async (payload: object) => {
    return http.post<any>('/accountant/reports/generate', payload);
  },
  getAiOutputHistory: async () => {
    return http.get<any>('/accountant/ai/output-history');
  },
};

export default accountantService;
