import { http, ApiError } from './apiClient';
import type {
  ApprovalRequest,
  ApprovalStep,
  ApprovalCounts,
  CashAdvance,
  CashAdvanceCreatePayload,
} from '../types/approvals';

export interface PendingApprovalsParams {
  entityType?: string;
  status?: string;
  level?: string;
  page?: number;
  pageSize?: number;
}

export interface PendingApprovalsResponse {
  items: ApprovalRequest[];
  total: number;
}

export function formatApprovalErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return 'This record was already acted on by someone else.';
    }
    if (err.status === 403) {
      return 'You do not have permission to perform this action.';
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

export const approvalsService = {
  /**
   * Fetch approval items pending for current approver
   */
  async getPending(params?: PendingApprovalsParams): Promise<PendingApprovalsResponse> {
    const res = await http.get<PendingApprovalsResponse | ApprovalRequest[]>('/approvals/pending', params);
    if (Array.isArray(res)) {
      return { items: res, total: res.length };
    }
    return res;
  },

  /**
   * Fetch single approval request detail
   */
  async getById(id: string): Promise<ApprovalRequest> {
    return http.get<ApprovalRequest>(`/approvals/${id}`);
  },

  /**
   * Fetch approval history timeline
   */
  async getHistory(id: string): Promise<ApprovalStep[]> {
    return http.get<ApprovalStep[]>(`/approvals/${id}/history`);
  },

  /**
   * Approve an approval request
   */
  async approve(id: string): Promise<{ success: boolean; message?: string }> {
    return http.post<{ success: boolean; message?: string }>(`/approvals/${id}/approve`);
  },

  /**
   * Reject an approval request with a required reason (min 10 characters)
   */
  async reject(id: string, reason: string): Promise<{ success: boolean; message?: string }> {
    return http.post<{ success: boolean; message?: string }>(`/approvals/${id}/reject`, { reason });
  },

  /**
   * Submit an entity into the approval workflow
   */
  async submit(entityType: string, entityId: string): Promise<{ success: boolean; message?: string }> {
    return http.post<{ success: boolean; message?: string }>(`/approvals/${entityType}/${entityId}/submit`);
  },

  /**
   * Fetch pending and summary counts for badge and dashboard
   */
  async getCounts(): Promise<ApprovalCounts> {
    return http.get<ApprovalCounts>('/approvals/counts');
  },

  /**
   * Cash Advance endpoints
   */
  async getMyCashAdvances(): Promise<CashAdvance[]> {
    const res = await http.get<CashAdvance[] | { items: CashAdvance[] }>('/cash-advances/mine');
    if (Array.isArray(res)) return res;
    return res.items ?? [];
  },

  async createCashAdvance(payload: CashAdvanceCreatePayload): Promise<CashAdvance> {
    return http.post<CashAdvance>('/cash-advances', payload);
  },

  async updateCashAdvance(id: string, payload: Partial<CashAdvanceCreatePayload>): Promise<CashAdvance> {
    return http.put<CashAdvance>(`/cash-advances/${id}`, payload);
  },
};
