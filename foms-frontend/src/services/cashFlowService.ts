import { createResource } from './resource';
import { http } from './apiClient';
import type { CashFlowRecord } from '../types/entities';

const base = createResource<CashFlowRecord>('/cash-flow');

export interface RecordCashOutflowPayload {
  referenceNumber: string;
  category: string;
  payee: string;
  description: string;
  amount: number;
  currency?: string;
  transactionDate?: string;
  supportingDocuments?: string;
}

export const cashFlowService = {
  ...base,
  async recordOutflow(payload: RecordCashOutflowPayload): Promise<{ success: boolean; data: any; message?: string }> {
    return http.post('/cash-outflows', payload);
  },
  async listOutflows(params?: { status?: string; category?: string }): Promise<{ success: boolean; count: number; data: any[] }> {
    return http.get('/cash-outflows', params);
  },
  async getSummary(): Promise<{ Inflow: number; Outflow: number }> {
    return http.get('/cash-flow/summary');
  }
};
