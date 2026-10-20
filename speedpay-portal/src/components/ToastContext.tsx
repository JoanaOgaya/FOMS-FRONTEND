import React, { createContext, useContext, useState, useCallback, useRef } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message: string;
  isLeaving: boolean;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ToastContextValue {
  toasts: Toast[];
  triggerToast: (
    type: ToastType,
    title: string,
    message: string,
    actionLabel?: string,
    onAction?: () => void,
    duration?: number
  ) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const queueRef = useRef<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    // 1. Mark as leaving to trigger exit animations
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, isLeaving: true } : t)));
    
    // 2. Remove completely after animation finishes (300ms)
    setTimeout(() => {
      setToasts((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        
        // 3. Pop the next toast from the queue if screen has capacity
        if (queueRef.current.length > 0 && filtered.length < 3) {
          const nextToast = queueRef.current.shift()!;
          startTimer(nextToast.id, nextToast.type, nextToast.duration);
          return [...filtered, nextToast];
        }
        return filtered;
      });
    }, 300);
  }, []);

  const startTimer = useCallback((id: number, type: ToastType, duration?: number) => {
    // 0 = persistent
    if (duration === 0) return;

    // Default fallback durations: warning = 6000ms, error = persistent (0), success/info = 4000ms
    const finalDuration = duration !== undefined
      ? duration
      : (type === "error" ? 0 : (type === "warning" ? 6000 : 4000));

    if (finalDuration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, finalDuration);
    }
  }, [dismissToast]);

  const triggerToast = useCallback(
    (
      type: ToastType,
      title: string,
      message: string,
      actionLabel?: string,
      onAction?: () => void,
      duration?: number
    ) => {
      const id = Date.now() + Math.random();

      const newToast: Toast = {
        id,
        type,
        title,
        message,
        isLeaving: false,
        duration,
        actionLabel,
        onAction,
      };

      setToasts((prev) => {
        // limit visible stack to 3 at once
        if (prev.length < 3) {
          startTimer(id, type, duration);
          return [...prev, newToast];
        } else {
          // buffer to queue
          queueRef.current.push(newToast);
          return prev;
        }
      });
    },
    [startTimer]
  );

  return (
    <ToastContext.Provider value={{ toasts, triggerToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  const { triggerToast } = context;

  const success = useCallback(
    (message: string, title = "Success", actionLabel?: string, onAction?: () => void, duration?: number) => {
      triggerToast("success", title, message, actionLabel, onAction, duration);
    },
    [triggerToast]
  );

  const error = useCallback(
    (message: string, title = "Error", actionLabel?: string, onAction?: () => void, duration?: number) => {
      triggerToast("error", title, message, actionLabel, onAction, duration);
    },
    [triggerToast]
  );

  const info = useCallback(
    (message: string, title = "Info", actionLabel?: string, onAction?: () => void, duration?: number) => {
      triggerToast("info", title, message, actionLabel, onAction, duration);
    },
    [triggerToast]
  );

  const warning = useCallback(
    (message: string, title = "Warning", actionLabel?: string, onAction?: () => void, duration?: number) => {
      triggerToast("warning", title, message, actionLabel, onAction, duration);
    },
    [triggerToast]
  );

  return {
    toasts: context.toasts,
    dismissToast: context.dismissToast,
    triggerToast,
    toast: {
      success,
      error,
      info,
      warning,
    },
  };
};
