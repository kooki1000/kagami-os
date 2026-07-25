import type { SortSpec } from "@/system/fs/fsStore";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SORT, useFsStore } from "@/system/fs/fsStore";

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

/**
 * `sortByFolder` with any key whose folder no longer exists dropped. Pure —
 * unit-tested without the stores. Exported for testing; `pruneSortByFolder`
 * below is the store-wired caller.
 */
export function withoutStaleFolders(
  sortByFolder: Record<string, SortSpec>,
  liveIds: ReadonlySet<string>,
): Record<string, SortSpec> {
  const next: Record<string, SortSpec> = {};
  for (const [folderId, sort] of Object.entries(sortByFolder)) {
    if (liveIds.has(folderId))
      next[folderId] = sort;
  }
  return next;
}

/**
 * Idle-time GC (review-backlog #13): `setSort` never has a removal path, so
 * a folder's entry outlives the folder itself — Move to Trash, then Empty
 * Trash, and the uuid still sits in `localStorage["kagami-view-prefs"]`
 * forever. Same shape as `fsStore.ts`'s `sweepUnreferencedBlobs`: run once,
 * after the fs store finishes booting, dropping anything with no live node.
 */
function pruneSortByFolder(): void {
  const { sortByFolder } = useViewPrefsStore.getState();
  const liveIds = new Set(Object.keys(useFsStore.getState().nodes));
  const pruned = withoutStaleFolders(sortByFolder, liveIds);
  if (Object.keys(pruned).length !== Object.keys(sortByFolder).length)
    useViewPrefsStore.setState({ sortByFolder: pruned });
}

// `init()` is memoized (`fsStore.ts`'s `initPromise`), so kicking it off
// again here — regardless of whether App.tsx's own boot call has already
// run — just joins the same promise rather than booting twice.
void useFsStore.getState().init().then(pruneSortByFolder);
