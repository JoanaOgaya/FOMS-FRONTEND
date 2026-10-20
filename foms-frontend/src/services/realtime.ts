/**
 * realtime.ts — WebSocket / SSE real-time client with 10-15s polling fallback,
 * automatic reconnect resync, and window focus refetching.
 *
 * Maps incoming events from cross-role flows (Head Accountant, Assistant FM, Accountant)
 * to affected query keys so FM pages immediately refresh without page reload.
 */
import { session } from './apiClient';
import { queryConfig } from './queryConfig';

export interface RealtimeEvent {
  topic: string;
  sourceRole?: string;
  action?: string;
  entityId?: string;
}

type Listener = (event: RealtimeEvent) => void;

const POLL_MS = Math.min(15000, Math.max(10000, Number(import.meta.env.VITE_POLL_INTERVAL_MS) || queryConfig.defaultPollIntervalMs));
const RECONNECT_MS = 5000;

/** Role-neutral event -> query keys mapping for cross-user/role synchronization */
export const REALTIME_EVENT_QUERY_MAP: Record<string, readonly string[]> = {
  // Head Accountant events
  'invoice:verified': ['invoices', 'ar', 'dashboard', 'reports', 'notifications', 'review:invoices'],
  'invoice:returned': ['invoices', 'ar', 'dashboard', 'reports', 'notifications', 'review:invoices'],
  'payment:verified': ['payments', 'invoices', 'ar', 'dashboard', 'reports', 'notifications', 'cashflow', 'receipts'],
  'payment:returned': ['payments', 'dashboard', 'reports', 'notifications'],
  'settlement:verified': ['settlements', 'cashflow', 'dashboard', 'reports', 'notifications'],
  'settlement:returned': ['settlements', 'cashflow', 'dashboard', 'reports', 'notifications'],
  'adjustment:verified': ['adjustments', 'ar', 'cashflow', 'dashboard', 'reports', 'notifications'],
  'adjustment:returned': ['adjustments', 'dashboard', 'reports', 'notifications'],
  'speedpay:verified': ['speedpay', 'payments', 'invoices', 'ar', 'dashboard', 'reports', 'notifications', 'receipts'],
  'speedpay:returned': ['speedpay', 'dashboard', 'reports', 'notifications'],

  // Assistant FM events
  'liquidation:validated': ['liquidations', 'cashflow', 'dashboard', 'reports', 'notifications'],
  'liquidation:returned': ['liquidations', 'cashflow', 'dashboard', 'reports', 'notifications'],

  // Accountant events
  'record:submitted': ['invoices', 'payments', 'settlements', 'adjustments', 'ar', 'dashboard', 'reports', 'notifications'],
  'invoice:created': ['invoices', 'ar', 'dashboard', 'reports', 'notifications', 'desk:invoices'],
  'invoice:submitted': ['invoices', 'ar', 'dashboard', 'reports', 'notifications', 'review:invoices'],
  'payment:submitted': ['payments', 'ar', 'dashboard', 'reports', 'notifications'],
  'settlement:submitted': ['settlements', 'cashflow', 'dashboard', 'reports', 'notifications'],
  'adjustment:submitted': ['adjustments', 'ar', 'dashboard', 'reports', 'notifications'],

  // Duplicate detection decisions & supervisor reviews
  'duplicate:decided': ['duplicates', 'dashboard', 'auditLogs', 'reports', 'aiOutputs', 'notifications'],
  'duplicate:approved': ['duplicates', 'dashboard', 'auditLogs', 'reports', 'aiOutputs', 'notifications'],
  'duplicate:returned': ['duplicates', 'dashboard', 'auditLogs', 'reports', 'aiOutputs', 'notifications'],
  'aiDuplicates': ['duplicates', 'dashboard', 'auditLogs', 'reports', 'aiOutputs', 'notifications'],

  // Canonical resource domains
  invoices: ['invoices', 'ar', 'dashboard', 'reports', 'notifications', 'review:invoices'],
  payments: ['payments', 'invoices', 'ar', 'cashflow', 'dashboard', 'reports', 'notifications'],
  settlements: ['settlements', 'cashflow', 'dashboard', 'reports', 'notifications'],
  liquidations: ['liquidations', 'cashflow', 'dashboard', 'reports', 'notifications'],
  adjustments: ['adjustments', 'ar', 'dashboard', 'reports', 'notifications'],
  speedpay: ['speedpay', 'payments', 'invoices', 'ar', 'dashboard', 'notifications'],
  duplicates: ['duplicates', 'dashboard', 'auditLogs', 'reports', 'notifications'],
  ar: ['ar', 'dashboard', 'reports', 'notifications'],
  cashflow: ['cashflow', 'dashboard', 'reports', 'notifications'],
  auditLogs: ['auditLogs'],
  notifications: ['notifications'],
};

function resolveWsUrl(): string | null {
  const raw: string | undefined = import.meta.env.VITE_WS_URL;
  if (!raw) return null;
  if (/^wss?:\/\//i.test(raw)) return raw;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

export function connectRealtime(listener: Listener): () => void {
  let socket: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const startPolling = () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => listener({ topic: '*' }), POLL_MS);
  };
  const stopPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };

  const open = () => {
    const url = resolveWsUrl();
    if (!url || closed) {
      startPolling();
      return;
    }
    try {
      const token = session.get()?.accessToken;
      socket = new WebSocket(token ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}` : url);
    } catch {
      startPolling();
      return;
    }

    socket.onopen = () => {
      stopPolling();
      // On reconnect / initial open: trigger full resync so no changes were missed while disconnected
      listener({ topic: '*' });
    };

    socket.onmessage = (msg) => {
      try {
        const data = JSON.parse(String(msg.data)) as {
          topic?: string | string[];
          sourceRole?: string;
          action?: string;
          entityId?: string;
        };
        const topics = Array.isArray(data.topic) ? data.topic : [data.topic ?? '*'];
        topics.forEach((topic) =>
          listener({
            topic,
            sourceRole: data.sourceRole,
            action: data.action,
            entityId: data.entityId,
          }),
        );
      } catch {
        listener({ topic: '*' });
      }
    };

    socket.onclose = () => {
      socket = null;
      if (closed) return;
      // Connection dropped: nothing looks broken, fall back to polling and schedule reconnect
      startPolling();
      retryTimer = setTimeout(open, RECONNECT_MS);
    };

    socket.onerror = () => {
      socket?.close();
    };
  };

  open();

  return () => {
    closed = true;
    stopPolling();
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
  };
}
