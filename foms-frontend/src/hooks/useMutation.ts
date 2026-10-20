/**
 * useMutation — wraps a service call with double-submit protection, loading state,
 * success/error toast, rollback on error, and automatic query invalidation.
 */
import { useCallback, useRef, useState } from 'react';
import { useToast } from '../components/ToastContext';
import { invalidateQueries } from './useQuery';
import { type MutationType, getInvalidationKeysForMutation } from '../services/invalidation';

const ALWAYS_REFRESH = ['dashboard', 'navBadges', 'notifications'];

export interface UseMutationOptions<TResult, TContext = unknown> {
  successMessage?: string | ((result: TResult) => string);
  errorTitle?: string;
  /** Explicit mutation type from invalidation.ts (e.g. 'approveInvoice'). */
  mutation?: MutationType;
  /** Custom query-key prefixes to refetch on success. */
  invalidate?: string[];
  /** Optimistic update handler returning a context for rollback on failure. */
  onMutate?: () => Promise<TContext> | TContext;
  onSuccess?: (result: TResult, context?: TContext) => void;
  onError?: (error: Error, context?: TContext) => void;
}

export function useMutation<TArgs extends unknown[], TResult, TContext = unknown>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: UseMutationOptions<TResult, TContext> = {},
) {
  const { triggerToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const inFlightRef = useRef(false);

  const {
    successMessage,
    errorTitle = 'Action failed',
    mutation,
    invalidate = [],
    onMutate,
    onSuccess,
    onError,
  } = options;

  const mutate = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    // Double-submit protection: drop subsequent clicks while request is in-flight
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    setIsLoading(true);

    let context: TContext | undefined;
    try {
      if (onMutate) {
        context = await onMutate();
      }
      const result = await fn(...args);

      if (successMessage) {
        triggerToast('success', 'Success', typeof successMessage === 'function' ? successMessage(result) : successMessage);
      }

      const mutationKeys = mutation ? getInvalidationKeysForMutation(mutation) : [];
      const keysToInvalidate = Array.from(new Set([...mutationKeys, ...invalidate, ...ALWAYS_REFRESH]));
      invalidateQueries(...keysToInvalidate);

      onSuccess?.(result, context);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      triggerToast('error', errorTitle, err.message || 'Something went wrong.');
      onError?.(err, context);
      return undefined;
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [fn, successMessage, errorTitle, mutation, invalidate, onMutate, onSuccess, onError, triggerToast]);

  return { mutate, isLoading };
}
