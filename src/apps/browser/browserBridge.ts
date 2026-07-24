import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createWriteQueue } from "@/lib/asyncQueue";

/** Content-area bounds in logical (CSS) pixels — matches Tauri's LogicalPosition/LogicalSize. */
export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `DOMRect`'s `x`/`y`/`width`/`height` are getters on its prototype, not own
 * enumerable properties, so passing one to `invoke()` directly serializes to
 * `{}`. Always go through this to get a plain object instead.
 */
export function contentBounds(el: HTMLElement): BrowserBounds {
  const { x, y, width, height } = el.getBoundingClientRect();
  return { x, y, width, height };
}

// A window's own React effects (create/bounds-sync/visibility-sync) fire
// independently and unawaited, and React StrictMode's dev-only double-invoke
// can interleave a stale close() between two opens. One queue per windowId
// keeps each window's own calls in true call order without serializing
// unrelated windows against each other.
const queues = new Map<string, ReturnType<typeof createWriteQueue>>();

function queueFor(id: string): ReturnType<typeof createWriteQueue> {
  let queue = queues.get(id);
  if (!queue) {
    queue = createWriteQueue();
    queues.set(id, queue);
  }
  return queue;
}

/**
 * Thin wrapper around the `browser_*` Tauri commands (`src-tauri/src/browser.rs`).
 * `id` is the Browser window's `windowId`, doubling as the child webview's label.
 */
export const browserBridge = {
  open: (id: string, url: string, bounds: BrowserBounds, visible: boolean) =>
    queueFor(id)(() => invoke<void>("browser_open", { id, url, bounds, visible })),
  navigate: (id: string, url: string) =>
    queueFor(id)(() => invoke<void>("browser_navigate", { id, url })),
  back: (id: string) =>
    queueFor(id)(() => invoke<void>("browser_back", { id })),
  forward: (id: string) =>
    queueFor(id)(() => invoke<void>("browser_forward", { id })),
  setBounds: (id: string, bounds: BrowserBounds) =>
    queueFor(id)(() => invoke<void>("browser_set_bounds", { id, bounds })),
  setVisible: (id: string, visible: boolean) =>
    queueFor(id)(() => invoke<void>("browser_set_visible", { id, visible })),
  close: (id: string) =>
    queueFor(id)(() => invoke<void>("browser_close", { id })).finally(() => queues.delete(id)),
};

/** Payload of the Rust side's `browser://nav-changed` event (see `browser.rs`). */
export interface BrowserNavChanged {
  id: string;
  url: string;
  title: string;
}

/**
 * Subscribes to real navigation changes, including ones from `back`/
 * `forward`/in-page link clicks, not just calls made through this bridge.
 * Returns an unsubscribe function, safe to call immediately.
 */
export function onNavChanged(handler: (event: BrowserNavChanged) => void): () => void {
  let cancelled = false;
  let unlisten: (() => void) | null = null;
  listen<BrowserNavChanged>("browser://nav-changed", event => handler(event.payload)).then((fn) => {
    if (cancelled)
      fn();
    else
      unlisten = fn;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
