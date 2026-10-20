/**
 * queryKeys.ts — The ONE role-neutral query-key factory for the entire frontend.
 * Never hardcode random query key strings in components.
 * Hierarchical keys allow prefix-based invalidation via `invalidateQueries(...)`.
 */

export const queryKeys = {
  currentUser: () => ['auth', 'me'] as const,
  users: {
    all: () => 'users' as const,
    list: (params?: object) => `users:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `users:detail:${id}` as const,
  },
  invoices: {
    all: () => 'invoices' as const,
    list: (params?: object) => `invoices:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `invoices:detail:${id}` as const,
  },
  ar: {
    all: () => 'ar' as const,
    records: (params?: object) => `ar:records:${JSON.stringify(params ?? {})}` as const,
    client: (clientId: string) => `ar:client:${clientId}` as const,
    escalations: () => 'ar:escalations' as const,
  },
  payments: {
    all: () => 'payments' as const,
    list: (params?: object) => `payments:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `payments:detail:${id}` as const,
    receipts: (params?: object) => `receipts:list:${JSON.stringify(params ?? {})}` as const,
  },
  settlements: {
    all: () => 'settlements' as const,
    list: (params?: object) => `settlements:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `settlements:detail:${id}` as const,
  },
  adjustments: {
    all: () => 'adjustments' as const,
    list: (params?: object) => `adjustments:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `adjustments:detail:${id}` as const,
  },
  speedpay: {
    all: () => 'speedpay' as const,
    list: (params?: object) => `speedpay:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `speedpay:detail:${id}` as const,
  },
  duplicates: {
    all: () => 'duplicates' as const,
    flagged: (params?: object) => `duplicates:flagged:${JSON.stringify(params ?? {})}` as const,
    unique: (params?: object) => `duplicates:unique:${JSON.stringify(params ?? {})}` as const,
    history: (params?: object) => `duplicates:history:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `duplicates:detail:${id}` as const,
  },
  liquidations: {
    all: () => 'liquidations' as const,
    list: (params?: object) => `liquidations:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `liquidations:detail:${id}` as const,
  },
  cashFlow: {
    all: () => 'cashflow' as const,
    list: (params?: object) => `cashflow:list:${JSON.stringify(params ?? {})}` as const,
  },
  reports: {
    all: () => 'reports' as const,
    ledger: (type: string, params?: object) => `reports:${type}:${JSON.stringify(params ?? {})}` as const,
  },
  dashboard: {
    all: () => 'dashboard' as const,
    executive: (role?: string, params?: object) => `dashboard:${role ?? 'general'}:${JSON.stringify(params ?? {})}` as const,
  },
  notifications: {
    all: () => 'notifications' as const,
    user: (userId?: string) => `notifications:${userId ?? 'me'}` as const,
  },
  auditLogs: {
    all: () => 'auditLogs' as const,
    list: (params?: object) => `auditLogs:list:${JSON.stringify(params ?? {})}` as const,
  },
  clients: {
    all: () => 'clients' as const,
    list: (params?: object) => `clients:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `clients:detail:${id}` as const,
    options: () => 'clients:options' as const,
  },
  rates: {
    all: () => 'rates' as const,
    list: (params?: object) => `rates:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `rates:detail:${id}` as const,
    records: (params?: object) => `rates:records:${JSON.stringify(params ?? {})}` as const,
    options: () => 'rates:options' as const,
  },
  waybills: {
    all: () => 'waybills' as const,
    list: (params?: object) => `waybills:list:${JSON.stringify(params ?? {})}` as const,
    detail: (id: string) => `waybills:detail:${id}` as const,
  },
  aiOutputs: {
    all: () => 'aiOutputs' as const,
    list: (params?: object) => `aiOutputs:list:${JSON.stringify(params ?? {})}` as const,
  },
} as const;
