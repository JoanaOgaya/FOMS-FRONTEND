import { http } from './apiClient';
import { toPaged } from './resource';
import type { AppNotification, ListQuery, Paged } from '../types/entities';

export const notificationsService = {
  list: async (query?: ListQuery) => toPaged(await http.get<AppNotification[] | Paged<AppNotification>>('/notifications', query)),
  markRead: (id: string, read: boolean) => http.patch<AppNotification>(`/notifications/${id}`, { read }),
  markAllRead: () => http.post<void>('/notifications/read-all'),
  clearAll: () => http.delete<void>('/notifications'),
};
