import type { UiScale } from "@/design/tokens";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_ACCENT_ID,
  DEFAULT_WALLPAPER_ID,
} from "./palettes";

/** Optional menu-bar status items (U7) — whether each appears at all, independent of the clock's own format toggles below. */
export type MenuBarStatusItem = "offline" | "search" | "appearance" | "notifications" | "clock";

const DEFAULT_STATUS_ITEMS: Record<MenuBarStatusItem, boolean> = {
  offline: true,
  search: true,
  appearance: true,
  notifications: true,
  clock: true,
};

export interface WindowSize {
  width: number;
  height: number;
}

interface SettingsStore {
  accentId: string;
  wallpaperId: string;
  /** Auto-empty Trash items older than 30 days on boot (default off). */
  autoEmptyTrash: boolean;
  /** Interface density (U4) — small/default/large, see design/tokens.ts. */
  uiScale: UiScale;
  // User-chosen default app per exact mime type (B11), overriding
  // openFile.ts's built-in mime-family table. Keyed on the full mime type
  // (e.g. "image/png"), not the family prefix, so a choice for PNGs doesn't
  // bleed onto SVGs.
  fileAssociations: Record<string, string>;

  // U7 — menu bar & clock.
  /** 12-hour clock (default) vs. 24-hour. */
  clockHour12: boolean;
  /** Show a trailing :SS in the clock. */
  clockShowSeconds: boolean;
  /** Show the weekday before the time — the Clock component always did this pre-U7, so this defaults to `true` to leave untouched settings' output unchanged. */
  clockShowDate: boolean;
  /** Which optional menu-bar status items are shown at all. */
  statusItems: Record<MenuBarStatusItem, boolean>;

  // U9 — startup behaviour.
  /** Gates the boot-time `restoreSession()` call in App.tsx (default on — unchanged behavior). The `?fresh` URL param still bypasses restore regardless of this. */
  restoreSessionOnBoot: boolean;
  /** App ids launched at boot, in addition to whatever session restore brings back. */
  startupApps: string[];
  /** Per-app "Remember this size" override, consulted by launchApp before an app's own `defaultSize`. */
  defaultWindowSize: Record<string, WindowSize>;

  setAccent: (id: string) => void;
  setWallpaper: (id: string) => void;
  setAutoEmptyTrash: (value: boolean) => void;
  setUiScale: (value: UiScale) => void;
  setFileAssociation: (mimeType: string, appId: string) => void;
  clearFileAssociation: (mimeType: string) => void;

  setClockHour12: (value: boolean) => void;
  setClockShowSeconds: (value: boolean) => void;
  setClockShowDate: (value: boolean) => void;
  setStatusItemEnabled: (item: MenuBarStatusItem, value: boolean) => void;

  setRestoreSessionOnBoot: (value: boolean) => void;
  setStartupAppEnabled: (appId: string, value: boolean) => void;
  setDefaultWindowSize: (appId: string, size: WindowSize) => void;
  clearDefaultWindowSize: (appId: string) => void;
}

/**
 * User appearance + general choices. Persisted to localStorage so selections
 * survive a refresh; theme preference lives in themeStore and dock
 * size/position in dockStore, each persisted the same way.
 */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      accentId: DEFAULT_ACCENT_ID,
      wallpaperId: DEFAULT_WALLPAPER_ID,
      autoEmptyTrash: false,
      uiScale: "default",
      fileAssociations: {},

      clockHour12: true,
      clockShowSeconds: false,
      clockShowDate: true,
      statusItems: DEFAULT_STATUS_ITEMS,

      restoreSessionOnBoot: true,
      startupApps: [],
      defaultWindowSize: {},

      setAccent: id => set({ accentId: id }),
      setWallpaper: id => set({ wallpaperId: id }),
      setAutoEmptyTrash: value => set({ autoEmptyTrash: value }),
      setUiScale: value => set({ uiScale: value }),
      setFileAssociation: (mimeType, appId) =>
        set({ fileAssociations: { ...get().fileAssociations, [mimeType]: appId } }),
      clearFileAssociation: (mimeType) => {
        const { [mimeType]: _removed, ...rest } = get().fileAssociations;
        set({ fileAssociations: rest });
      },

      setClockHour12: value => set({ clockHour12: value }),
      setClockShowSeconds: value => set({ clockShowSeconds: value }),
      setClockShowDate: value => set({ clockShowDate: value }),
      setStatusItemEnabled: (item, value) =>
        set({ statusItems: { ...get().statusItems, [item]: value } }),

      setRestoreSessionOnBoot: value => set({ restoreSessionOnBoot: value }),
      setStartupAppEnabled: (appId, value) => {
        const current = get().startupApps;
        const has = current.includes(appId);
        if (value === has)
          return;
        set({
          startupApps: value ? [...current, appId] : current.filter(id => id !== appId),
        });
      },
      setDefaultWindowSize: (appId, size) =>
        set({ defaultWindowSize: { ...get().defaultWindowSize, [appId]: size } }),
      clearDefaultWindowSize: (appId) => {
        const { [appId]: _removed, ...rest } = get().defaultWindowSize;
        set({ defaultWindowSize: rest });
      },
    }),
    { name: "kagami-settings", version: 1 },
  ),
);
