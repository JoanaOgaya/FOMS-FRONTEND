import React from "react";
import { CheckCircle2, Info, AlertTriangle, XCircle } from "lucide-react";
import { useToast, type Toast } from "./ToastContext";

export const ToastBar: React.FC = () => {
  const { toasts, dismissToast } = useToast();

  const handleAction = (toast: Toast) => {
    if (toast.onAction) {
      toast.onAction();
    }
    dismissToast(toast.id);
  };

  return (
    <>
      <style>
        {`
          /* Toast Stack Container */
          .tb-toast-wrapper {
            position: fixed;
            top: 85px;
            right: 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            z-index: 99999;
          }

          /* Toast Component Base */
          .tb-toast-item {
            position: relative;
            display: flex;
            align-items: flex-start;
            gap: 14px;
            padding: 16px 40px 16px 18px;
            border-radius: 8px;
            box-shadow: var(--sh4, 0 16px 48px rgba(15, 23, 42, 0.12)), 0 4px 12px rgba(15, 23, 42, 0.06);
            min-width: 360px;
            max-width: 420px;
            font-family: var(--fb, 'Inter', sans-serif);
            border: 1px solid var(--border, #E2E8F0);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            overflow: hidden;
          }

          /* Progress Bar */
          .tb-toast-item::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            width: 100%;
            background: currentColor;
            opacity: 0.15;
            animation: tb-shrink var(--toast-duration, 4s) linear forwards;
          }
          .tb-toast-item.tb-error::after {
            opacity: 0.3;
            background: #ffffff;
            animation: none; /* errors are persistent */
          }
          @keyframes tb-shrink {
            from { width: 100%; }
            to { width: 0%; }
          }

          /* Severity Styles */
          
          /* 1. Success (Light tint, green left border) */
          .tb-toast-item.tb-success {
            background-color: #ffffff;
            border-left: 4px solid var(--status-success, #059669);
          }
          .tb-toast-item.tb-success .tb-toast-icon {
            color: var(--status-success, #059669);
          }

          /* 2. Info (Light tint, blue left border) */
          .tb-toast-item.tb-info {
            background-color: #ffffff;
            border-left: 4px solid var(--status-info, #0284C7);
          }
          .tb-toast-item.tb-info .tb-toast-icon {
            color: var(--status-info, #0284C7);
          }

          /* 3. Warning (Light tint, amber left border) */
          .tb-toast-item.tb-warning {
            background-color: #ffffff;
            border-left: 4px solid var(--status-warning, #D97706);
          }
          .tb-toast-item.tb-warning .tb-toast-icon {
            color: var(--status-warning, #D97706);
          }

          /* 4. Critical / Error (Solid red background) */
          .tb-toast-item.tb-error {
            background-color: var(--status-failed, #DC2626);
            border-color: var(--status-failed, #DC2626);
            color: #ffffff;
          }
          .tb-toast-item.tb-error .tb-toast-icon {
            color: #ffffff;
          }
          .tb-toast-item.tb-error .tb-toast-title {
            color: #ffffff;
          }
          .tb-toast-item.tb-error .tb-toast-msg {
            color: rgba(255, 255, 255, 0.9);
          }
          .tb-toast-item.tb-error .tb-toast-close {
            color: #ffffff;
            opacity: 0.8;
          }
          .tb-toast-item.tb-error .tb-toast-close:hover {
            opacity: 1;
          }

          /* Toast Inner Content */
          .tb-toast-icon {
            flex-shrink: 0;
            margin-top: 2px;
          }

          .tb-toast-content {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex-grow: 1;
            text-align: left;
          }

          .tb-toast-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--tp, #0F172A);
            margin: 0;
            line-height: 1.3;
          }

          .tb-toast-msg {
            font-size: 13px;
            line-height: 1.4;
            color: var(--ts, #374151);
            margin: 0;
          }

          /* Toast Action Button */
          .tb-toast-action-btn {
            align-self: flex-start;
            margin-top: 8px;
            padding: 5px 12px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            border-radius: 4px;
            border: 1px solid currentColor;
            background: transparent;
            color: inherit;
            cursor: pointer;
            transition: background 0.15s, opacity 0.15s;
          }

          .tb-toast-action-btn:hover {
            background: rgba(0, 0, 0, 0.05);
          }

          .tb-toast-item.tb-error .tb-toast-action-btn {
            border-color: rgba(255, 255, 255, 0.4);
            color: #ffffff;
          }
          
          .tb-toast-item.tb-error .tb-toast-action-btn:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: #ffffff;
          }

          /* Dismiss Button */
          .tb-toast-close {
            position: absolute;
            top: 12px;
            right: 12px;
            cursor: pointer;
            font-size: 16px;
            color: var(--tt, #6B7280);
            opacity: 0.5;
            transition: opacity 0.15s;
            background: transparent;
            border: none;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .tb-toast-close:hover {
            opacity: 1;
          }

          /* Toast Entrance & Exit Animations */
          .tb-toast-enter {
            animation: toastSlideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }

          .tb-toast-leave {
            animation: toastFadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }

          @keyframes toastSlideInRight {
            from { transform: translateX(120%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }

          @keyframes toastFadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-12px); }
          }

          /* Demo Buttons Styling */
          .tb-btn-row {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 10px;
          }

          .tb-demo-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            height: 38px;
            padding: 0 16px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid var(--border, #E2E8F0);
            background: #ffffff;
            color: var(--ts, #374151);
          }

          .tb-demo-btn:hover {
            background-color: var(--s1, #F7F9FF);
            border-color: var(--border-h, #CBD5E1);
          }

          .tb-demo-btn.success-trigger { border-left: 3px solid #059669; }
          .tb-demo-btn.error-trigger { border-left: 3px solid #DC2626; }
          .tb-demo-btn.info-trigger { border-left: 3px solid #0284C7; }
          .tb-demo-btn.warning-trigger { border-left: 3px solid #D97706; }
        `}
      </style>

      {/* Toast Container Stack */}
      <div className="tb-toast-wrapper">
        {toasts.map((toast) => {
          return (
            <div
              key={toast.id}
              className={`tb-toast-item tb-${toast.type} ${
                toast.isLeaving ? "tb-toast-leave" : "tb-toast-enter"
              }`}
              style={{
                "--toast-duration": `${toast.duration ?? (toast.type === "warning" ? 6 : 4)}s`,
              } as React.CSSProperties}
            >
              <div className="tb-toast-icon">
                {toast.type === "success" && <CheckCircle2 size={18} strokeWidth={2.5} />}
                {toast.type === "info" && <Info size={18} strokeWidth={2.5} />}
                {toast.type === "warning" && <AlertTriangle size={18} strokeWidth={2.5} />}
                {toast.type === "error" && <XCircle size={18} strokeWidth={2.5} />}
              </div>
              <div className="tb-toast-content">
                <h4 className="tb-toast-title">{toast.title}</h4>
                <p className="tb-toast-msg">{toast.message}</p>
                {toast.actionLabel && (
                  <button
                    className="tb-toast-action-btn"
                    onClick={() => handleAction(toast)}
                  >
                    {toast.actionLabel}
                  </button>
                )}
              </div>
              <button
                className="tb-toast-close"
                onClick={() => dismissToast(toast.id)}
                aria-label="Close notification"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ToastBar;
