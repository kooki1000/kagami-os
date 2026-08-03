import type { NotesScopeMode, NotesSortSpec } from "./notesFilter";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { onFsReady } from "@/system/fs/fsStore";
import { withoutStaleIds } from "@/system/settings/viewPrefsStore";
import { DEFAULT_NOTES_SORT } from "./notesFilter";

export const MIN_NOTE_FONT_SIZE = 11;
export const MAX_NOTE_FONT_SIZE = 28;
export const DEFAULT_NOTE_FONT_SIZE = 13;

/** Keeps the font-size stepper inside sane bounds regardless of the step direction. */
export function clampNoteFontSize(size: number): number {
  return Math.min(MAX_NOTE_FONT_SIZE, Math.max(MIN_NOTE_FONT_SIZE, size));
}

interface NotesPrefsStore {
  /** Ids of pinned notes, most-recently-pinned last — shown ahead of the rest of the sidebar list. */
  pinnedIds: string[];
  scopeMode: NotesScopeMode;
  sort: NotesSortSpec;
  /** Editor font size in px, independent of (but still multiplied by) `--ui-scale` — see NoteEditor.tsx. */
  fontSize: number;
  togglePinned: (id: string) => void;
  setScopeMode: (mode: NotesScopeMode) => void;
  setSort: (sort: NotesSortSpec) => void;
  stepFontSize: (delta: number) => void;
}

/**
 * Notes' sidebar preferences (U11) — pinning, scope, sort, and the editor's
 * font size. Kept out of the fs store (small UI prefs, not
 * document data) and persisted to localStorage, same shape as Files'
 * `viewPrefsStore` — `pinnedIds` mirrors `favouriteIds`'s plain-array pattern
 * so it needs no custom (de)serialization.
 */
export const useNotesPrefsStore = create<NotesPrefsStore>()(
  persist(
    (set, get) => ({
      pinnedIds: [],
      scopeMode: "subtree",
      sort: DEFAULT_NOTES_SORT,
      fontSize: DEFAULT_NOTE_FONT_SIZE,
      togglePinned: (id) => {
        const { pinnedIds } = get();
        set({
          pinnedIds: pinnedIds.includes(id)
            ? pinnedIds.filter(existing => existing !== id)
            : [...pinnedIds, id],
        });
      },
      setScopeMode: mode => set({ scopeMode: mode }),
      setSort: sort => set({ sort }),
      stepFontSize: delta => set({ fontSize: clampNoteFontSize(get().fontSize + delta) }),
    }),
    {
      name: "kagami-notes-prefs",
      version: 3,
      /**
       * v2 → v3 drops `wordWrap`. D9's editor lays out rich text, so there
       * is no no-wrap mode for the setting to mean anything about — leaving
       * the key behind would just be state nothing reads.
       */
      migrate: (persisted) => {
        if (persisted === null || typeof persisted !== "object")
          return persisted as NotesPrefsStore;
        const { wordWrap: _dropped, ...rest } = persisted as NotesPrefsStore & { wordWrap?: boolean };
        return rest as NotesPrefsStore;
      },
    },
  ),
);

/** Idle-time GC (same rationale as `viewPrefsStore`'s `pruneSortByFolder`): a deleted/emptied-from-trash note shouldn't leave its id pinned forever. */
function prunePinned(liveIds: Set<string>): void {
  const { pinnedIds } = useNotesPrefsStore.getState();
  const pruned = withoutStaleIds(pinnedIds, liveIds);
  if (pruned !== pinnedIds)
    useNotesPrefsStore.setState({ pinnedIds: pruned });
}

onFsReady(prunePinned);
