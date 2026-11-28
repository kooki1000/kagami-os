import { create } from "zustand";

/**
 * Step 17 (D8.11) — per-window file access for installed apps, and the one
 * pending file-picker request. Session-scoped and never persisted: a window's
 * access ends with the window.
 *
 * `grantsByWindow` holds the nodes a window picked through `fs.pick`. A file a
 * window was *opened with* isn't stored here; it's the window's own payload,
 * which only the shell writes. Both end up as read-only access to exactly one
 * node each (`effectiveCapabilities`).
 */
export interface PickRequest {
  windowId: string;
  appName: string;
  /** MIME types or `family/*` patterns the app asked for; empty means any file. */
  accept: string[];
  resolve: (fileId: string | null) => void;
}

interface WindowFilesStore {
  grantsByWindow: Record<string, string[]>;
  pending: PickRequest | null;
  grant: (windowId: string, fileId: string) => void;
  /** Drops a window's grants and cancels its picker, if it has one open. */
  clearWindow: (windowId: string) => void;
  /** Opens the picker. Resolves `null` if the user cancels or one is already open. */
  requestFile: (request: Omit<PickRequest, "resolve">) => Promise<string | null>;
  /** Closes the picker with the user's choice, or `null` for cancel. */
  settle: (fileId: string | null) => void;
}

/** Stable empty list, so a window with no grants doesn't hand React a fresh `[]` every render. */
export const NO_FILES: readonly string[] = [];

export const useWindowFilesStore = create<WindowFilesStore>()((set, get) => ({
  grantsByWindow: {},
  pending: null,
  grant: (windowId, fileId) =>
    set((state) => {
      const current = state.grantsByWindow[windowId] ?? [];
      return current.includes(fileId) ? state : { grantsByWindow: { ...state.grantsByWindow, [windowId]: [...current, fileId] } };
    }),
  clearWindow: (windowId) => {
    if (get().pending?.windowId === windowId)
      get().settle(null);
    set((state) => {
      const { [windowId]: _removed, ...rest } = state.grantsByWindow;
      return windowId in state.grantsByWindow ? { grantsByWindow: rest } : state;
    });
  },
  requestFile: request =>
    new Promise((resolve) => {
      if (get().pending) {
        resolve(null);
        return;
      }
      set({ pending: { ...request, resolve } });
    }),
  settle: (fileId) => {
    const pending = get().pending;
    if (!pending)
      return;
    set({ pending: null });
    pending.resolve(fileId);
  },
}));
