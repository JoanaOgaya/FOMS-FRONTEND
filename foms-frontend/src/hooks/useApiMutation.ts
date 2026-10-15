import { useCallback, useRef, useState } from 'react';
import { invalidateForMutation, type MutationType } from '../services/invalidation';

interface UseApiMutationOptions<TResult> {
  mutation: MutationType;
  onSuccess?: (result: TResult) => void;
}

export function useApiMutation<TArgs extends unknown[], TResult>(
  request: (...args: TArgs) => Promise<TResult>,
  { mutation, onSuccess }: UseApiMutationOptions<TResult>,
) {
  const requestRef = useRef(request);
  requestRef.current = request;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const [isPending, setIsPending] = useState(false);
  const inFlight = useRef(false);

  const mutateAsync = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setIsPending(true);
    try {
      const result = await requestRef.current(...args);
      invalidateForMutation(mutation);
      onSuccessRef.current?.(result);
      return result;
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  }, [mutation]);

  return { mutateAsync, isPending };
}
