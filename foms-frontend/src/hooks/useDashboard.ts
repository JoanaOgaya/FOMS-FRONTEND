import { useAuth } from '../context/AuthContext';
import { dashboardService } from '../services/dashboardService';
import { useQuery } from './useQuery';

/** Role-scoped dashboard data (KPIs, attention items, charts, recent activity). */
export function useDashboard(params: { period?: 'weekly' | 'monthly'; clientId?: string } = {}) {
  const { user } = useAuth();
  return useQuery(`dashboard:${user?.employeeId}:${JSON.stringify(params)}`, () => dashboardService.summary(params), { enabled: !!user });
}

