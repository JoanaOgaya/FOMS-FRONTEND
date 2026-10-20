/**
 * queryConfig.ts — Centralized query configuration.
 * staleTime and refetchOnWindowFocus set once here for the entire application.
 */
export const queryConfig = {
  staleTime: 30000, // 30 seconds
  refetchOnWindowFocus: true,
  defaultPollIntervalMs: 15000, // 15s polling fallback
} as const;
