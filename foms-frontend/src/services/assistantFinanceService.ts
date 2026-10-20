import { http } from './apiClient';

export interface AsstFinanceDashboardData {
  pendingLiquidations: number;
  returnedLiquidations: number;
  endorsedLiquidations: number;
  totalLiquidationAmount: number;
  totalReimbursements: number;
  flaggedDuplicates: number;
  uniqueDocuments: number;
  totalScans: number;
  validScans: number;
  rejectedScans: number;
  liquidationReports: {
    totalSubmitted: number;
    pendingCount: number;
    validatedCount: number;
    returnedCount: number;
    totalAmount: number;
    weeklyTrend: Array<{ day: string; date: string; validated: number; pending: number; returned: number }>;
    monthlyTrend: Array<{ day: string; date: string; year?: number; validated: number; pending: number; returned: number }>;
    recentItems: Array<{
      id: string;
      referenceNumber: string;
      submittedByName: string;
      totalAmount: number;
      reimbursementAmount: number;
      status: string;
      dateSubmitted: string;
    }>;
  };
  duplicateScan: {
    totalScans: number;
    validScans: number;
    rejectedScans: number;
    guardrailStatus: string;
    recentScans: Array<{
      id: number;
      fileName: string;
      detectedType: string;
      isAllowed: boolean;
      status: string;
      reason: string;
      timestamp: string;
    }>;
  };
  uniqueDocumentsSection: {
    total: number;
    items: Array<{
      id: string;
      documentNumber: string;
      status: string;
      reviewer: string;
      decisionReason: string;
      reviewedDate: string;
    }>;
  };
  flaggedDuplicatesSection: {
    total: number;
    items: Array<{
      id: string;
      documentNumber: string;
      status: string;
      reviewer: string;
      decisionReason: string;
      similarity: number;
      reviewedDate: string;
    }>;
  };
  reviewHistory: {
    total: number;
    items: Array<{
      id: string;
      documentNumber: string;
      finalDecision: string;
      reviewer: string;
      decisionReason: string;
      reviewedDate: string;
    }>;
  };
  reports: {
    totalAvailable: number;
    endorsedReportsCount: number;
    totalLiquidatedExpense: number;
  };
  aiOutputHistory: {
    total: number;
    items: Array<{
      outputId: number;
      outputType: string;
      sourceReference: string;
      processingStatus: string;
      modelName: string;
      version: string;
      message: string;
      createdAt: string;
    }>;
  };
  recentActivities: Array<{
    id: number;
    action: string;
    module: string;
    actor: string;
    remarks: string;
    timestamp: string;
  }>;
}

export const assistantFinanceService = {
  getDashboard: async (): Promise<{ success: boolean; data: AsstFinanceDashboardData }> => {
    return http.get<{ success: boolean; data: AsstFinanceDashboardData }>('/assistant-finance-manager/dashboard');
  },
  getLiquidations: async (status?: string, page: number = 1, pageSize: number = 50) => {
    return http.get<any>('/assistant-finance-manager/liquidations', { status, page, pageSize });
  },
  getLiquidationById: async (id: number | string) => {
    return http.get<any>(`/assistant-finance-manager/liquidations/${id}`);
  },
  reviewLiquidation: async (id: number | string) => {
    return http.post<any>(`/assistant-finance-manager/liquidations/${id}/review`, {});
  },
  returnLiquidation: async (id: number | string, remarks: string) => {
    return http.post<any>(`/assistant-finance-manager/liquidations/${id}/return`, { remarks });
  },
  endorseLiquidation: async (id: number | string) => {
    return http.post<any>(`/assistant-finance-manager/liquidations/${id}/endorse`, {});
  },
  softDeleteLiquidation: async (id: number | string): Promise<{ success: boolean; message: string }> => {
    return http.delete<{ success: boolean; message: string }>(`/assistant-finance-manager/liquidations/${id}`);
  },
  getScanHistory: async (page: number = 1, pageSize: number = 50) => {
    return http.get<any>('/assistant-finance-manager/ai/duplicate-scan/history', { page, pageSize });
  },
  getUniqueDocuments: async (page: number = 1, pageSize: number = 50) => {
    return http.get<any>('/assistant-finance-manager/ai/unique-documents', { page, pageSize });
  },
  getFlaggedDuplicates: async (page: number = 1, pageSize: number = 50) => {
    return http.get<any>('/assistant-finance-manager/ai/flagged-duplicates', { page, pageSize });
  },
  markDuplicate: async (alertId: string, remarks?: string) => {
    return http.post<any>(`/assistant-finance-manager/ai/flagged-duplicates/${alertId}/mark-duplicate`, { remarks });
  },
  markUnique: async (alertId: string, remarks?: string) => {
    return http.post<any>(`/assistant-finance-manager/ai/flagged-duplicates/${alertId}/mark-unique`, { remarks });
  },
  returnDuplicateForReview: async (alertId: string, remarks: string) => {
    return http.post<any>(`/assistant-finance-manager/ai/flagged-duplicates/${alertId}/return-for-review`, { remarks });
  },
  endorseFlaggedDuplicate: async (alertId: string) => {
    return http.post<any>(`/assistant-finance-manager/ai/flagged-duplicates/${alertId}/endorse`, {});
  },
  getReviewHistory: async (page: number = 1, pageSize: number = 50) => {
    return http.get<any>('/assistant-finance-manager/review-history', { page, pageSize });
  },
  softDeleteReviewHistory: async (id: number | string): Promise<{ success: boolean; message: string }> => {
    return http.delete<{ success: boolean; message: string }>(`/assistant-finance-manager/ai/review-history/${id}`);
  },
  generateReport: async (payload: { reportType: string; dateFrom?: string; dateTo?: string; status?: string }) => {
    return http.post<any>('/assistant-finance-manager/reports/generate', payload);
  },
  getAiOutputHistory: async (page: number = 1, pageSize: number = 50) => {
    return http.get<any>('/assistant-finance-manager/ai/output-history', { page, pageSize });
  },
};

export default assistantFinanceService;
