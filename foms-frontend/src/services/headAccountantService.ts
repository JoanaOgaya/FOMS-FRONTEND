import { http } from './apiClient';

export interface HeadAccountantDashboardData {
  totalInvoices: number;
  pendingInvoices: number;
  pendingPayments: number;
  pendingAdjustments: number;
  speedPayPending: number;
  accountsReceivableTotal: number;
  overdueInvoices: number;
  recentActivities: Array<{
    id: number;
    action: string;
    module: string;
    actor: string;
    remarks: string;
    timestamp: string;
  }>;
}

export const headAccountantService = {
  getDashboard: async (): Promise<HeadAccountantDashboardData> => {
    const res = await http.get<{ success: boolean; data: HeadAccountantDashboardData }>('/head-accountant/dashboard');
    return res.data;
  },

  getInvoices: async () => {
    const res = await http.get<{ success: boolean; data: any[]; count: number }>('/head-accountant/invoices');
    return res.data;
  },

  getBillingValidation: async () => {
    const res = await http.get<{ success: boolean; data: any[]; count: number }>('/head-accountant/billing-validation');
    return res.data;
  },

  approveBilling: async (id: number) => {
    return http.post<{ success: boolean; message: string }>(`/head-accountant/billing-validation/${id}/approve`, {});
  },

  rejectBilling: async (id: number) => {
    return http.post<{ success: boolean; message: string }>(`/head-accountant/billing-validation/${id}/reject`, {});
  },

  returnBilling: async (id: number) => {
    return http.post<{ success: boolean; message: string }>(`/head-accountant/billing-validation/${id}/return`, {});
  },
};
