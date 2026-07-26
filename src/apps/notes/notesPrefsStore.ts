import type { NotesScopeMode, NotesSortSpec } from "./notesFilter";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useFsStore } from "@/system/fs/fsStore";
import { DEFAULT_NOTES_SORT } from "./notesFilter";

export const MIN_NOTE_FONT_SIZE = 11;
export const MAX_NOTE_FONT_SIZE = 28;
export const DEFAULT_NOTE_FONT_SIZE = 13;

/** Keeps the font-size stepper inside sane bounds regardless of the step direction. */
export function clampNoteFontSize(size: number): number {
  return Math.min(MAX_NOTE_FONT_SIZE, Math.max(MIN_NOTE_FONT_SIZE, size));
}

interface NotesPrefsStore {
  /** Ids of pinned notes — shown ahead of the rest of the sidebar list. */
  pinnedIds: Set<string>;
  scopeMode: NotesScopeMode;
  sort: NotesSortSpec;
  /** Editor font size in px, independent of (but still multiplied by) `--ui-scale` — see NotesApp.tsx. */
  fontSize: number;
  wordWrap: boolean;
  togglePinned: (id: string) => void;
  setScopeMode: (mode: NotesScopeMode) => void;
  setSort: (sort: NotesSortSpec) => void;
  stepFontSize: (delta: number) => void;
  setWordWrap: (value: boolean) => void;
}

// `Set` isn't JSON-round-trippable by default (`JSON.stringify` on a Set
// yields "{}") — a small replacer/reviver pair on top of createJSONStorage
// stores it as a plain array instead, same trick any Set-shaped persisted
// field needs.
function replacer(_key: string, value: unknown): unknown {
  return value instanceof Set ? { __set: [...value] } : value;
}
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && "__set" in value)
    return new Set((value as { __set: string[] }).__set);
  return value;
}

/**
 * Notes' sidebar preferences (U11) — pinning, scope, sort, and the editor's
 * font size/soft-wrap choice. Kept out of the fs store (small UI prefs, not
 * document data) and persisted to localStorage, same shape as Files'
 * `viewPrefsStore`.
 */
export const useNotesPrefsStore = create<NotesPrefsStore>()(
  persist(
    (set, get) => ({
      pinnedIds: new Set(),
      scopeMode: "subtree",
      sort: DEFAULT_NOTES_SORT,
      fontSize: DEFAULT_NOTE_FONT_SIZE,
      wordWrap: true,
      togglePinned: (id) => {
        const next = new Set(get().pinnedIds);
        if (next.has(id))
          next.delete(id);
        else
          next.add(id);
        set({ pinnedIds: next });
      },
      setScopeMode: mode => set({ scopeMode: mode }),
      setSort: sort => set({ sort }),
      stepFontSize: delta => set({ fontSize: clampNoteFontSize(get().fontSize + delta) }),
      setWordWrap: value => set({ wordWrap: value }),
    }),
    {
      name: "kagami-notes-prefs",
      version: 1,
      storage: createJSONStorage(() => localStorage, { replacer, reviver }),
    },
  ),
);

/**
 * `pinnedIds` with any id whose node no longer exists dropped. Pure —
 * unit-tested without the stores, same shape as `viewPrefsStore`'s
 * `withoutStaleFolders`.
 */
export function withoutStalePins(pinnedIds: ReadonlySet<string>, liveIds: ReadonlySet<string>): Set<string> {
  const next = new Set<string>();
  for (const id of pinnedIds) {
    if (liveIds.has(id))
      next.add(id);
  }
  return next;
}

/** Idle-time GC (same rationale as `viewPrefsStore`'s `pruneSortByFolder`): a deleted/emptied-from-trash note shouldn't leave its id pinned forever. */
function prunePinned(): void {
  const { pinnedIds } = useNotesPrefsStore.getState();
  const liveIds = new Set(Object.keys(useFsStore.getState().nodes));
  const pruned = withoutStalePins(pinnedIds, liveIds);
  if (pruned.size !== pinnedIds.size)
    useNotesPrefsStore.setState({ pinnedIds: pruned });
}

// `init()` is memoized (`fsStore.ts`'s `initPromise`), so this just joins
// whatever boot is already underway rather than kicking off a second one.
void useFsStore.getState().init().then(prunePinned);
