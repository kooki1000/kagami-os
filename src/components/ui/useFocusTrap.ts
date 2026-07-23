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
  /**
   * Focus the container's first focusable element (and restore whatever was
   * focused before, on deactivate) when the trap activates. Default `true`
   * for modals. App windows opt out with `false`: activating on window
   * focus shouldn't yank focus away from whatever the user just clicked,
   * and there's nothing meaningful to restore it to when focus moves to
   * another window instead of closing.
   */
  autoFocus?: boolean;
  /**
   * Whether Escape invokes `onClose`. Default `true` for modals. App
   * windows opt out with `false` — Escape there belongs to the window's
   * own content (e.g. cancelling an in-progress rename), not a "close the
   * window" shortcut.
   */
  closeOnEscape?: boolean;
}

/**
 * Shared focus-management primitive for every shell overlay: focus-on-mount,
 * Escape-to-close, focus-restore-on-unmount, and either a Tab-wrap (modals)
 * or Tab-closes (menus) — or, with `autoFocus`/`closeOnEscape` both `false`,
 * just the Tab-wrap for a plain app window. The element the returned ref
 * attaches to needs `tabIndex={-1}` to stay a valid focus target with no
 * focusable children, unless `autoFocus: false` opts out of that pair.
 *
 * In practice these two options move together: modal-style overlays
 * (ContextMenu, NotificationCenter, NodeInfoPanel) leave both at their
 * `true` default, and self-contained windows (Window.tsx) set both `false`.
 */
export function useFocusTrap<T extends HTMLElement>({
  active,
  onClose,
  trapFocus = true,
  autoFocus = true,
  closeOnEscape = true,
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
    const previouslyFocused = autoFocus && document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (autoFocus) {
      const [first] = focusableElements(container);
      (first ?? container).focus();
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        if (!closeOnEscape)
          return;
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
  }, [active, trapFocus, autoFocus, closeOnEscape]);

  return containerRef;
}
