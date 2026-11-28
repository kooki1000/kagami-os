import type { MenuSection } from "./types";
import { create } from "zustand";

/**
 * Step 17 (D8.12) — shell chrome a sandboxed app drives over the bridge:
 * the menus shown while one of its windows is focused, and its dock badge.
 * Session-scoped like the notification history, never persisted: an app sets
 * both again on every launch.
 *
 * Menus are per window (two windows of one app can show different menus);
 * the badge is per app, because the dock tile is.
 */
interface AppChromeStore {
  menusByWindow: Record<string, MenuSection[]>;
  badgeByApp: Record<string, string>;
  setMenus: (windowId: string, sections: MenuSection[]) => void;
  clearMenus: (windowId: string) => void;
  setBadge: (appId: string, badge: string | null) => void;
}

export const useAppChromeStore = create<AppChromeStore>()(set => ({
  menusByWindow: {},
  badgeByApp: {},
  setMenus: (windowId, sections) =>
    set((state) => {
      if (sections.length === 0)
        return state.menusByWindow[windowId] ? { menusByWindow: omit(state.menusByWindow, windowId) } : state;
      return { menusByWindow: { ...state.menusByWindow, [windowId]: sections } };
    }),
  clearMenus: windowId =>
    set(state => (state.menusByWindow[windowId] ? { menusByWindow: omit(state.menusByWindow, windowId) } : state)),
  setBadge: (appId, badge) =>
    set((state) => {
      if (badge === null)
        return state.badgeByApp[appId] ? { badgeByApp: omit(state.badgeByApp, appId) } : state;
      return { badgeByApp: { ...state.badgeByApp, [appId]: badge } };
    }),
}));

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

/**
 * The menus to show for a focused window: what the frame set, if anything,
 * otherwise the manifest's own. A built-in app never calls `menus.set`, so
 * its manifest menus are always what comes back.
 */
export function menusForWindow(windowId: string | null | undefined, manifestMenus: MenuSection[] | undefined): MenuSection[] {
  const dynamic = windowId ? useAppChromeStore.getState().menusByWindow[windowId] : undefined;
  return dynamic ?? manifestMenus ?? [];
}
