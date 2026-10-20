import { http } from './apiClient';
import { toPaged } from './resource';
import type { AuditLog, ListQuery, Paged } from '../types/entities';

export const auditLogsService = {
  list: async (query?: ListQuery) => {
    const res = await http.get<any>('/audit-logs', query);
    const paged = toPaged<any>(res);
    paged.items = (paged.items || []).map((raw: any) => ({
      id: raw.id,
      timestamp: raw.loggedAt || raw.timestamp || '',
      userId: raw.userId || '',
      userFullName: raw.userFullName || raw.userId || 'User',
      userRole: raw.userRole || raw.role || '',
      action: raw.action || '',
      module: raw.entityName || raw.module || '',
      recordId: raw.entityId || raw.recordId || '',
      recordType: raw.entityName || raw.recordType || '',
      details: raw.details || '',
      ipAddress: raw.ipAddress || '',
    }));
    return paged;
  },
  create: async (data: Partial<AuditLog>) => http.post<AuditLog>('/audit-logs', data),
};
