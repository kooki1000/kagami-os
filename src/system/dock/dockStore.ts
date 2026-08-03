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

/**
 * v1 → v2 migration: strip the Welcome tile from a persisted dock. Welcome
 * shipped as a default pin and no longer is (see `welcome/index.ts`), and
 * {@link reconcilePinned} only ever adds, so nothing else would ever remove
 * it. Leaves `knownDefaults` alone — "welcome was offered once" stays true,
 * and it isn't a current default any more, so it can't be backfilled either.
 * Pure and exported for testing, like `reconcilePinned`.
 */
export function dropWelcomePin(persisted: unknown): unknown {
  if (persisted === null || typeof persisted !== "object")
    return persisted;
  const saved = persisted as Partial<DockStore>;
  if (!Array.isArray(saved.pinnedIds))
    return persisted;
  return { ...saved, pinnedIds: saved.pinnedIds.filter(id => id !== "welcome") };
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
      version: 2,
      // v1 → v2: Welcome stopped being a default pin. `reconcilePinned` only
      // ever *adds* — by design, so a deliberate unpin is never resurrected —
      // which means an install that already has "welcome" in `pinnedIds` would
      // keep the tile forever. Drop it once here; `migrate` runs before
      // `merge`, so `reconcilePinned` below then sees the cleaned list.
      migrate: persisted => dropWelcomePin(persisted),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<DockStore>;
        const state = { ...current, ...saved };
        return { ...state, ...reconcilePinned(state.pinnedIds, saved.knownDefaults) };
      },
    },
  ),
);
