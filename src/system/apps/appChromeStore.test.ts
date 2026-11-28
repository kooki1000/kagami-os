import type { MenuSection } from "./types";
import { beforeEach, describe, expect, it } from "vitest";
import { menusForWindow, useAppChromeStore } from "./appChromeStore";

const sections: MenuSection[] = [{ title: "Note", items: [{ label: "New", appCommand: "note.new" }] }];
const manifestMenus: MenuSection[] = [{ title: "File", items: [{ label: "Open", appCommand: "open" }] }];

beforeEach(() => {
  useAppChromeStore.setState({ menusByWindow: {}, badgeByApp: {} });
});

describe("appChromeStore", () => {
  it("prefers the menus a frame set for a window over the manifest's", () => {
    expect(menusForWindow("w1", manifestMenus)).toBe(manifestMenus);
    useAppChromeStore.getState().setMenus("w1", sections);
    expect(menusForWindow("w1", manifestMenus)).toBe(sections);
    expect(menusForWindow("w2", manifestMenus)).toBe(manifestMenus);
  });

  it("an empty list or clearMenus falls back to the manifest", () => {
    const { setMenus, clearMenus } = useAppChromeStore.getState();
    setMenus("w1", sections);
    setMenus("w1", []);
    expect(menusForWindow("w1", manifestMenus)).toBe(manifestMenus);
    setMenus("w1", sections);
    clearMenus("w1");
    expect(menusForWindow("w1", manifestMenus)).toBe(manifestMenus);
  });

  it("sets and clears a badge per app", () => {
    const { setBadge } = useAppChromeStore.getState();
    setBadge("a", "3");
    setBadge("b", "new");
    setBadge("a", null);
    expect(useAppChromeStore.getState().badgeByApp).toEqual({ b: "new" });
  });
});
