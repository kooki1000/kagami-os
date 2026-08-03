import { create } from "zustand";
import { persist } from "zustand/middleware";
import { navigableUrl } from "./browserUrl";
import { clampZoom, DEFAULT_ZOOM } from "./browserZoom";

/** A saved page. `title` is the page's own, captured when it was bookmarked. */
export interface Bookmark {
  url: string;
  title: string;
}

interface BrowserPrefsStore {
  /**
   * Page zoom per host, the way every desktop browser scopes it: a site you
   * had to enlarge once should stay enlarged next visit, while the next site
   * you open is unaffected. Hosts sitting at {@link DEFAULT_ZOOM} are deleted
   * rather than stored, so this doesn't accumulate an entry per site visited.
   */
  zoomByHost: Record<string, number>;
  setZoomForHost: (host: string, level: number) => void;

  /** Saved pages, in the order they were added — the bookmarks bar reads this directly. */
  bookmarks: Bookmark[];
  /** Whether the bar under the address bar is shown; it steals content height, so it's opt-in. */
  showBookmarksBar: boolean;
  /**
   * Adds the page, or removes it if it's already saved — one star button, both
   * directions, which is also the only way to remove a bookmark for a page
   * you're currently on.
   */
  toggleBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (url: string) => void;
  setShowBookmarksBar: (value: boolean) => void;
}

/**
 * Bookmarks are matched on the exact URL. Comparing normalized URLs would let
 * `example.com/a` and `example.com/a#b` collide, and a fragment is a real
 * distinction on a documentation page.
 */
export function isBookmarked(bookmarks: Bookmark[], url: string): boolean {
  return bookmarks.some(bookmark => bookmark.url === url);
}

/**
 * Browser preferences that outlive a window (U17). Persisted to localStorage
 * next to the other per-app prefs (`notesPrefsStore`, Files' `viewPrefsStore`)
 * rather than to settingsStore, which holds shell-wide appearance — the one
 * Browser setting that *is* shell-wide, the search engine, lives there.
 */
export const useBrowserPrefsStore = create<BrowserPrefsStore>()(
  persist(
    (set, get) => ({
      zoomByHost: {},
      setZoomForHost: (host, level) => {
        if (!host)
          return;
        const clamped = clampZoom(level);
        const { [host]: _current, ...rest } = get().zoomByHost;
        set({
          zoomByHost: clamped === DEFAULT_ZOOM ? rest : { ...rest, [host]: clamped },
        });
      },

      bookmarks: [],
      showBookmarksBar: false,
      toggleBookmark: (bookmark) => {
        // Re-validated on the way in: a bookmark is a URL that gets navigated
        // to later, on a click, long after whatever produced it is gone.
        const url = navigableUrl(bookmark.url);
        if (!url)
          return;
        const { bookmarks } = get();
        set({
          bookmarks: isBookmarked(bookmarks, url)
            ? bookmarks.filter(existing => existing.url !== url)
            : [...bookmarks, { url, title: bookmark.title.trim() || url }],
        });
      },
      removeBookmark: url =>
        set({ bookmarks: get().bookmarks.filter(bookmark => bookmark.url !== url) }),
      setShowBookmarksBar: value => set({ showBookmarksBar: value }),
    }),
    { name: "kagami-browser-prefs", version: 1 },
  ),
);

/** The stored zoom for a host, or {@link DEFAULT_ZOOM} if it has none. */
export function zoomForHost(zoomByHost: Record<string, number>, host: string): number {
  return zoomByHost[host] ?? DEFAULT_ZOOM;
}
