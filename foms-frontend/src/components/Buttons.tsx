import React, { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "success"
  | "warning"
  | "navy"
  | "ghost";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** Button label. */
  title: string;
  /** Explicit color/intent. Defaults to "primary". */
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string | ReactNode; // Tabler icon class or a React component (e.g. from lucide-react)
  iconPosition?: "left" | "right";
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  title,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  loading = false,
  fullWidth = false,
  disabled,
  className = "",
  children,
  ...rest
}, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn--${variant} btn--${size}${fullWidth ? " btn--full" : ""
        } ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <i className="ti ti-loader-2 btn-spinner" aria-hidden="true" />}
      {!loading && icon && iconPosition === "left" && (
        typeof icon === 'string' ? <i className={`ti ${icon}`} aria-hidden="true" /> : icon
      )}
      <span>{children ?? title}</span>
      {!loading && icon && iconPosition === "right" && (
        typeof icon === 'string' ? <i className={`ti ${icon}`} aria-hidden="true" /> : icon
      )}
    </button>
  );
});

Button.displayName = "Button";

export default Button;
