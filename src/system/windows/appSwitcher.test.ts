import type { OsWindow } from "./windowStore";
import { describe, expect, it } from "vitest";
import { orderedRunningApps } from "./appSwitcher";

function win(id: string, appId: string, zIndex: number): OsWindow {
  return {
    id,
    appId,
    title: appId,
    screenId: "main",
    rect: { x: 0, y: 0, width: 100, height: 100 },
    restoreRect: null,
    mode: "normal",
    minimized: false,
    zIndex,
    minSize: { width: 100, height: 100 },
  };
}

describe("orderedRunningApps", () => {
  it("orders unique app ids by each app's highest zIndex, descending", () => {
    const windows = [
      win("w1", "files", 1),
      win("w2", "notes", 3),
      win("w3", "files", 2),
      win("w4", "viewer", 4),
    ];
    expect(orderedRunningApps(windows)).toEqual(["viewer", "notes", "files"]);
  });

  it("puts the focused app first, since focusing bumps its zIndex above every other window", () => {
    const windows = [win("w1", "files", 5), win("w2", "notes", 2)];
    expect(orderedRunningApps(windows)[0]).toBe("files");
  });

  it("returns an empty list when nothing is running", () => {
    expect(orderedRunningApps([])).toEqual([]);
  });

  it("returns a single app once, regardless of how many windows it has open", () => {
    const windows = [win("w1", "files", 1), win("w2", "files", 2), win("w3", "files", 3)];
    expect(orderedRunningApps(windows)).toEqual(["files"]);
  });
});
