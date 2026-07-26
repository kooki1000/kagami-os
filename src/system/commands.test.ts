import { beforeEach, describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { useSettingsStore } from "./settings/settingsStore";
import { useWindowStore } from "./windows/windowStore";

const VIEWPORT = { width: 1000, height: 800 };

function reset() {
  useWindowStore.setState({
    windows: [],
    focusedId: null,
    nextZ: 1,
    snapPreview: null,
    viewport: VIEWPORT,
    hiddenApps: new Set(),
  });
  useSettingsStore.setState({ defaultWindowSize: {} });
}

beforeEach(reset);

function openAndFocus(appId: string, size = { width: 500, height: 350 }) {
  const id = useWindowStore.getState().openWindow(appId, { title: appId, size });
  useWindowStore.getState().focusWindow(id);
  return id;
}

describe("executeCommand — window.rememberSize (U9)", () => {
  it("does nothing with no focused window", () => {
    executeCommand("window.rememberSize");
    expect(useSettingsStore.getState().defaultWindowSize).toEqual({});
  });

  it("records the focused window's current normal-mode rect for its app", () => {
    openAndFocus("notes", { width: 500, height: 350 });
    executeCommand("window.rememberSize");
    expect(useSettingsStore.getState().defaultWindowSize.notes).toEqual({ width: 500, height: 350 });
  });

  it("uses restoreRect (not the maximized rect) when the window is maximized", () => {
    const id = openAndFocus("notes", { width: 500, height: 350 });
    useWindowStore.getState().maximizeWindow(id);
    executeCommand("window.rememberSize");
    // The maximized rect fills the viewport, not 500x350 — remembering that
    // would be useless as a "default size" going forward.
    expect(useSettingsStore.getState().defaultWindowSize.notes).toEqual({ width: 500, height: 350 });
  });

  it("overwrites a previous remembered size for the same app", () => {
    openAndFocus("notes", { width: 500, height: 350 });
    executeCommand("window.rememberSize");
    useWindowStore.getState().resizeWindow(useWindowStore.getState().focusedId!, { x: 0, y: 40, width: 600, height: 400 });
    executeCommand("window.rememberSize");
    expect(useSettingsStore.getState().defaultWindowSize.notes).toEqual({ width: 600, height: 400 });
  });
});
