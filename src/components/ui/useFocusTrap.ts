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
   * `true` (default): real modals, Tab wraps within the container.
   * `false`: dismissable menus, Tab leaving closes it instead — matches the
   * existing click-outside-to-dismiss behavior rather than a hard trap.
   */
  trapFocus?: boolean;
}

/**
 * Shared focus-management primitive for every shell overlay: focus-on-mount,
 * Escape-to-close, focus-restore-on-unmount, and either a Tab-wrap (modals)
 * or Tab-closes (menus). The element the returned ref attaches to needs
 * `tabIndex={-1}` to stay a valid focus target with no focusable children.
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
