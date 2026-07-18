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
  // User-chosen default app per exact mime type (B11), overriding
  // openFile.ts's built-in mime-family table. Keyed on the full mime type
  // (e.g. "image/png"), not the family prefix, so a choice for PNGs doesn't
  // bleed onto SVGs.
  fileAssociations: Record<string, string>;
  setAccent: (id: string) => void;
  setWallpaper: (id: string) => void;
  setAutoEmptyTrash: (value: boolean) => void;
  setFileAssociation: (mimeType: string, appId: string) => void;
  clearFileAssociation: (mimeType: string) => void;
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
      fileAssociations: {},
      setAccent: id => set({ accentId: id }),
      setWallpaper: id => set({ wallpaperId: id }),
      setAutoEmptyTrash: value => set({ autoEmptyTrash: value }),
      setFileAssociation: (mimeType, appId) =>
        set({ fileAssociations: { ...get().fileAssociations, [mimeType]: appId } }),
      clearFileAssociation: (mimeType) => {
        const { [mimeType]: _removed, ...rest } = get().fileAssociations;
        set({ fileAssociations: rest });
      },
    }),
    { name: "kagami-settings" },
  ),
);
