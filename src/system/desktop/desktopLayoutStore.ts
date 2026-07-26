import type { DesktopIconSize } from "./desktopLayout";
import type { SortKey } from "@/system/fs/fsStore";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DesktopPoint {
  x: number;
  y: number;
}

interface DesktopLayoutStore {
  // Explicit, user-dragged icon positions only (B7). Anything without an
  // entry here falls back to a deterministic auto-placement computed from
  // the Desktop folder's child order, so most icons never need a stored
  // position at all — only ones the user has actually moved.
  positions: Record<string, DesktopPoint>;
  setPosition: (id: string, point: DesktopPoint) => void;

  // U8 — desktop preferences.
  /** Icon tile size; "medium" matches the pre-U8 fixed cell size (desktopLayout.ts's cellSizeFor). */
  iconSize: DesktopIconSize;
  /** Snap freeform drags to the auto-arrange grid instead of leaving them at the exact drop pixel. */
  gridSnap: boolean;
  /**
   * When on, every icon always renders at its `autoPosition` slot — `positions`
   * above is read but never consulted while this is true (and dragging is a
   * no-op), so turning it back off simply reveals whatever was last manually
   * arranged rather than losing it.
   */
  autoArrange: boolean;
  /** Sort order feeding both auto-arrange rank and grid-snap fallback order — reuses fsStore's SortKey (folders still sort first). */
  sortOrder: SortKey;

  setIconSize: (value: DesktopIconSize) => void;
  setGridSnap: (value: boolean) => void;
  setAutoArrange: (value: boolean) => void;
  setSortOrder: (value: SortKey) => void;
}

/**
 * Desktop icon positions + preferences, persisted to localStorage like the
 * other appearance/layout stores (theme, dock, view prefs) — independent of
 * the IndexedDB fs adapter.
 */
export const useDesktopLayoutStore = create<DesktopLayoutStore>()(
  persist(
    set => ({
      positions: {},
      setPosition: (id, point) =>
        set(state => ({ positions: { ...state.positions, [id]: point } })),

      iconSize: "medium",
      gridSnap: false,
      autoArrange: false,
      sortOrder: "name",

      setIconSize: value => set({ iconSize: value }),
      setGridSnap: value => set({ gridSnap: value }),
      setAutoArrange: value => set({ autoArrange: value }),
      setSortOrder: value => set({ sortOrder: value }),
    }),
    { name: "kagami-desktop-layout" },
  ),
);
