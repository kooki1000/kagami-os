import { useEffect } from "react";
import { isOverlayOpen } from "@/system/overlay/overlayRegistry";
import { useWindowStore } from "./windowStore";

/**
 * Modifier-combo window-management shortcuts that fall outside
 * `shortcuts.ts`'s `chordFromEvent` (letters-only, no Alt — Alt is reserved
 * here for chords that would otherwise collide with real OS/browser bindings:
 * macOS intercepts ⌘Tab/⌘H itself before a browser tab ever sees them, and
 * Ctrl+H is browser History in Chrome/Firefox everywhere). Kept as its own
 * module/hook (wired alongside, not into, `useGlobalShortcuts`) so these
 * predicates stay pure and unit-testable without React.
 *
 * `e.code` (the physical key), not `e.key`, drives every predicate below —
 * macOS remaps `e.key` for Option-held letters into composed/dead-key
 * characters (e.g. Option+H isn't "h"), but `e.code` ("KeyH") is unaffected
 * by modifiers.
 */

/** ⌃⌥H — hide the focused app (same chord on every platform). */
export function isHideChord(e: KeyboardEvent): boolean {
  return e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey && e.code === "KeyH";
}

/**
 * ⌃⌥←/→/↑/↓ (C4) — half-snap left/right, maximize, restore-to-normal.
 * Arrow keys aren't remapped by Option on macOS the way letters are, but
 * `e.code` is used anyway for consistency with the rest of this module.
 */
export function arrowSnapDirection(e: KeyboardEvent): "left" | "right" | "up" | "down" | null {
  if (!e.ctrlKey || !e.altKey || e.metaKey || e.shiftKey)
    return null;
  switch (e.code) {
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "ArrowUp": return "up";
    case "ArrowDown": return "down";
    default: return null;
  }
}

/**
 * Global handler for the window-management shortcuts above. Registered
 * alongside `useGlobalShortcuts()` in `App.tsx`, not merged into it — these
 * chords are resolved by dedicated predicates instead of the menu-driven
 * chord string lookup `shortcuts.ts` uses.
 */
export function useWindowManagementShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // A modal overlay (menu, search, …) owns the keyboard — see
      // `shortcuts.ts` for the same guard.
      if (isOverlayOpen())
        return;

      if (isHideChord(e)) {
        const { focusedId, windows, hideApp } = useWindowStore.getState();
        const focused = windows.find(w => w.id === focusedId);
        if (focused) {
          e.preventDefault();
          hideApp(focused.appId);
        }
        return;
      }

      const direction = arrowSnapDirection(e);
      if (direction) {
        const { focusedId, windows, snapWindow, maximizeWindow, restoreToNormal } = useWindowStore.getState();
        const focused = windows.find(w => w.id === focusedId);
        if (!focused)
          return;
        e.preventDefault();
        switch (direction) {
          case "left":
          case "right":
            snapWindow(focused.id, direction);
            break;
          case "up":
            maximizeWindow(focused.id);
            break;
          case "down":
            restoreToNormal(focused.id);
            break;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
