import type { WallpaperFit } from "./palettes";
import type { UiScale } from "@/design/tokens";
import type { ResolvedTheme } from "@/system/theme/themeStore";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useThemeStore } from "@/system/theme/themeStore";
import {
  DEFAULT_ACCENT_ID,
  DEFAULT_WALLPAPER_ID,
} from "./palettes";

/**
 * U6: explicit override of the OS "reduce motion" media query
 * (`useReducedMotion`). `"system"` defers to the OS query; `"on"`/`"off"`
 * win over it regardless of what the OS reports.
 */
export type ReduceMotionPreference = "system" | "on" | "off";

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

  /**
   * U1: a user-chosen wallpaper image per theme, referencing a VFS file id
   * (resolved to a usable URL by `wallpaperBlobUrl.ts`, not stored here).
   * `null` for a theme falls through to the preset wallpaper.
   */
  wallpaperFileId: { light: string | null; dark: string | null };
  /** U1: how a custom wallpaper image is sized/positioned — presets ignore this (they're gradients, not images). */
  wallpaperFit: WallpaperFit;

  /** U2: a user-picked accent hex overriding the preset; `null` falls through to the preset accent. */
  customAccentHex: string | null;

  /** U6: explicit reduce-motion override layered on top of the OS media query. */
  reduceMotion: ReduceMotionPreference;
  /**
   * U6: multiplier on window enter/minimize animation durations —
   * `Window.tsx` divides its base durations by this (so 2 = twice as fast,
   * 0.5 = twice as slow). Ignored when motion is reduced.
   */
  animationSpeed: number;
  /** U6: opacity (0-1) of a dark scrim between the wallpaper and the window layer. */
  wallpaperDim: number;

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

  /** Sets (or clears, with `null`) the custom wallpaper file for one theme. */
  setWallpaperFile: (theme: ResolvedTheme, fileId: string | null) => void;
  setWallpaperFit: (fit: WallpaperFit) => void;
  /** Sets (or clears, with `null`) the custom accent override. */
  setCustomAccentHex: (hex: string | null) => void;
  setReduceMotion: (value: ReduceMotionPreference) => void;
  setAnimationSpeed: (value: number) => void;
  setWallpaperDim: (value: number) => void;

  setClockHour12: (value: boolean) => void;
  setClockShowSeconds: (value: boolean) => void;
  setClockShowDate: (value: boolean) => void;
  setStatusItemEnabled: (item: MenuBarStatusItem, value: boolean) => void;

  setRestoreSessionOnBoot: (value: boolean) => void;
  setStartupAppEnabled: (appId: string, value: boolean) => void;
  setDefaultWindowSize: (appId: string, size: WindowSize) => void;
  clearDefaultWindowSize: (appId: string) => void;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Keeps the minimize/enter animation multiplier in a sane, non-zero range — a stray 0 or negative value would otherwise divide `Window.tsx`'s durations into `Infinity`/negative. */
const MIN_ANIMATION_SPEED = 0.25;
const MAX_ANIMATION_SPEED = 4;
function clampAnimationSpeed(n: number): number {
  if (!Number.isFinite(n))
    return 1;
  return Math.min(MAX_ANIMATION_SPEED, Math.max(MIN_ANIMATION_SPEED, n));
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

      wallpaperFileId: { light: null, dark: null },
      wallpaperFit: "fill",
      customAccentHex: null,
      reduceMotion: "system",
      animationSpeed: 1,
      wallpaperDim: 0,

      clockHour12: true,
      clockShowSeconds: false,
      clockShowDate: true,
      statusItems: DEFAULT_STATUS_ITEMS,

      restoreSessionOnBoot: true,
      startupApps: [],
      defaultWindowSize: {},

      // Picking a preset is a "use this instead" action — it clears whatever
      // custom override (U1/U2) was layered on top, otherwise the preset
      // click would appear to do nothing while the custom color/image kept
      // winning in themeVariables.
      setAccent: id => set({ accentId: id, customAccentHex: null }),
      setWallpaper: id => set({ wallpaperId: id, wallpaperFileId: { light: null, dark: null } }),
      setAutoEmptyTrash: value => set({ autoEmptyTrash: value }),
      setUiScale: value => set({ uiScale: value }),
      setFileAssociation: (mimeType, appId) =>
        set({ fileAssociations: { ...get().fileAssociations, [mimeType]: appId } }),
      clearFileAssociation: (mimeType) => {
        const { [mimeType]: _removed, ...rest } = get().fileAssociations;
        set({ fileAssociations: rest });
      },

      setWallpaperFile: (theme, fileId) =>
        set({ wallpaperFileId: { ...get().wallpaperFileId, [theme]: fileId } }),
      setWallpaperFit: fit => set({ wallpaperFit: fit }),
      setCustomAccentHex: hex => set({ customAccentHex: hex }),
      setReduceMotion: value => set({ reduceMotion: value }),
      setAnimationSpeed: value => set({ animationSpeed: clampAnimationSpeed(value) }),
      setWallpaperDim: value => set({ wallpaperDim: clamp01(value) }),
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

/**
 * Cross-branch entry point (U1): sets `fileId` — a file already in the VFS,
 * e.g. an image node Viewer (`feat/viewer-depth`) has open — as the custom
 * wallpaper for whichever theme is currently resolved. A plain exported
 * function rather than a store action so a "Set as wallpaper" button
 * elsewhere can call straight into it without needing to know
 * settingsStore's shape or reach for both stores itself.
 */
export function setWallpaperFromFile(fileId: string): void {
  const theme = useThemeStore.getState().resolved;
  useSettingsStore.getState().setWallpaperFile(theme, fileId);
}
