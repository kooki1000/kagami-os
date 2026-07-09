import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apps } from "../apps/registry";

export type DockSize = "small" | "medium" | "large";
export type DockPosition = "bottom" | "left" | "right";

/** Tile edge length in px for each size. */
export const DOCK_TILE_PX: Record<DockSize, number> = {
  small: 38,
  medium: 46,
  large: 56,
};

interface DockStore {
  pinnedIds: string[];
  size: DockSize;
  position: DockPosition;
  pin: (appId: string) => void;
  unpin: (appId: string) => void;
  setSize: (size: DockSize) => void;
  setPosition: (position: DockPosition) => void;
}

const defaultPinned = apps.filter(a => a.pinned).map(a => a.id);

export const useDockStore = create<DockStore>()(
  persist(
    (set, get) => ({
      pinnedIds: defaultPinned,
      size: "medium",
      position: "bottom",
      pin: (appId) => {
        if (!get().pinnedIds.includes(appId)) {
          set({ pinnedIds: [...get().pinnedIds, appId] });
        }
      },
      unpin: appId =>
        set({ pinnedIds: get().pinnedIds.filter(id => id !== appId) }),
      setSize: size => set({ size }),
      setPosition: position => set({ position }),
    }),
    { name: "kagami-dock" },
  ),
);
