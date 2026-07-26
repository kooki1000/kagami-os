import { useEffect } from "react";
import { emitAppCommand } from "./appCommands";
import { getApp } from "./apps/registry";
import { executeCommand } from "./commands";
import { isOverlayOpen } from "./overlay/overlayRegistry";
import { useSearchStore } from "./search/searchStore";
import { useWindowStore } from "./windows/windowStore";

/**
 * Global keyboard shortcuts. Rather than a separate keymap, we reuse the
 * `shortcut` strings apps already declare on their menu items (e.g. "⌘W",
 * "⇧⌘N") — pressing a chord looks up the matching item on the focused app
 * and runs its command/appCommand. A few shell-level chords work regardless.
 */

const SHELL_CHORDS: Record<string, () => void> = {
  "⌘W": () => executeCommand("window.close"),
  "⌘M": () => executeCommand("window.minimize"),
  "⌘Q": () => executeCommand("app.quit"),
};

/** A chord + human-readable description, for display (U10's Shortcuts reference). */
export interface ChordDescriptor {
  shortcut: string;
  description: string;
}

/**
 * Display form of `SHELL_CHORDS` above, plus ⌘K (handled as a special case
 * in `useGlobalShortcuts` below rather than living in the record, since it
 * works with no focused window at all). Kept as a separate list rather than
 * folding descriptions into `SHELL_CHORDS` itself, so that record stays the
 * simple dispatch table it already was.
 */
export const SHELL_CHORD_DESCRIPTIONS: ChordDescriptor[] = [
  { shortcut: "⌘K", description: "Open search" },
  { shortcut: "⌘W", description: "Close the focused window" },
  { shortcut: "⌘M", description: "Minimize the focused window" },
  { shortcut: "⌘Q", description: "Quit the focused app" },
];

/**
 * Display form of `windowShortcuts.ts`'s window-management chords, which are
 * matched via `KeyboardEvent.code` predicates rather than menu-style chord
 * strings. Hand-transcribed — keep in sync if those chords ever change.
 */
export const WINDOW_CHORDS: ChordDescriptor[] = [
  { shortcut: "⌃⌥H", description: "Hide the focused app" },
  { shortcut: "⌃⌥←", description: "Snap the focused window to the left half" },
  { shortcut: "⌃⌥→", description: "Snap the focused window to the right half" },
  { shortcut: "⌃⌥↑", description: "Maximize the focused window" },
  { shortcut: "⌃⌥↓", description: "Restore the focused window to its normal size" },
  { shortcut: "⌥Tab", description: "Open or advance the app switcher (⌃⌥Tab off Mac)" },
  { shortcut: "⇧⌥Tab", description: "Advance the app switcher backward" },
  { shortcut: "⌃`", description: "Cycle windows of the focused app" },
];

/** Build the menu-style chord string ("⇧⌘N") for a keydown, or null. */
function chordFromEvent(e: KeyboardEvent): string | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey)
    return null;
  if (e.key.length !== 1)
    return null;
  const upper = e.key.toUpperCase();
  if (upper < "A" || upper > "Z")
    return null; // letters only — symbol chords stay menu-only
  return `${e.shiftKey ? "⇧" : ""}⌘${upper}`;
}

// Standard text-editing chords: when focus is in an editable control, these
// stay with the browser/input (select-all-text, copy, cut, paste, undo) even
// if the focused app also binds them to a menu item — otherwise e.g. Files'
// ⌘A "Select All" would hijack selecting text in its own Filter field.
const NATIVE_EDITING_LETTERS = new Set(["A", "C", "X", "V", "Z"]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * Bare ←/→ (and optionally Space) as a window-scoped media transport —
 * shortcuts.ts's global handler above only dispatches ⌘-letter chords, so
 * Player/Viewer need their own listener for this. Gated on `focused` and
 * skipped over editable targets so it doesn't hijack typing elsewhere.
 */
export function useBareArrowKeys(focused: boolean, onStep: (direction: -1 | 1) => void, onSpace?: () => void): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!focused || isEditableTarget(e.target))
        return;
      if (onSpace && (e.key === " " || e.code === "Space")) {
        e.preventDefault();
        onSpace();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        onStep(e.key === "ArrowLeft" ? -1 : 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused, onStep, onSpace]);
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // A registered overlay (MenuBar dropdown, SearchOverlay, ContextMenu,
      // …) is open — let it own the keyboard instead of racing shell chords
      // underneath it. Checked before ⌘K too: pressing ⌘K to open search
      // happens before search registers as open, so this only blocks
      // reopening/other chords once something's already up.
      if (isOverlayOpen())
        return;

      const chord = chordFromEvent(e);
      if (!chord)
        return;
      if (NATIVE_EDITING_LETTERS.has(chord.slice(-1)) && isEditableTarget(e.target))
        return;

      // Global search works from anywhere, including an empty desktop —
      // checked ahead of the focused-window lookup below rather than
      // folded into SHELL_CHORDS, which requires a focused window.
      if (chord === "⌘K") {
        e.preventDefault();
        useSearchStore.getState().openSearch();
        return;
      }

      const { focusedId, windows } = useWindowStore.getState();
      const win = windows.find(w => w.id === focusedId && !w.minimized);
      const app = win ? getApp(win.appId) : undefined;

      // The focused app's own menu shortcuts win (⌘N = new note, etc.).
      for (const section of app?.menus ?? []) {
        for (const item of section.items) {
          if (item.shortcut !== chord || item.disabled)
            continue;
          if (item.command) {
            e.preventDefault();
            executeCommand(item.command);
            return;
          }
          if (item.appCommand && focusedId) {
            e.preventDefault();
            emitAppCommand(focusedId, item.appCommand);
            return;
          }
        }
      }

      // Shell fallbacks — only when there's a window to act on, so an empty
      // desktop still lets the browser handle e.g. ⌘W.
      const shell = SHELL_CHORDS[chord];
      if (shell && win) {
        e.preventDefault();
        shell();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
