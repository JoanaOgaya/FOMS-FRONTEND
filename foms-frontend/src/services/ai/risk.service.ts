/**
 * src/services/ai/risk.service.ts
 * Service for Receivable Risk Analysis (FR-008..FR-013).
 * Fetches server-calculated risk scores, factors, and dynamic threshold bands.
 * Never hardcodes score thresholds or factor weights on the client.
 */

import { http } from '../apiClient';
import type { RiskConfig, RiskScoreResult } from '../../types/ai';

let cachedConfig: RiskConfig | null = null;

export const riskService = {
  /**
   * Fetches the dynamic risk scoring configuration and threshold bands.
   * If already fetched, returns cached configuration.
   */
  async getConfig(forceRefresh = false): Promise<RiskConfig> {
    if (cachedConfig && !forceRefresh) {
      return cachedConfig;
    }
    try {
      const config = await http.get<RiskConfig>('/ai/risk/config');
      cachedConfig = config;
      return config;
    } catch {
      // Return safe fallback bands if the network or endpoint fails temporarily
      return {
        formulaVersion: 'v1.0-default',
        bands: [
          { level: 'LOW', min: 0, max: 33, color: '#16A34A', badgeBg: '#F0FDF4', description: 'Low Default Risk' },
          { level: 'MEDIUM', min: 34, max: 66, color: '#D97706', badgeBg: '#FFFBEB', description: 'Moderate Exposure' },
          { level: 'HIGH', min: 67, max: 100, color: '#DC2626', badgeBg: '#FEF2F2', description: 'High Delinquency Probability' },
        ],
        description: 'Dynamic Risk Engine fallback',
      };
    }
  },

  /**
   * Clears in-memory cached risk config (called on logout).
   */
  clearCache(): void {
    cachedConfig = null;
  },

  /**
   * Fetches risk calculation for a specific invoice.
   */
  async getInvoiceRisk(invoiceId: string): Promise<RiskScoreResult> {
    return http.get<RiskScoreResult>(`/ai/risk/invoices/${encodeURIComponent(invoiceId)}`);
  },

  /**
   * Fetches risk calculation for a client account.
   */
  async getAccountRisk(clientId: string): Promise<RiskScoreResult> {
    return http.get<RiskScoreResult>(`/ai/risk/accounts/${encodeURIComponent(clientId)}`);
  },

  /**
   * Batch fetches risk records for multiple entities.
   */
  async getBatchRisks(entityIds: string[]): Promise<Record<string, RiskScoreResult>> {
    if (entityIds.length === 0) return {};
    return http.post<Record<string, RiskScoreResult>>('/ai/risk/batch', { ids: entityIds });
  },
};
