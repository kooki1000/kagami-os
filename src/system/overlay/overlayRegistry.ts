import { useEffect } from "react";

/**
 * Module-level count of open blocking overlays (menus, dialogs), so global
 * keyboard handlers (`shortcuts.ts`, Files' window-level handler) can back
 * off without threading an "is a menu open" prop through every layer.
 */
let openCount = 0;
const listeners = new Set<() => void>();

export function isOverlayOpen(): boolean {
  return openCount > 0;
}

/**
 * Subscribes to open/close transitions — pairs with {@link isOverlayOpen}
 * as a `useSyncExternalStore` source. The Browser app (N4) uses this to hide
 * its native child webview while a menu/search/notification overlay is
 * open, since a native webview can't be z-ordered behind shell DOM content.
 */
export function subscribeOverlayOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Registers one open overlay for the lifetime of `active`. */
export function useOverlayOpen(active: boolean): void {
  useEffect(() => {
    if (!active)
      return;
    openCount += 1;
    listeners.forEach(listener => listener());
    return () => {
      openCount -= 1;
      listeners.forEach(listener => listener());
    };
  }, [active]);
}
