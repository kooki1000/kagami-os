import { useEffect } from "react";

/**
 * Module-level count of currently-open blocking overlays (menus, dialogs).
 * Lets global keyboard handlers — `shortcuts.ts`'s chord listener, Files'
 * own window-level key handler — back off while something modal-ish is
 * open, without threading an "is a menu open" prop through every layer.
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
