import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_ACCENT_ID,
  DEFAULT_WALLPAPER_ID,
} from "./palettes";

interface SettingsStore {
  accentId: string;
  wallpaperId: string;
  setAccent: (id: string) => void;
  setWallpaper: (id: string) => void;
}

/**
 * User appearance choices (accent + wallpaper). Persisted to localStorage
 * so selections survive a refresh; theme preference lives in themeStore and
 * dock size/position in dockStore, each persisted the same way.
 */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    set => ({
      accentId: DEFAULT_ACCENT_ID,
      wallpaperId: DEFAULT_WALLPAPER_ID,
      setAccent: id => set({ accentId: id }),
      setWallpaper: id => set({ wallpaperId: id }),
    }),
    { name: "kagami-settings" },
  ),
);
