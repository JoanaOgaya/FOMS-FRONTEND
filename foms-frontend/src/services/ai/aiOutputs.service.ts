/**
 * src/services/ai/aiOutputs.service.ts
 * Service for AI Output History and Audit Trail (FR-025, NFR-017..NFR-020).
 * Displays historical AI outputs linked to official records with search, filter, and pagination.
 */

import { http } from '../apiClient';
import type { AiOutputRecord } from '../../types/ai';

export interface AiOutputsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  module?: string;
  dateFrom?: string;
  dateTo?: string;
  client?: string;
  reviewer?: string;
  scope?: string;
}

export const aiOutputsService = {
  /**
   * Fetches paginated AI output records with query filters.
   */
  async list(query: AiOutputsQuery = {}): Promise<{ items: AiOutputRecord[]; total: number }> {
    return http.get<{ items: AiOutputRecord[]; total: number }>('/ai/outputs', query);
  },

  /**
   * Fetches a single AI output record with its linked entity details.
   */
  async getById(id: string): Promise<AiOutputRecord> {
    return http.get<AiOutputRecord>(`/ai/outputs/${encodeURIComponent(id)}`);
  },
};
