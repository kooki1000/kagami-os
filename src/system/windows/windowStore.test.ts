import type { OpenWindowOptions } from "./windowStore";
import { beforeEach, describe, expect, it } from "vitest";
import { MENU_BAR_HEIGHT, useWindowStore } from "./windowStore";

const VIEWPORT = { width: 1000, height: 800 };

function reset() {
  useWindowStore.setState({
    windows: [],
    focusedId: null,
    nextZ: 1,
    snapPreview: null,
    viewport: VIEWPORT,
  });
}

const api = () => useWindowStore.getState();
const win = (id: string) => api().windows.find(w => w.id === id)!;

function open(appId = "files", opts: Partial<OpenWindowOptions> = {}) {
  return api().openWindow(appId, {
    title: opts.title ?? appId,
    size: opts.size ?? { width: 400, height: 300 },
    minSize: opts.minSize,
    singleInstance: opts.singleInstance,
    payload: opts.payload,
  });
}

beforeEach(reset);

describe("openWindow", () => {
  it("adds and focuses a window, returning its id", () => {
    const id = open();
    expect(api().windows).toHaveLength(1);
    expect(api().focusedId).toBe(id);
    expect(win(id).appId).toBe("files");
    expect(win(id).minimized).toBe(false);
    expect(win(id).mode).toBe("normal");
  });

  it("setWindowTitle updates the title in place", () => {
    const id = open("viewer", { title: "old.png" });
    api().setWindowTitle(id, "new.png");
    expect(win(id).title).toBe("new.png");
    // No-op for unknown ids / unchanged titles (no needless re-render churn).
    const before = api().windows;
    api().setWindowTitle(id, "new.png");
    api().setWindowTitle("nope", "x");
    expect(api().windows).toBe(before);
  });

  it("keeps windows within the viewport and below the menu bar", () => {
    const id = open("notes", { size: { width: 400, height: 300 } });
    const { rect } = win(id);
    expect(rect.y).toBeGreaterThanOrEqual(MENU_BAR_HEIGHT);
    expect(rect.x + rect.width).toBeLessThanOrEqual(VIEWPORT.width);
  });

  it("applies the default min size when none is given", () => {
    const id = open();
    expect(win(id).minSize).toEqual({ width: 320, height: 200 });
  });

  it("assigns increasing z-index to each new window", () => {
    const a = open("files");
    const b = open("notes");
    expect(win(b).zIndex).toBeGreaterThan(win(a).zIndex);
  });

  it("focuses the existing window for single-instance apps", () => {
    const first = open("settings", { singleInstance: true });
    const second = open("settings", { singleInstance: true });
    expect(second).toBe(first);
    expect(api().windows).toHaveLength(1);
  });

  it("delivers a fresh payload to an existing single-instance window", () => {
    const id = open("notes", { singleInstance: true, payload: { fileId: "a" } });
    open("notes", { singleInstance: true, payload: { fileId: "b" } });
    expect(win(id).payload).toEqual({ fileId: "b" });
  });
});

describe("focus + z-order", () => {
  it("raises a window above all others when focused", () => {
    const a = open("files");
    const b = open("notes");
    api().focusWindow(a);
    expect(win(a).zIndex).toBeGreaterThan(win(b).zIndex);
    expect(api().focusedId).toBe(a);
  });

  it("blurAll clears the focused window", () => {
    open();
    api().blurAll();
    expect(api().focusedId).toBeNull();
  });
});

describe("close", () => {
  it("removes a window and refocuses the topmost remaining one", () => {
    const a = open("files");
    const b = open("notes");
    api().closeWindow(b);
    expect(api().windows).toHaveLength(1);
    expect(api().focusedId).toBe(a);
  });

  it("closeApp removes every window of an app", () => {
    open("files");
    open("files");
    const other = open("notes");
    api().closeApp("files");
    expect(api().windows.map(w => w.appId)).toEqual(["notes"]);
    expect(api().focusedId).toBe(other);
  });

  it("sets focus to null when the last window closes", () => {
    const id = open();
    api().closeWindow(id);
    expect(api().focusedId).toBeNull();
  });
});

describe("minimize + restore", () => {
  it("minimizing hands focus to another visible window", () => {
    const a = open("files");
    const b = open("notes");
    api().minimizeWindow(b);
    expect(win(b).minimized).toBe(true);
    expect(api().focusedId).toBe(a);
  });

  it("restoring re-focuses and raises the window", () => {
    const a = open("files");
    const b = open("notes");
    api().minimizeWindow(b);
    api().restoreWindow(b);
    expect(win(b).minimized).toBe(false);
    expect(api().focusedId).toBe(b);
    expect(win(b).zIndex).toBeGreaterThan(win(a).zIndex);
  });
});

describe("maximize + snap", () => {
  it("maximize fills the viewport below the menu bar and saves restore bounds", () => {
    const id = open("files", { size: { width: 400, height: 300 } });
    const before = { ...win(id).rect };
    api().maximizeWindow(id);
    expect(win(id).mode).toBe("maximized");
    expect(win(id).rect).toEqual({
      x: 0,
      y: MENU_BAR_HEIGHT,
      width: VIEWPORT.width,
      height: VIEWPORT.height - MENU_BAR_HEIGHT,
    });
    expect(win(id).restoreRect).toEqual(before);
  });

  it("toggleMaximize restores the previous bounds", () => {
    const id = open("files", { size: { width: 400, height: 300 } });
    const before = { ...win(id).rect };
    api().toggleMaximize(id);
    api().toggleMaximize(id);
    expect(win(id).mode).toBe("normal");
    expect(win(id).rect).toEqual(before);
  });

  it("snaps a window to the left half", () => {
    const id = open();
    api().snapWindow(id, "left");
    expect(win(id).mode).toBe("snapped-left");
    expect(win(id).rect).toEqual({
      x: 0,
      y: MENU_BAR_HEIGHT,
      width: 500,
      height: VIEWPORT.height - MENU_BAR_HEIGHT,
    });
    expect(api().snapPreview).toBeNull();
  });

  it("snaps a window to the right half", () => {
    const id = open();
    api().snapWindow(id, "right");
    expect(win(id).rect.x).toBe(500);
    expect(win(id).rect.width).toBe(500);
  });
});

describe("move + resize", () => {
  it("clamps a move that would push the title bar off-screen", () => {
    const id = open("files", { size: { width: 400, height: 300 } });
    api().moveWindow(id, 5000, -500);
    expect(win(id).rect.x).toBe(VIEWPORT.width - 80);
    expect(win(id).rect.y).toBe(MENU_BAR_HEIGHT);
  });

  it("enforces the minimum size on resize", () => {
    const id = open("files", { minSize: { width: 320, height: 200 } });
    api().resizeWindow(id, { x: 100, y: 100, width: 50, height: 40 });
    expect(win(id).rect.width).toBe(320);
    expect(win(id).rect.height).toBe(200);
  });

  it("resizing returns a maximized window to normal mode", () => {
    const id = open();
    api().maximizeWindow(id);
    api().resizeWindow(id, { x: 100, y: 100, width: 500, height: 400 });
    expect(win(id).mode).toBe("normal");
  });
});

describe("setViewport re-layout", () => {
  it("re-fills a maximized window to the new viewport", () => {
    const id = open();
    api().maximizeWindow(id);
    api().setViewport({ width: 600, height: 500 });

    expect(win(id).rect).toEqual({
      x: 0,
      y: MENU_BAR_HEIGHT,
      width: 600,
      height: 500 - MENU_BAR_HEIGHT,
    });
  });

  it("re-fills a snapped window to its half of the new viewport", () => {
    const id = open();
    api().snapWindow(id, "right");
    api().setViewport({ width: 800, height: 600 });

    expect(win(id).rect).toEqual({
      x: 400,
      y: MENU_BAR_HEIGHT,
      width: 400,
      height: 600 - MENU_BAR_HEIGHT,
    });
  });

  it("keeps a normal window's title bar reachable when the viewport shrinks", () => {
    const id = open();
    api().moveWindow(id, 900, 700);
    api().setViewport({ width: 500, height: 400 });

    // Still grabbable, or it can never be dragged back.
    expect(win(id).rect.x).toBeLessThanOrEqual(500 - 80);
    expect(win(id).rect.y).toBeLessThanOrEqual(400 - 40);
  });

  it("leaves untouched windows referentially identical (no needless re-renders)", () => {
    const id = open();
    const before = win(id);
    api().setViewport({ ...VIEWPORT });

    expect(win(id)).toBe(before);
  });
});

describe("visibility + transient state on mode changes", () => {
  it("maximizing a minimized window makes it visible again", () => {
    const id = open();
    api().minimizeWindow(id);
    api().maximizeWindow(id);

    expect(win(id).minimized).toBe(false);
    expect(win(id).mode).toBe("maximized");
  });

  it("snapping a minimized window makes it visible again", () => {
    const id = open();
    api().minimizeWindow(id);
    api().snapWindow(id, "left");

    expect(win(id).minimized).toBe(false);
    expect(win(id).mode).toBe("snapped-left");
  });

  it("closing a window clears a snap preview left over from its drag", () => {
    const id = open();
    api().setSnapPreview("left");
    api().closeWindow(id);

    expect(api().snapPreview).toBeNull();
  });

  it("quitting an app clears a snap preview too", () => {
    open();
    api().setSnapPreview("right");
    api().closeApp("files");

    expect(api().snapPreview).toBeNull();
  });
});
