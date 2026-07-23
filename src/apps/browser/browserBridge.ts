import { invoke } from "@tauri-apps/api/core";

/** Content-area bounds in logical (CSS) pixels — matches Tauri's LogicalPosition/LogicalSize. */
export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `DOMRect`'s `x`/`y`/`width`/`height` are getters on its prototype, not own
 * enumerable properties, so `{ ...el.getBoundingClientRect() }` silently
 * spreads to `{}`. Always go through this to get a plain, spreadable object.
 */
export function contentBounds(el: HTMLElement): BrowserBounds {
  const { x, y, width, height } = el.getBoundingClientRect();
  return { x, y, width, height };
}

/**
 * Thin wrapper around the `browser_*` Tauri commands (`src-tauri/src/browser.rs`).
 * `id` is the Browser window's `windowId`, doubling as the child webview's label.
 */
export const browserBridge = {
  open: (id: string, url: string, bounds: BrowserBounds) =>
    invoke<void>("browser_open", { id, url, ...bounds }),
  navigate: (id: string, url: string) =>
    invoke<void>("browser_navigate", { id, url }),
  setBounds: (id: string, bounds: BrowserBounds) =>
    invoke<void>("browser_set_bounds", { id, ...bounds }),
  setVisible: (id: string, visible: boolean) =>
    invoke<void>("browser_set_visible", { id, visible }),
  close: (id: string) =>
    invoke<void>("browser_close", { id }),
};
