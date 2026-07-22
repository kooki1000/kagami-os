import type { RefObject } from "react";
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(", ");

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export interface UseFocusTrapOptions {
  /** Whether the trap is active — mounts focus/listeners only while true. */
  active: boolean;
  /** Fires on Escape, or on Tab leaving the container in menu (`trapFocus: false`) mode. */
  onClose: () => void;
  /**
   * `true` (default) for real modals: Tab wraps within the container.
   * `false` for dismissable menus: Tab leaving the container closes it
   * instead, matching the existing "click elsewhere to dismiss" behavior
   * rather than forcing a hard trap on a surface that's meant to be casually
   * dismissable.
   */
  trapFocus?: boolean;
}

/**
 * Shared focus-management primitive for every overlay in the shell:
 * focus-on-mount into the container, Escape-to-close, focus-restore to
 * whatever was focused before on unmount, and either a Tab-wrap (modals) or
 * Tab-closes (menus). Consumers must put `tabIndex={-1}` on the element the
 * returned ref attaches to, so it's a valid focus target even when it has no
 * focusable children.
 */
export function useFocusTrap<T extends HTMLElement>({
  active,
  onClose,
  trapFocus = true,
}: UseFocusTrapOptions): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active)
      return;
    const container = containerRef.current;
    if (!container)
      return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const [first] = focusableElements(container);
    (first ?? container).focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab")
        return;
      const focusable = focusableElements(container!);
      if (focusable.length === 0)
        return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (trapFocus) {
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
        else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
        return;
      }

      const willLeave = (e.shiftKey && document.activeElement === firstEl)
        || (!e.shiftKey && document.activeElement === lastEl);
      if (willLeave) {
        e.preventDefault();
        onCloseRef.current();
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [active, trapFocus]);

  return containerRef;
}
