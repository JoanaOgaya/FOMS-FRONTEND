import { http } from './apiClient';
import type { DashboardSummary, FinanceManagerDashboardSummary, NavBadges } from '../types/entities';

export const dashboardService = {
  /** KPIs, attention items, charts and recent activity — already scoped to the caller's role. */
  summary: (params?: { period?: 'weekly' | 'monthly'; clientId?: string }) => http.get<DashboardSummary>('/dashboard/summary', params),
  /** Financial Manager executive metrics from the same records used by finance workflows. */
  financeManagerExecutive: (params?: { period?: 'weekly' | 'monthly'; clientId?: string }) =>
    http.get<FinanceManagerDashboardSummary>('/financial-manager/executive-dashboard', params),
  navBadges: () => http.get<NavBadges>('/dashboard/nav-badges'),
};
