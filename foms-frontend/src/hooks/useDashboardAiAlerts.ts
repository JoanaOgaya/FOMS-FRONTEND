import { useState, useEffect, useCallback } from 'react';
import { collectionService } from '../services/ai/collection.service';
import { ROLES, type Role } from '../types/auth';
import { getDashboardAiScope, isLiquidationDoc } from '../utils/roleAccess';
import type { DashboardAiAlert } from '../types/ai';

export interface UseDashboardAiAlertsResult {
  alerts: DashboardAiAlert[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useDashboardAiAlerts(role?: Role | null): UseDashboardAiAlertsResult {
  const [alerts, setAlerts] = useState<DashboardAiAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const scope = getDashboardAiScope(role);
      const data = await collectionService.getDashboardAlerts(scope);
      let list = Array.isArray(data) ? data : [];

      // Role-based scope filtering safeguards
      if (role === ROLES.ASSISTANT_FM) {
        list = list.filter((a) =>
          a.scope === 'liquidation' ||
          a.type === 'liquidation' ||
          isLiquidationDoc(a.message) ||
          isLiquidationDoc(a.title)
        );
      } else if (role === ROLES.HEAD_ACCOUNTANT) {
        // Head Accountant sees items for review
        list = list.filter((a) =>
          a.scope === 'review' ||
          a.scope === 'all' ||
          !a.scope ||
          a.type === 'duplicate' ||
          a.type === 'risk'
        );
      } else if (role === ROLES.ACCOUNTANT) {
        // Accountant sees own-scope alerts
        list = list.filter((a) =>
          a.scope === 'own' ||
          a.scope === 'all' ||
          !a.scope ||
          a.type === 'duplicate' ||
          a.type === 'document' ||
          a.type === 'risk'
        );
      }

      setAlerts(list);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err || 'Failed to load AI alerts')));
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return {
    alerts,
    isLoading,
    error,
    refetch: fetchAlerts,
  };
}
