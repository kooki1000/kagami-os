import { useEffect } from "react";
import { emitAppCommand } from "./appCommands";
import { getApp } from "./apps/registry";
import { executeCommand } from "./commands";
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
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
