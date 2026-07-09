import { create } from "zustand";

export const MENU_BAR_HEIGHT = 30;
export const TITLE_BAR_HEIGHT = 40;

const DEFAULT_MIN_SIZE = { width: 320, height: 200 };
const CASCADE_STEP = 28;

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WindowMode = "normal" | "maximized" | "snapped-left" | "snapped-right";
export type SnapSide = "left" | "right";

export interface OsWindow {
  id: string;
  appId: string;
  title: string;
  /**
   * Single 'main' screen for now; the field exists so multi-monitor
   *  support is an additive change, not a rewrite.
   */
  screenId: string;
  rect: WindowRect;
  /** Bounds to return to when leaving maximized/snapped mode. */
  restoreRect: WindowRect | null;
  mode: WindowMode;
  minimized: boolean;
  zIndex: number;
  minSize: { width: number; height: number };
  /** App-defined launch data (e.g. which file to open). */
  payload?: unknown;
}

export interface OpenWindowOptions {
  title: string;
  size: { width: number; height: number };
  minSize?: { width: number; height: number };
  singleInstance?: boolean;
  payload?: unknown;
}

interface Viewport {
  width: number;
  height: number;
}

export interface WindowStore {
  windows: OsWindow[];
  focusedId: string | null;
  nextZ: number;
  viewport: Viewport;
  /** Transient UI state: which snap zone is highlighted during a drag. */
  snapPreview: SnapSide | null;

  setViewport: (viewport: Viewport) => void;
  openWindow: (appId: string, opts: OpenWindowOptions) => string;
  /** Update a window's title bar text (e.g. when its open file is renamed). */
  setWindowTitle: (id: string, title: string) => void;
  closeWindow: (id: string) => void;
  closeApp: (appId: string) => void;
  focusWindow: (id: string) => void;
  blurAll: () => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, rect: WindowRect) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  snapWindow: (id: string, side: SnapSide) => void;
  /**
   * Leave maximized/snapped mode with an explicit target rect
   *  (used when the user drags a maximized window by its title bar).
   */
  restoreToRect: (id: string, rect: WindowRect) => void;
  setSnapPreview: (side: SnapSide | null) => void;
}

let windowCounter = 0;

/** Topmost non-minimized window, optionally excluding one id. */
function topWindow(windows: OsWindow[], excludeId?: string): OsWindow | null {
  let top: OsWindow | null = null;
  for (const w of windows) {
    if (w.id === excludeId || w.minimized)
      continue;
    if (!top || w.zIndex > top.zIndex)
      top = w;
  }
  return top;
}

function clampToViewport(rect: WindowRect, viewport: Viewport): WindowRect {
  // Keep the title bar reachable: never above the menu bar, never fully
  // below the bottom edge, and keep at least 80px of width on screen.
  const x = Math.min(Math.max(rect.x, 80 - rect.width), viewport.width - 80);
  const y = Math.min(
    Math.max(rect.y, MENU_BAR_HEIGHT),
    viewport.height - TITLE_BAR_HEIGHT,
  );
  return { ...rect, x, y };
}

function cascadeRect(
  size: { width: number; height: number },
  viewport: Viewport,
  openCount: number,
): WindowRect {
  const step = (openCount % 8) * CASCADE_STEP;
  const width = Math.min(size.width, viewport.width - 40);
  const height = Math.min(size.height, viewport.height - MENU_BAR_HEIGHT - 60);
  const x = Math.max(20, (viewport.width - width) / 2 - 60 + step);
  const y = Math.max(
    MENU_BAR_HEIGHT + 12,
    (viewport.height - height) / 2 - 40 + step,
  );
  return { x, y, width, height };
}

export const useWindowStore = create<WindowStore>()((set, get) => ({
  windows: [],
  focusedId: null,
  nextZ: 1,
  viewport: { width: 1440, height: 900 },
  snapPreview: null,

  setViewport: viewport => set({ viewport }),

  setWindowTitle: (id, title) => {
    const { windows } = get();
    if (!windows.some(w => w.id === id && w.title !== title))
      return;
    set({
      windows: windows.map(w => (w.id === id ? { ...w, title } : w)),
    });
  },

  openWindow: (appId, opts) => {
    const state = get();
    if (opts.singleInstance) {
      const existing = state.windows.find(w => w.appId === appId);
      if (existing) {
        // Re-launching a single-instance app can carry fresh launch data
        // (e.g. "open this file"); deliver it to the existing window.
        if (opts.payload !== undefined) {
          set({
            windows: get().windows.map(w =>
              w.id === existing.id ? { ...w, payload: opts.payload } : w,
            ),
          });
        }
        if (existing.minimized)
          get().restoreWindow(existing.id);
        else get().focusWindow(existing.id);
        return existing.id;
      }
    }
    const id = `win-${++windowCounter}`;
    const win: OsWindow = {
      id,
      appId,
      title: opts.title,
      screenId: "main",
      rect: cascadeRect(opts.size, state.viewport, state.windows.length),
      restoreRect: null,
      mode: "normal",
      minimized: false,
      zIndex: state.nextZ,
      minSize: opts.minSize ?? DEFAULT_MIN_SIZE,
      payload: opts.payload,
    };
    set({
      windows: [...state.windows, win],
      focusedId: id,
      nextZ: state.nextZ + 1,
    });
    return id;
  },

  closeWindow: (id) => {
    const { windows, focusedId } = get();
    const remaining = windows.filter(w => w.id !== id);
    set({
      windows: remaining,
      focusedId:
        focusedId === id ? (topWindow(remaining)?.id ?? null) : focusedId,
    });
  },

  closeApp: (appId) => {
    const { windows, focusedId } = get();
    const remaining = windows.filter(w => w.appId !== appId);
    const focusGone = !remaining.some(w => w.id === focusedId);
    set({
      windows: remaining,
      focusedId: focusGone ? (topWindow(remaining)?.id ?? null) : focusedId,
    });
  },

  focusWindow: (id) => {
    const { windows, focusedId, nextZ } = get();
    const win = windows.find(w => w.id === id);
    if (!win)
      return;
    if (focusedId === id && topWindow(windows)?.id === id)
      return;
    set({
      windows: windows.map(w => (w.id === id ? { ...w, zIndex: nextZ } : w)),
      focusedId: id,
      nextZ: nextZ + 1,
    });
  },

  blurAll: () => set({ focusedId: null }),

  moveWindow: (id, x, y) => {
    const { windows, viewport } = get();
    set({
      windows: windows.map(w =>
        w.id === id
          ? { ...w, rect: clampToViewport({ ...w.rect, x, y }, viewport) }
          : w,
      ),
    });
  },

  resizeWindow: (id, rect) => {
    const { windows } = get();
    set({
      windows: windows.map((w) => {
        if (w.id !== id)
          return w;
        const width = Math.max(rect.width, w.minSize.width);
        const height = Math.max(rect.height, w.minSize.height);
        // When resizing from the left/top edge, don't let the opposite
        // edge drift once min size is hit.
        const x = rect.width < w.minSize.width ? w.rect.x : rect.x;
        const y = Math.max(
          rect.height < w.minSize.height ? w.rect.y : rect.y,
          MENU_BAR_HEIGHT,
        );
        return { ...w, rect: { x, y, width, height }, mode: "normal" };
      }),
    });
  },

  minimizeWindow: (id) => {
    const { windows, focusedId } = get();
    set({
      windows: windows.map(w => (w.id === id ? { ...w, minimized: true } : w)),
      focusedId:
        focusedId === id ? (topWindow(windows, id)?.id ?? null) : focusedId,
    });
  },

  restoreWindow: (id) => {
    const { windows, nextZ } = get();
    set({
      windows: windows.map(w =>
        w.id === id ? { ...w, minimized: false, zIndex: nextZ } : w,
      ),
      focusedId: id,
      nextZ: nextZ + 1,
    });
  },

  maximizeWindow: (id) => {
    const { windows, viewport } = get();
    set({
      windows: windows.map((w) => {
        if (w.id !== id)
          return w;
        return {
          ...w,
          restoreRect: w.mode === "normal" ? w.rect : w.restoreRect,
          mode: "maximized",
          rect: {
            x: 0,
            y: MENU_BAR_HEIGHT,
            width: viewport.width,
            height: viewport.height - MENU_BAR_HEIGHT,
          },
        };
      }),
    });
  },

  toggleMaximize: (id) => {
    const win = get().windows.find(w => w.id === id);
    if (!win)
      return;
    if (win.mode === "maximized") {
      const target = win.restoreRect ?? win.rect;
      get().restoreToRect(id, target);
    }
    else {
      get().maximizeWindow(id);
    }
  },

  snapWindow: (id, side) => {
    const { windows, viewport } = get();
    const half = Math.round(viewport.width / 2);
    set({
      snapPreview: null,
      windows: windows.map((w) => {
        if (w.id !== id)
          return w;
        return {
          ...w,
          restoreRect: w.mode === "normal" ? w.rect : w.restoreRect,
          mode: side === "left" ? "snapped-left" : "snapped-right",
          rect: {
            x: side === "left" ? 0 : half,
            y: MENU_BAR_HEIGHT,
            width: side === "left" ? half : viewport.width - half,
            height: viewport.height - MENU_BAR_HEIGHT,
          },
        };
      }),
    });
  },

  restoreToRect: (id, rect) => {
    const { windows, viewport } = get();
    set({
      windows: windows.map(w =>
        w.id === id
          ? {
              ...w,
              mode: "normal",
              rect: clampToViewport(rect, viewport),
              restoreRect: null,
            }
          : w,
      ),
    });
  },

  setSnapPreview: (side) => {
    if (get().snapPreview !== side)
      set({ snapPreview: side });
  },
}));
