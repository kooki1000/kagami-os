import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_ACCENT_ID,
  DEFAULT_WALLPAPER_ID,
} from "./palettes";

interface SettingsStore {
  accentId: string;
  wallpaperId: string;
  /** Auto-empty Trash items older than 30 days on boot (default off). */
  autoEmptyTrash: boolean;
  setAccent: (id: string) => void;
  setWallpaper: (id: string) => void;
  setAutoEmptyTrash: (value: boolean) => void;
}

/**
 * User appearance + general choices. Persisted to localStorage so selections
 * survive a refresh; theme preference lives in themeStore and dock
 * size/position in dockStore, each persisted the same way.
 */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    set => ({
      accentId: DEFAULT_ACCENT_ID,
      wallpaperId: DEFAULT_WALLPAPER_ID,
      autoEmptyTrash: false,
      setAccent: id => set({ accentId: id }),
      setWallpaper: id => set({ wallpaperId: id }),
      setAutoEmptyTrash: value => set({ autoEmptyTrash: value }),
    }),
    { name: "kagami-settings" },
  ),
);
