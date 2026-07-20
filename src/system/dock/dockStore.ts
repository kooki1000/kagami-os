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
  /** Default-pinned ids already offered — distinguishes a new app from an unpinned one. */
  knownDefaults: string[];
  size: DockSize;
  position: DockPosition;
  pin: (appId: string) => void;
  unpin: (appId: string) => void;
  setSize: (size: DockSize) => void;
  setPosition: (position: DockPosition) => void;
}

const defaultPinned = apps.filter(a => a.pinned).map(a => a.id);

/**
 * Add defaults this install hasn't been offered yet. A persisted `pinnedIds`
 * replaces the initial value wholesale, so apps shipped after a user's first
 * visit never reached their dock; keying off `knownDefaults` instead backfills
 * those without resurrecting a deliberate unpin. Pass the *persisted*
 * `knownDefaults` — an install predating the field must read as "none offered".
 */
export function reconcilePinned(
  pinnedIds: string[],
  knownDefaults: string[] | undefined,
  currentDefaults: string[] = defaultPinned,
): { pinnedIds: string[]; knownDefaults: string[] } {
  const known = new Set(knownDefaults ?? []);
  const unseen = currentDefaults.filter(
    id => !known.has(id) && !pinnedIds.includes(id),
  );
  return {
    pinnedIds: [...pinnedIds, ...unseen],
    knownDefaults: [...new Set([...known, ...currentDefaults])],
  };
}

export const useDockStore = create<DockStore>()(
  persist(
    (set, get) => ({
      pinnedIds: defaultPinned,
      knownDefaults: defaultPinned,
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
    {
      name: "kagami-dock",
      version: 1,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<DockStore>;
        const state = { ...current, ...saved };
        return { ...state, ...reconcilePinned(state.pinnedIds, saved.knownDefaults) };
      },
    },
  ),
);
