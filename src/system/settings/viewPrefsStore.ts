import type { SortSpec } from "@/system/fs/fsStore";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SORT } from "@/system/fs/fsStore";

interface ViewPrefsStore {
  /** Sort choice per folder id; absent folders fall back to DEFAULT_SORT. */
  sortByFolder: Record<string, SortSpec>;
  setSort: (folderId: string, sort: SortSpec) => void;
}

/**
 * Per-folder view preferences (currently just sort). Kept out of the fs
 * store — it's a small UI pref, not document data — and persisted to
 * localStorage like the other appearance stores.
 */
export const useViewPrefsStore = create<ViewPrefsStore>()(
  persist(
    set => ({
      sortByFolder: {},
      setSort: (folderId, sort) =>
        set(state => ({
          sortByFolder: { ...state.sortByFolder, [folderId]: sort },
        })),
    }),
    { name: "kagami-view-prefs" },
  ),
);

/** The sort for a folder, or the default when none is saved. */
export function sortForFolder(
  sortByFolder: Record<string, SortSpec>,
  folderId: string,
): SortSpec {
  return sortByFolder[folderId] ?? DEFAULT_SORT;
}
