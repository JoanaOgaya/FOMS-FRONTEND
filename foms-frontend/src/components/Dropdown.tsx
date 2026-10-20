import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  ReactNode,
  KeyboardEvent,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DropdownAlign = "left" | "right";
export type DropdownPlacement = "bottom" | "top";

export interface DropdownItem {
  /** Unique key for this item */
  key: string;
  label: string;
  icon?: string; // Tabler icon class, e.g. "ti-edit"
  onClick?: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  /** Renders a divider above this item */
  divider?: boolean;
}

export interface DropdownProps {
  /** Custom trigger element. If omitted, a default "..." icon button is rendered. */
  trigger?: ReactNode;
  /** Accessible label for the default trigger button (ignored if `trigger` is provided) */
  triggerLabel?: string;
  /** Simple item list — for richer content, use `children` instead */
  items?: DropdownItem[];
  /** Custom dropdown content; takes priority over `items` */
  children?: ReactNode;
  /** Horizontal alignment of the panel relative to the trigger */
  align?: DropdownAlign;
  /** Preferred vertical placement; flips automatically if there's no room */
  placement?: DropdownPlacement;
  /** Disable the trigger entirely */
  disabled?: boolean;
  /** Close the panel after any item click (only applies to `items`) */
  closeOnSelect?: boolean;
  /** Controlled open state */
  open?: boolean;
  /** Called whenever open state changes (controlled or uncontrolled) */
  onOpenChange?: (open: boolean) => void;
  /** Optional class on the outer wrapper */
  className?: string;
  /** Optional class on the panel */
  panelClassName?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function Dropdown({
  trigger,
  triggerLabel = "Open menu",
  items,
  children,
  align = "left",
  placement = "bottom",
  disabled = false,
  closeOnSelect = true,
  open: controlledOpen,
  onOpenChange,
  className = "",
  panelClassName = "",
}: DropdownProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const [resolvedPlacement, setResolvedPlacement] = useState(placement);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen]);

  // ── Close on escape, return focus to trigger ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  // ── Flip placement if there isn't room below ────────────────────────────────
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = panelRef.current?.offsetHeight ?? 200;
    
    let spaceBelow = window.innerHeight - rect.bottom;
    const scrollContainer = triggerRef.current.closest('.dt-table-wrap');
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      // Calculate how much space is left inside the table container
      const containerSpaceBelow = containerRect.bottom - rect.bottom;
      spaceBelow = Math.min(spaceBelow, containerSpaceBelow);
    }

    setResolvedPlacement(
      placement === "bottom" && spaceBelow < estimatedHeight && rect.top > estimatedHeight
        ? "top"
        : placement
    );
  }, [open, placement]);

  // ── Reset active index when opened/closed ───────────────────────────────────
  useEffect(() => {
    if (open) {
      setActiveIndex(-1);
    }
  }, [open]);

  const enabledIndices = (items ?? [])
    .map((it, i) => (it.disabled ? -1 : i))
    .filter((i) => i !== -1);

  const focusItem = (index: number) => {
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  };

  // ── Keyboard navigation for the default `items` list ────────────────────────
  const handlePanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!items || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const pos = enabledIndices.indexOf(activeIndex);
      const next = enabledIndices[(pos + 1) % enabledIndices.length];
      focusItem(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const pos = enabledIndices.indexOf(activeIndex);
      const prevIdx =
        (pos - 1 + enabledIndices.length) % enabledIndices.length;
      focusItem(enabledIndices[prevIdx]);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(enabledIndices[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(enabledIndices[enabledIndices.length - 1]);
    }
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => {
        if (enabledIndices.length > 0) focusItem(enabledIndices[0]);
      });
    }
  };

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled) return;
    item.onClick?.();
    if (closeOnSelect) {
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={wrapRef} className={`dd-wrap ${className}`}>
      {trigger ? (
        <div
          onClick={() => !disabled && setOpen(!open)}
          aria-haspopup="true"
          aria-expanded={open}
        >
          {trigger}
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="dd-trigger-btn"
          aria-label={triggerLabel}
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={disabled}
          onClick={() => setOpen(!open)}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="dd-trigger-icon" aria-hidden="true">⋮</span>
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          className={`dd-panel dd-panel--${align} dd-panel--${resolvedPlacement} ${panelClassName}`}
          onKeyDown={handlePanelKeyDown}
        >
          {children
            ? children
            : items?.map((item, i) =>
                item.divider ? (
                  <div key={item.key} className="dd-divider" role="separator" />
                ) : (
                  <button
                    key={item.key}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    role="menuitem"
                    type="button"
                    className={`dd-item${
                      item.variant === "danger" ? " dd-item--danger" : ""
                    }`}
                    disabled={item.disabled}
                    tabIndex={activeIndex === i ? 0 : -1}
                    onClick={() => handleItemClick(item)}
                  >
                    {item.icon && (
                      <i className={`ti ${item.icon}`} aria-hidden="true" />
                    )}
                    {item.label}
                  </button>
                )
              )}
        </div>
      )}
    </div>
  );
}

export default Dropdown;