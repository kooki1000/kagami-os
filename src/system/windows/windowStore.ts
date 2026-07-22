import { create } from "zustand";

export const MENU_BAR_HEIGHT = 30;
export const TITLE_BAR_HEIGHT = 40;

export const DEFAULT_MIN_SIZE = { width: 320, height: 200 };
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

/**
 * A window as resolved for restore (C1) — appId already validated against
 * the current registry, payload already round-tripped through the app's
 * `restorePayload` hook. Ordered back-to-front; `hydrateSession` assigns
 * z-index from array order.
 */
export interface WindowSnapshot {
  appId: string;
  title: string;
  rect: WindowRect;
  restoreRect: WindowRect | null;
  mode: WindowMode;
  minimized: boolean;
  minSize: { width: number; height: number };
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
  /**
   * App ids currently hidden (⌃⌥H / "Hide {app}"), kept separate from
   * per-window `minimized` — a window the user deliberately minimized
   * shouldn't un-minimize just because the app is unhidden.
   */
  hiddenApps: Set<string>;

  setViewport: (viewport: Viewport) => void;
  openWindow: (appId: string, opts: OpenWindowOptions) => string;
  /** Update a window's title bar text (e.g. when its open file is renamed). */
  setWindowTitle: (id: string, title: string) => void;
  /**
   * Update a window's launch payload in place — e.g. Notes syncing "which
   * note is showing" back onto its (singleInstance) window so session
   * restore (C1) reopens the note the user actually had open, not just
   * whatever it was launched with.
   */
  setWindowPayload: (id: string, payload: unknown) => void;
  closeWindow: (id: string) => void;
  closeApp: (appId: string) => void;
  /** Hide every window of an app (⌃⌥H, Dock/menu "Hide {app}") without minimizing them. */
  hideApp: (appId: string) => void;
  /** Reveal a hidden app's windows again — does not restore ones minimized before/after hiding. */
  unhideApp: (appId: string) => void;
  /**
   * Restore every minimized window of an app at once (Dock tile click when
   * every window of that app is minimized), focusing the new topmost.
   */
  restoreApp: (appId: string) => void;
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
  /**
   * Replace the whole window list from a restored session (C1). Only ever
   * called once, at boot, before anything else has opened a window.
   */
  hydrateSession: (windows: WindowSnapshot[], focusedIndex: number | null) => void;
}

let windowCounter = 0;

/**
 * Topmost window by zIndex — non-minimized only unless `includeMinimized`,
 * optionally excluding one id. Exported: Dock also needs this (to decide
 * which of an app's windows to restore when every one is minimized), not
 * just this store's own internal focus bookkeeping.
 */
export function topWindow(
  windows: OsWindow[],
  options: { excludeId?: string; includeMinimized?: boolean } = {},
): OsWindow | null {
  let top: OsWindow | null = null;
  for (const w of windows) {
    if (w.id === options.excludeId)
      continue;
    if (w.minimized && !options.includeMinimized)
      continue;
    if (!top || w.zIndex > top.zIndex)
      top = w;
  }
  return top;
}

/** Replace the window with id `id` via `updater`, leaving every other window untouched. */
function updateWindow(
  windows: OsWindow[],
  id: string,
  updater: (w: OsWindow) => OsWindow,
): OsWindow[] {
  return windows.map(w => (w.id === id ? updater(w) : w));
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

/**
 * The rect a window occupies in `mode`. Maximized/snapped rects derive purely
 * from the viewport, so this serves both initial placement, re-layout on
 * resize, and restoring a window straight into whatever mode it was saved in
 * (C1) rather than transitioning into it from "normal"; a normal window
 * keeps its rect, clamped back into reach.
 */
function rectForMode(
  mode: WindowMode,
  rect: WindowRect,
  viewport: Viewport,
): WindowRect {
  const half = Math.round(viewport.width / 2);
  const filled = { y: MENU_BAR_HEIGHT, height: viewport.height - MENU_BAR_HEIGHT };
  switch (mode) {
    case "maximized":
      return { x: 0, width: viewport.width, ...filled };
    case "snapped-left":
      return { x: 0, width: half, ...filled };
    case "snapped-right":
      return { x: half, width: viewport.width - half, ...filled };
    case "normal":
      return clampToViewport(rect, viewport);
  }
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
  hiddenApps: new Set(),

  // Re-lays out every window: maximized/snapped ones re-fill the new viewport,
  // normal ones are clamped so a shrink can't strand a title bar out of reach.
  setViewport: (viewport) => {
    const { windows, viewport: previous } = get();
    if (previous.width === viewport.width && previous.height === viewport.height)
      return;
    set({
      viewport,
      windows: windows.map((w) => {
        const rect = rectForMode(w.mode, w.rect, viewport);
        return rect.x === w.rect.x
          && rect.y === w.rect.y
          && rect.width === w.rect.width
          && rect.height === w.rect.height
          ? w
          : { ...w, rect };
      }),
    });
  },

  setWindowTitle: (id, title) => {
    const { windows } = get();
    if (!windows.some(w => w.id === id && w.title !== title))
      return;
    set({
      windows: updateWindow(windows, id, w => ({ ...w, title })),
    });
  },

  setWindowPayload: (id, payload) => {
    const { windows } = get();
    set({
      windows: updateWindow(windows, id, w => ({ ...w, payload })),
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
            windows: updateWindow(get().windows, existing.id, w => ({ ...w, payload: opts.payload })),
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

  // Both closers drop `snapPreview` — it belongs to a drag on a window that no
  // longer exists, and left set it paints an undismissable highlight.
  closeWindow: (id) => {
    const { windows, focusedId } = get();
    const remaining = windows.filter(w => w.id !== id);
    set({
      windows: remaining,
      focusedId:
        focusedId === id ? (topWindow(remaining)?.id ?? null) : focusedId,
      snapPreview: null,
    });
  },

  closeApp: (appId) => {
    const { windows, focusedId } = get();
    const remaining = windows.filter(w => w.appId !== appId);
    const focusGone = !remaining.some(w => w.id === focusedId);
    set({
      windows: remaining,
      focusedId: focusGone ? (topWindow(remaining)?.id ?? null) : focusedId,
      snapPreview: null,
    });
  },

  hideApp: (appId) => {
    const { hiddenApps, windows, focusedId } = get();
    if (hiddenApps.has(appId))
      return;
    const nextHidden = new Set(hiddenApps);
    nextHidden.add(appId);
    // Same "hand focus to the topmost still-visible window" logic as
    // closeApp/minimizeWindow, just filtered by the updated hidden set
    // instead of by removal/minimized.
    const visible = windows.filter(w => !w.minimized && !nextHidden.has(w.appId));
    const focusGone = !visible.some(w => w.id === focusedId);
    set({
      hiddenApps: nextHidden,
      focusedId: focusGone ? (topWindow(visible)?.id ?? null) : focusedId,
    });
  },

  unhideApp: (appId) => {
    const { hiddenApps } = get();
    if (!hiddenApps.has(appId))
      return;
    const nextHidden = new Set(hiddenApps);
    nextHidden.delete(appId);
    set({ hiddenApps: nextHidden });
  },

  restoreApp: (appId) => {
    const { windows, nextZ } = get();
    // Oldest-to-newest so relative stacking order is preserved: the window
    // that was topmost before minimizing ends up topmost again, and it's
    // the one that gets focus.
    const minimizedOfApp = windows
      .filter(w => w.appId === appId && w.minimized)
      .sort((a, b) => a.zIndex - b.zIndex);
    if (minimizedOfApp.length === 0)
      return;
    let z = nextZ;
    const zById = new Map<string, number>();
    for (const w of minimizedOfApp)
      zById.set(w.id, z++);
    set({
      windows: windows.map(w =>
        zById.has(w.id) ? { ...w, minimized: false, zIndex: zById.get(w.id)! } : w),
      focusedId: minimizedOfApp[minimizedOfApp.length - 1].id,
      nextZ: z,
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
      windows: updateWindow(windows, id, w => ({ ...w, zIndex: nextZ })),
      focusedId: id,
      nextZ: nextZ + 1,
    });
  },

  blurAll: () => set({ focusedId: null }),

  moveWindow: (id, x, y) => {
    const { windows, viewport } = get();
    set({
      windows: updateWindow(windows, id, w => ({ ...w, rect: clampToViewport({ ...w.rect, x, y }, viewport) })),
    });
  },

  resizeWindow: (id, rect) => {
    const { windows } = get();
    set({
      windows: updateWindow(windows, id, (w) => {
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
      windows: updateWindow(windows, id, w => ({ ...w, minimized: true })),
      focusedId:
        focusedId === id ? (topWindow(windows, { excludeId: id })?.id ?? null) : focusedId,
    });
  },

  restoreWindow: (id) => {
    const { windows, nextZ } = get();
    set({
      windows: updateWindow(windows, id, w => ({ ...w, minimized: false, zIndex: nextZ })),
      focusedId: id,
      nextZ: nextZ + 1,
    });
  },

  maximizeWindow: (id) => {
    const { windows, viewport } = get();
    set({
      windows: updateWindow(windows, id, w => ({
        ...w,
        restoreRect: w.mode === "normal" ? w.rect : w.restoreRect,
        mode: "maximized",
        // Else we'd resize a window that stays invisible.
        minimized: false,
        rect: rectForMode("maximized", w.rect, viewport),
      })),
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
    const mode: WindowMode = side === "left" ? "snapped-left" : "snapped-right";
    set({
      snapPreview: null,
      windows: updateWindow(windows, id, w => ({
        ...w,
        restoreRect: w.mode === "normal" ? w.rect : w.restoreRect,
        mode,
        minimized: false,
        rect: rectForMode(mode, w.rect, viewport),
      })),
    });
  },

  restoreToRect: (id, rect) => {
    const { windows, viewport } = get();
    set({
      windows: updateWindow(windows, id, w => ({
        ...w,
        mode: "normal",
        rect: clampToViewport(rect, viewport),
        restoreRect: null,
      })),
    });
  },

  setSnapPreview: (side) => {
    if (get().snapPreview !== side)
      set({ snapPreview: side });
  },

  hydrateSession: (snapshots, focusedIndex) => {
    const { viewport } = get();
    const windows: OsWindow[] = snapshots.map((snap, i) => ({
      id: `win-${++windowCounter}`,
      appId: snap.appId,
      title: snap.title,
      screenId: "main",
      rect: rectForMode(snap.mode, snap.rect, viewport),
      restoreRect: snap.restoreRect,
      mode: snap.mode,
      minimized: snap.minimized,
      zIndex: i + 1,
      minSize: snap.minSize,
      payload: snap.payload,
    }));
    set({
      windows,
      focusedId: focusedIndex !== null ? (windows[focusedIndex]?.id ?? null) : null,
      nextZ: windows.length + 1,
    });
  },
}));
