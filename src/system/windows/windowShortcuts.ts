import { useEffect } from "react";
import { isMacPlatform } from "@/lib/format";
import { isOverlayOpen } from "@/system/overlay/overlayRegistry";
import { orderedRunningApps } from "./appSwitcher";
import { useSwitcherStore } from "./switcherStore";
import { topWindow, useWindowStore } from "./windowStore";

/**
 * Modifier-combo window-management shortcuts that fall outside
 * `shortcuts.ts`'s `chordFromEvent` (letters-only, no Alt — Alt is reserved
 * here for chords that would otherwise collide with real OS/browser bindings:
 * macOS intercepts ⌘Tab/⌘H/⌘` itself before a browser tab ever sees them, and
 * Ctrl+H is browser History in Chrome/Firefox everywhere; plain Alt+Tab is
 * OS-reserved on Windows/Linux). Kept as its own module/hook (wired
 * alongside, not into, `useGlobalShortcuts`) so these predicates stay pure
 * and unit-testable without React.
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
 * App switcher open/advance chord (C2) — ⌥Tab on macOS (plain Alt+Tab is
 * OS-reserved there before a browser ever sees it), ⌃⌥Tab elsewhere (plain
 * Alt+Tab is OS-reserved on Windows/Linux instead). Shift isn't excluded
 * here — `isSwitcherReverse` reads it separately to pick a direction, not to
 * gate whether this is the chord at all.
 */
export function isSwitcherChord(e: KeyboardEvent, mac: boolean): boolean {
  if (e.code !== "Tab")
    return false;
  return mac ? (e.altKey && !e.ctrlKey && !e.metaKey) : (e.ctrlKey && e.altKey && !e.metaKey);
}

/** Shift held during a switcher chord — cycle backward instead of forward. */
export function isSwitcherReverse(e: KeyboardEvent): boolean {
  return e.shiftKey;
}

/** Keyup that should commit the switcher's current selection: the switcher-opening modifier being released. */
export function isSwitcherModifierRelease(e: KeyboardEvent, mac: boolean): boolean {
  return mac ? e.key === "Alt" : (e.key === "Control" || e.key === "Alt");
}

/** ⌃` — cycle to the next window of the *currently focused* app (same chord on every platform; ⌘` is macOS-reserved). */
export function isAppCycleChord(e: KeyboardEvent): boolean {
  return e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.code === "Backquote";
}

/** Commits the switcher's highlighted app: focuses its topmost window, restoring/unhiding it first if needed. */
function commitSwitcherSelection(): void {
  const { order, index } = useSwitcherStore.getState();
  const appId = order[index];
  useSwitcherStore.getState().close();
  if (!appId)
    return;

  const store = useWindowStore.getState();
  if (store.hiddenApps.has(appId))
    store.unhideApp(appId);

  // Same "focus if visible, else restore every minimized window" logic as
  // Dock.tsx's onTileClick (C6) — the switcher is another way to reach it.
  const appWindows = useWindowStore.getState().windows.filter(w => w.appId === appId);
  const visible = appWindows.filter(w => !w.minimized);
  if (visible.length > 0)
    store.focusWindow(topWindow(visible)!.id);
  else if (appWindows.length > 0)
    store.restoreApp(appId);
}

/** ⌃` — focuses the next window belonging to the currently focused app, wrapping around; a no-op with only one. */
function cycleWindowsOfFocusedApp(): void {
  const { focusedId, windows, restoreWindow, focusWindow } = useWindowStore.getState();
  const focused = windows.find(w => w.id === focusedId);
  if (!focused)
    return;
  const sameApp = windows.filter(w => w.appId === focused.appId).sort((a, b) => a.zIndex - b.zIndex);
  if (sameApp.length < 2)
    return;
  const curIdx = sameApp.findIndex(w => w.id === focused.id);
  const next = sameApp[(curIdx + 1) % sameApp.length];
  if (next.minimized)
    restoreWindow(next.id);
  else
    focusWindow(next.id);
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
      const mac = isMacPlatform();

      // The switcher's own chords must keep working while it's open — it
      // registers itself as *the* open overlay (AppSwitcherOverlay's
      // useOverlayOpen), so the generic overlay guard below — meant for
      // every other shortcut in this file backing off for menus/search —
      // would otherwise also block the Tab-presses/Escape that drive it.
      if (isSwitcherChord(e, mac)) {
        e.preventDefault();
        if (!useSwitcherStore.getState().open)
          useSwitcherStore.getState().openSwitcher(orderedRunningApps(useWindowStore.getState().windows));
        else
          useSwitcherStore.getState().advance(isSwitcherReverse(e));
        return;
      }
      if (useSwitcherStore.getState().open) {
        if (e.code === "Escape") {
          e.preventDefault();
          useSwitcherStore.getState().close();
        }
        return;
      }

      // A different modal overlay (menu, search, …) owns the keyboard.
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

      if (isAppCycleChord(e)) {
        e.preventDefault();
        cycleWindowsOfFocusedApp();
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

    function onKeyUp(e: KeyboardEvent) {
      if (useSwitcherStore.getState().open && isSwitcherModifierRelease(e, isMacPlatform()))
        commitSwitcherSelection();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
