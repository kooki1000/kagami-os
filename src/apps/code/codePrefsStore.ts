import type { FileScopeMode, FileSortSpec } from "@/system/fs/fileScope";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { onFsReady } from "@/system/fs/fsStore";
import { withoutStaleIds } from "@/system/settings/viewPrefsStore";

export const MIN_CODE_FONT_SIZE = 10;
export const MAX_CODE_FONT_SIZE = 24;
const DEFAULT_CODE_FONT_SIZE = 13;

/** Keeps the font-size stepper inside sane bounds regardless of the step direction. */
export function clampCodeFontSize(size: number): number {
  return Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, size));
}

/** Name-first: a source tree is browsed by path, not by when a file last changed. */
const DEFAULT_CODE_SORT: FileSortSpec = { key: "name", dir: "asc" };

interface CodePrefsStore {
  /** Ids of pinned files, most-recently-pinned last — shown ahead of the rest of the sidebar list. */
  pinnedIds: string[];
  scopeMode: FileScopeMode;
  sort: FileSortSpec;
  /** Editor font size in px, independent of (but still multiplied by) `--ui-scale`. */
  fontSize: number;
  /** Soft-wrap long lines. Off by default: wrapping code changes what a line *is*. */
  wrap: boolean;
  lineNumbers: boolean;
  togglePinned: (id: string) => void;
  setScopeMode: (mode: FileScopeMode) => void;
  setSort: (sort: FileSortSpec) => void;
  stepFontSize: (delta: number) => void;
  toggleWrap: () => void;
  toggleLineNumbers: () => void;
}

/**
 * The code editor's own preferences (D4) — sidebar scope/sort/pinning plus the
 * editor's display settings. Same shape and rationale as Notes'
 * `notesPrefsStore`: small UI prefs, not document data, so they live in
 * localStorage rather than the fs store, and pinned ids are a plain array so
 * they need no custom (de)serialization.
 */
export const useCodePrefsStore = create<CodePrefsStore>()(
  persist(
    (set, get) => ({
      pinnedIds: [],
      scopeMode: "subtree",
      sort: DEFAULT_CODE_SORT,
      fontSize: DEFAULT_CODE_FONT_SIZE,
      wrap: false,
      lineNumbers: true,
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
      stepFontSize: delta => set({ fontSize: clampCodeFontSize(get().fontSize + delta) }),
      toggleWrap: () => set({ wrap: !get().wrap }),
      toggleLineNumbers: () => set({ lineNumbers: !get().lineNumbers }),
    }),
    { name: "kagami-code-prefs", version: 1 },
  ),
);

/** Idle-time GC (same rationale as `viewPrefsStore`'s `pruneSortByFolder`): a deleted file shouldn't leave its id pinned forever. */
function prunePinned(liveIds: Set<string>): void {
  const { pinnedIds } = useCodePrefsStore.getState();
  const pruned = withoutStaleIds(pinnedIds, liveIds);
  if (pruned !== pinnedIds)
    useCodePrefsStore.setState({ pinnedIds: pruned });
}

onFsReady(prunePinned);
