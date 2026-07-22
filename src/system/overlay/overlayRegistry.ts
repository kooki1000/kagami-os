import { useEffect } from "react";

/**
 * Module-level count of open blocking overlays (menus, dialogs), so global
 * keyboard handlers (`shortcuts.ts`, Files' window-level handler) can back
 * off without threading an "is a menu open" prop through every layer.
 */
let openCount = 0;

export function isOverlayOpen(): boolean {
  return openCount > 0;
}

/** Registers one open overlay for the lifetime of `active`. */
export function useOverlayOpen(active: boolean): void {
  useEffect(() => {
    if (!active)
      return;
    openCount += 1;
    return () => {
      openCount -= 1;
    };
  }, [active]);
}
