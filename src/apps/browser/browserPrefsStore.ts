import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clampZoom, DEFAULT_ZOOM } from "./browserZoom";

interface BrowserPrefsStore {
  /**
   * Page zoom per host, the way every desktop browser scopes it: a site you
   * had to enlarge once should stay enlarged next visit, while the next site
   * you open is unaffected. Hosts sitting at {@link DEFAULT_ZOOM} are deleted
   * rather than stored, so this doesn't accumulate an entry per site visited.
   */
  zoomByHost: Record<string, number>;
  setZoomForHost: (host: string, level: number) => void;
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
    }),
    { name: "kagami-browser-prefs", version: 1 },
  ),
);

/** The stored zoom for a host, or {@link DEFAULT_ZOOM} if it has none. */
export function zoomForHost(zoomByHost: Record<string, number>, host: string): number {
  return zoomByHost[host] ?? DEFAULT_ZOOM;
}
