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
  softDeleteLiquidation: async (id: number | string): Promise<{ success: boolean; message: string }> => {
    return http.delete<{ success: boolean; message: string }>(`/assistant-finance-manager/liquidations/${id}`);
  },
  softDeleteReviewHistory: async (id: number | string): Promise<{ success: boolean; message: string }> => {
    return http.delete<{ success: boolean; message: string }>(`/assistant-finance-manager/ai/review-history/${id}`);
  },
};

export default assistantFinanceService;
