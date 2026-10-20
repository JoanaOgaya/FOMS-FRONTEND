import { useState, useRef, useCallback } from 'react';
import { duplicatesService } from '../services/duplicates.service';
import type { DuplicateMatch, DuplicatePreCheckRequest } from '../types/ai';

export interface PreCheckModalState {
  isOpen: boolean;
  status: 'checking' | 'slow' | 'matches_found' | 'error';
  matches: DuplicateMatch[];
  errorMessage?: string;
  request?: DuplicatePreCheckRequest;
}

export function useDuplicatePreCheck() {
  const [modalState, setModalState] = useState<PreCheckModalState>({
    isOpen: false,
    status: 'checking',
    matches: [],
  });

  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvePromiseRef = useRef<((canProceed: boolean, remarks?: string) => void) | null>(null);

  /**
   * Executes pre-save duplicate check against the backend.
   * Resolves to { canProceed: boolean, remarks?: string }
   */
  const runPreCheck = useCallback(
    async (request: DuplicatePreCheckRequest): Promise<{ canProceed: boolean; remarks?: string }> => {
      // Open modal in checking mode
      setModalState({
        isOpen: true,
        status: 'checking',
        matches: [],
        request,
      });

      // If check takes over 5 seconds, switch to 'slow' status ("Still checking...")
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      slowTimerRef.current = setTimeout(() => {
        setModalState((prev) => (prev.isOpen && prev.status === 'checking' ? { ...prev, status: 'slow' } : prev));
      }, 5000);

      return new Promise<{ canProceed: boolean; remarks?: string }>((resolve) => {
        resolvePromiseRef.current = (canProceed, remarks) => resolve({ canProceed, remarks });

        duplicatesService
          .preCheck(request)
          .then((result) => {
            if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
            if (result.isDuplicate && result.matches && result.matches.length > 0) {
              // Matches found: user must review and provide remarks or cancel
              setModalState({
                isOpen: true,
                status: 'matches_found',
                matches: result.matches,
                request,
              });
            } else {
              // No duplicates found: close modal and proceed with save
              setModalState({ isOpen: false, status: 'checking', matches: [] });
              resolve({ canProceed: true });
            }
          })
          .catch((err) => {
            if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
            setModalState({
              isOpen: true,
              status: 'error',
              matches: [],
              errorMessage: err instanceof Error ? err.message : 'AI duplicate check unavailable.',
              request,
            });
          });
      });
    },
    []
  );

  const handleModalCancel = useCallback(() => {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    setModalState({ isOpen: false, status: 'checking', matches: [] });
    if (resolvePromiseRef.current) {
      resolvePromiseRef.current(false);
      resolvePromiseRef.current = null;
    }
  }, []);

  const handleModalRetry = useCallback(() => {
    if (modalState.request) {
      runPreCheck(modalState.request);
    }
  }, [modalState.request, runPreCheck]);

  const handleProceedWithRemarks = useCallback((remarks: string) => {
    setModalState({ isOpen: false, status: 'checking', matches: [] });
    if (resolvePromiseRef.current) {
      resolvePromiseRef.current(true, remarks);
      resolvePromiseRef.current = null;
    }
  }, []);

  const handleProceedManualReview = useCallback(
    async (remarks: string) => {
      if (modalState.request) {
        try {
          await duplicatesService.logSkip({
            entityType: modalState.request.entityType,
            fieldName: modalState.request.fieldName,
            fieldValue: modalState.request.fieldValue,
            remarks,
          });
        } catch {
          // Log skip best effort
        }
      }
      setModalState({ isOpen: false, status: 'checking', matches: [] });
      if (resolvePromiseRef.current) {
        resolvePromiseRef.current(true, remarks);
        resolvePromiseRef.current = null;
      }
    },
    [modalState.request]
  );

  return {
    runPreCheck,
    modalState,
    handleModalCancel,
    handleModalRetry,
    handleProceedWithRemarks,
    handleProceedManualReview,
    handleProceedWithManualReview: handleProceedManualReview,
  };
}
