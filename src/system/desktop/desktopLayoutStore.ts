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
}

/**
 * Desktop icon positions, persisted to localStorage like the other
 * appearance/layout stores (theme, dock, view prefs) — independent of the
 * IndexedDB fs adapter.
 */
export const useDesktopLayoutStore = create<DesktopLayoutStore>()(
  persist(
    set => ({
      positions: {},
      setPosition: (id, point) =>
        set(state => ({ positions: { ...state.positions, [id]: point } })),
    }),
    { name: "kagami-desktop-layout" },
  ),
);
