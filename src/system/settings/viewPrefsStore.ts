import type { SortSpec } from "@/system/fs/fsStore";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SORT, onFsReady } from "@/system/fs/fsStore";

/** Ring-buffer cap for U14's "Recents" place — mirrors terminalStore-style small persisted lists. */
export const RECENT_FILES_MAX = 30;

interface ViewPrefsStore {
  /** Sort choice per folder id; absent folders fall back to DEFAULT_SORT. */
  sortByFolder: Record<string, SortSpec>;
  setSort: (folderId: string, sort: SortSpec) => void;
  /**
   * View mode per folder id (icons/list/details), absent folders falling back
   * to {@link DEFAULT_VIEW_MODE}. Per folder rather than global, and persisted,
   * because a folder of images wants icons while a folder of documents wants
   * details — and re-choosing on every visit is the papercut. Values are kept
   * as plain strings so this store doesn't depend on the Files app's types.
   */
  viewByFolder: Record<string, string>;
  setViewMode: (folderId: string, mode: string) => void;
  /** U14: user-pinned favourite node ids, most-recently-pinned last (sidebar renders them in this order). */
  favouriteIds: string[];
  toggleFavourite: (id: string) => void;
  /** U14: last-opened file ids, most-recent first, capped at {@link RECENT_FILES_MAX}. */
  recentIds: string[];
  recordRecent: (id: string) => void;
  clearRecents: () => void;
}

/**
 * Per-folder view preferences (currently just sort), plus a couple of
 * small Files-only persisted lists (favourites, recents) that share the
 * same "small UI pref, not document data" home. Kept out of the fs store —
 * favouriting/opening a file doesn't touch the VFS — and persisted to
 * localStorage like the other appearance stores.
 */
export const useViewPrefsStore = create<ViewPrefsStore>()(
  persist(
    (set, get) => ({
      sortByFolder: {},
      setSort: (folderId, sort) =>
        set(state => ({
          sortByFolder: { ...state.sortByFolder, [folderId]: sort },
        })),
      viewByFolder: {},
      setViewMode: (folderId, mode) =>
        set(state => ({
          viewByFolder: { ...state.viewByFolder, [folderId]: mode },
        })),
      favouriteIds: [],
      toggleFavourite: (id) => {
        const { favouriteIds } = get();
        set({
          favouriteIds: favouriteIds.includes(id)
            ? favouriteIds.filter(existing => existing !== id)
            : [...favouriteIds, id],
        });
      },
      recentIds: [],
      recordRecent: (id) => {
        set(state => ({ recentIds: pushRecent(state.recentIds, id, RECENT_FILES_MAX) }));
      },
      clearRecents: () => set({ recentIds: [] }),
    }),
    { name: "kagami-view-prefs", version: 1 },
  ),
);

/** The sort for a folder, or the default when none is saved. */
export function sortForFolder(
  sortByFolder: Record<string, SortSpec>,
  folderId: string,
): SortSpec {
  return sortByFolder[folderId] ?? DEFAULT_SORT;
}

/** The view mode saved for a folder, or the default when none is saved. */
export function viewModeForFolder(
  viewByFolder: Record<string, string>,
  folderId: string,
  fallback: string,
): string {
  return viewByFolder[folderId] ?? fallback;
}

/**
 * `sortByFolder` with any key whose folder no longer exists dropped. Pure —
 * unit-tested without the stores. Exported for testing; `pruneSortByFolder`
 * below is the store-wired caller.
 */
export function withoutStaleFolders<T>(
  byFolder: Record<string, T>,
  liveIds: ReadonlySet<string>,
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [folderId, value] of Object.entries(byFolder)) {
    if (liveIds.has(folderId))
      next[folderId] = value;
  }
  return next;
}

/**
 * Same idea as {@link withoutStaleFolders}, for the plain id lists
 * (favourites, recents) — drop anything whose node no longer exists.
 */
export function withoutStaleIds(ids: string[], liveIds: ReadonlySet<string>): string[] {
  const filtered = ids.filter(id => liveIds.has(id));
  return filtered.length === ids.length ? ids : filtered;
}

/**
 * Push `id` to the front of a most-recent-first ring buffer, de-duping any
 * earlier occurrence (re-opening a file bumps it to the top rather than
 * listing it twice) and capping the result at `max`. Pure — unit-tested
 * without the store.
 */
export function pushRecent(recentIds: string[], id: string, max: number): string[] {
  return [id, ...recentIds.filter(existing => existing !== id)].slice(0, max);
}

/**
 * Idle-time GC (review-backlog #13): `setSort` never has a removal path, so
 * a folder's entry outlives the folder itself — Move to Trash, then Empty
 * Trash, and the uuid still sits in `localStorage["kagami-view-prefs"]`
 * forever. Same shape as `fsStore.ts`'s `sweepUnreferencedBlobs`: run once,
 * after the fs store finishes booting, dropping anything with no live node.
 * U14's `favouriteIds`/`recentIds` are the same shape of leak (a pinned or
 * recently-opened node that's since been deleted forever), so this prunes
 * all three in one pass.
 */
function prunePersistedRefs(liveIds: Set<string>): void {
  const { sortByFolder, viewByFolder, favouriteIds, recentIds } = useViewPrefsStore.getState();
  const prunedSort = withoutStaleFolders(sortByFolder, liveIds);
  const prunedView = withoutStaleFolders(viewByFolder, liveIds);
  const prunedFavourites = withoutStaleIds(favouriteIds, liveIds);
  const prunedRecents = withoutStaleIds(recentIds, liveIds);
  const patch: Partial<ViewPrefsStore> = {};
  if (Object.keys(prunedSort).length !== Object.keys(sortByFolder).length)
    patch.sortByFolder = prunedSort;
  if (Object.keys(prunedView).length !== Object.keys(viewByFolder).length)
    patch.viewByFolder = prunedView;
  if (prunedFavourites !== favouriteIds)
    patch.favouriteIds = prunedFavourites;
  if (prunedRecents !== recentIds)
    patch.recentIds = prunedRecents;
  if (Object.keys(patch).length > 0)
    useViewPrefsStore.setState(patch);
}

onFsReady(prunePersistedRefs);
