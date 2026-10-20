import { useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { notificationsService } from '../services/notificationsService';
import type { AppNotification } from '../types/entities';
import { formatRelative } from '../utils/format';
import { invalidateQueries, useQuery } from './useQuery';

export interface NotificationItem extends Omit<AppNotification, 'createdAt'> {
  timestamp: string;
  isToday: boolean;
}

/** Notification bell + page data, served by GET /notifications and refreshed by realtime events. */
export function useNotifications() {
  const { user } = useAuth();
  const query = useQuery(`notifications:${user?.employeeId}`, () => notificationsService.list({ pageSize: 100 }), { enabled: !!user });

  const notifications = useMemo<NotificationItem[]>(() => {
    const today = new Date().toDateString();
    return (query.data?.items ?? []).map(({ createdAt, ...rest }) => ({
      ...rest,
      timestamp: formatRelative(createdAt),
      isToday: new Date(createdAt).toDateString() === today,
    }));
  }, [query.data]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try { await fn(); } finally { invalidateQueries('notifications'); }
  }, []);

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    markAllAsRead: () => run(notificationsService.markAllRead),
    toggleReadStatus: (id: string) => run(() => notificationsService.markRead(id, !notifications.find((n) => n.id === id)?.read)),
    clearAll: () => run(notificationsService.clearAll),
  };
}
