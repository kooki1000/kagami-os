import type { OsWindow } from "./windowStore";
import type { FsNode } from "@/system/fs/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useFsStore } from "@/system/fs/fsStore";
import { HOME_ID, ROOT_ID } from "@/system/fs/types";
import {
  buildSessionSnapshot,
  resolveSessionSnapshot,
  restoreSession,
  watchSessionForSave,
} from "./sessionStore";
import { useWindowStore } from "./windowStore";

function win(overrides: Partial<OsWindow> & Pick<OsWindow, "id" | "appId">): OsWindow {
  return {
    title: overrides.appId,
    screenId: "main",
    rect: { x: 10, y: 40, width: 400, height: 300 },
    restoreRect: null,
    mode: "normal",
    minimized: false,
    zIndex: 1,
    minSize: { width: 320, height: 200 },
    payload: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  useWindowStore.setState({
    windows: [],
    focusedId: null,
    nextZ: 1,
    snapPreview: null,
    viewport: { width: 1000, height: 800 },
  });
});

describe("buildSessionSnapshot", () => {
  it("orders entries back-to-front by zIndex and marks the focused one", () => {
    const a = win({ id: "a", appId: "files", zIndex: 5 });
    const b = win({ id: "b", appId: "notes", zIndex: 2 });
    const snap = buildSessionSnapshot([a, b], "a");
    expect(snap.windows.map(w => w.appId)).toEqual(["notes", "files"]);
    expect(snap.focusedIndex).toBe(1);
  });

  it("drops windows whose app is no longer registered", () => {
    const ghost = win({ id: "g", appId: "ghost-app" });
    expect(buildSessionSnapshot([ghost], null).windows).toHaveLength(0);
  });

  it("serializes payload through the app's serializePayload hook", () => {
    const w = win({ id: "n", appId: "notes", payload: { fileId: "doc-1" } });
    expect(buildSessionSnapshot([w], null).windows[0].payload).toEqual({ fileId: "doc-1" });
  });

  it("leaves payload undefined for an app with no serialize hook", () => {
    const w = win({ id: "f", appId: "files", payload: { anything: true } });
    expect(buildSessionSnapshot([w], null).windows[0].payload).toBeUndefined();
  });
});

describe("resolveSessionSnapshot", () => {
  const rect = { x: 0, y: 30, width: 100, height: 100 };

  it("resolves title/minSize from the current app registry", () => {
    const { windows } = resolveSessionSnapshot({
      version: 1,
      windows: [{ appId: "notes", rect, restoreRect: null, mode: "normal", minimized: false }],
      focusedIndex: null,
    });
    expect(windows[0].title).toBe("Notes");
    expect(windows[0].minSize).toEqual({ width: 480, height: 320 });
  });

  it("drops an entry whose app is no longer registered and shifts focusedIndex", () => {
    const { windows, focusedIndex } = resolveSessionSnapshot({
      version: 1,
      windows: [
        { appId: "ghost-app", rect, restoreRect: null, mode: "normal", minimized: false },
        { appId: "files", rect, restoreRect: null, mode: "normal", minimized: false },
      ],
      focusedIndex: 1,
    });
    expect(windows.map(w => w.appId)).toEqual(["files"]);
    expect(focusedIndex).toBe(0);
  });

  it("restores a file payload via restorePayload when the file still exists", () => {
    const nodes = {
      [ROOT_ID]: { id: ROOT_ID, parentId: null, name: "Kagami", type: "folder", createdAt: 0, modifiedAt: 0 } as FsNode,
      "doc-1": { id: "doc-1", parentId: HOME_ID, name: "note.md", type: "file", mimeType: "text/markdown", content: "hi", createdAt: 0, modifiedAt: 0 } as FsNode,
    };
    useFsStore.setState({ nodes, ready: true });

    const { windows } = resolveSessionSnapshot({
      version: 1,
      windows: [{ appId: "notes", rect, restoreRect: null, mode: "normal", minimized: false, payload: { fileId: "doc-1" } }],
      focusedIndex: null,
    });
    expect(windows[0].payload).toEqual({ fileId: "doc-1" });
  });

  it("drops the payload (not the window) when the referenced file is gone", () => {
    useFsStore.setState({ nodes: {}, ready: true });

    const { windows } = resolveSessionSnapshot({
      version: 1,
      windows: [{ appId: "notes", rect, restoreRect: null, mode: "normal", minimized: false, payload: { fileId: "missing" } }],
      focusedIndex: null,
    });
    expect(windows).toHaveLength(1);
    expect(windows[0].payload).toBeUndefined();
  });
});

describe("restoreSession + watchSessionForSave round trip", () => {
  const fakeStorage = new Map<string, string>();

  beforeEach(() => {
    fakeStorage.clear();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (key: string) => fakeStorage.get(key) ?? null,
      setItem: (key: string, value: string) => void fakeStorage.set(key, value),
      removeItem: (key: string) => void fakeStorage.delete(key),
      clear: () => fakeStorage.clear(),
      key: () => null,
      get length() {
        return fakeStorage.size;
      },
    };
  });

  it("returns false with nothing to restore", () => {
    expect(restoreSession()).toBe(false);
    expect(useWindowStore.getState().windows).toHaveLength(0);
  });

  it("round-trips an open window's rect/mode/focus through save and restore", async () => {
    const unwatch = watchSessionForSave();
    const id = useWindowStore.getState().openWindow("files", {
      title: "Files",
      size: { width: 500, height: 400 },
    });
    useWindowStore.getState().snapWindow(id, "left");

    // Let the debounced save (triggered by the changes above) fire.
    await new Promise(r => setTimeout(r, 450));
    unwatch();

    // Fresh boot: clear the store, then restore from what was saved.
    useWindowStore.setState({ windows: [], focusedId: null, nextZ: 1 });
    const hadSession = restoreSession();

    expect(hadSession).toBe(true);
    const restored = useWindowStore.getState().windows;
    expect(restored).toHaveLength(1);
    expect(restored[0].appId).toBe("files");
    expect(restored[0].mode).toBe("snapped-left");
    expect(useWindowStore.getState().focusedId).toBe(restored[0].id);
  });
});
