import type { OsWindow, WindowMode, WindowRect, WindowSnapshot } from "./windowStore";
import { getApp } from "@/system/apps/registry";
import { DEFAULT_MIN_SIZE, useWindowStore } from "./windowStore";

const STORAGE_KEY = "kagami:session";
const SAVE_DEBOUNCE_MS = 400;
const SESSION_VERSION = 1;

export interface SessionWindowEntry {
  appId: string;
  rect: WindowRect;
  restoreRect: WindowRect | null;
  mode: WindowMode;
  minimized: boolean;
  payload?: unknown;
}

export interface SessionSnapshot {
  version: typeof SESSION_VERSION;
  windows: SessionWindowEntry[];
  focusedIndex: number | null;
}

/**
 * Windows ordered back-to-front, with each app given the chance to reduce
 * its own payload to something JSON-safe (`serializePayload`). Windows whose
 * `appId` is no longer registered are dropped rather than persisted as
 * orphaned data — pure function, easy to unit test without touching
 * localStorage.
 */
export function buildSessionSnapshot(
  windows: OsWindow[],
  focusedId: string | null,
): SessionSnapshot {
  const ordered = [...windows].sort((a, b) => a.zIndex - b.zIndex);
  const entries: SessionWindowEntry[] = [];
  let focusedIndex: number | null = null;
  for (const w of ordered) {
    const app = getApp(w.appId);
    if (!app)
      continue;
    if (w.id === focusedId)
      focusedIndex = entries.length;
    entries.push({
      appId: w.appId,
      rect: w.rect,
      restoreRect: w.restoreRect,
      mode: w.mode,
      minimized: w.minimized,
      payload: app.serializePayload?.(w.payload),
    });
  }
  return { version: SESSION_VERSION, windows: entries, focusedIndex };
}

/**
 * The inverse: validates each entry's `appId` against the current registry
 * (an app removed/renamed since the session was saved is dropped, not
 * reopened bare-titled) and round-trips payloads through `restorePayload`.
 * Pure — takes a snapshot, returns what `windowStore.hydrateSession` needs.
 */
export function resolveSessionSnapshot(
  snapshot: SessionSnapshot,
): { windows: WindowSnapshot[]; focusedIndex: number | null } {
  const windows: WindowSnapshot[] = [];
  let focusedIndex: number | null = null;
  snapshot.windows.forEach((entry, sourceIndex) => {
    const app = getApp(entry.appId);
    if (!app)
      return;
    if (sourceIndex === snapshot.focusedIndex)
      focusedIndex = windows.length;
    windows.push({
      appId: entry.appId,
      title: app.name,
      rect: entry.rect,
      restoreRect: entry.restoreRect,
      mode: entry.mode,
      minimized: entry.minimized,
      minSize: app.minSize ?? DEFAULT_MIN_SIZE,
      payload: app.restorePayload?.(entry.payload),
    });
  });
  return { windows, focusedIndex };
}

function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  return (
    !!value
    && typeof value === "object"
    && (value as SessionSnapshot).version === SESSION_VERSION
    && Array.isArray((value as SessionSnapshot).windows)
  );
}

function readSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return null;
    const parsed: unknown = JSON.parse(raw);
    return isSessionSnapshot(parsed) ? parsed : null;
  }
  catch {
    return null;
  }
}

function writeSnapshot(snapshot: SessionSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }
  catch {
    // Storage full/unavailable (e.g. Safari private mode) — session restore
    // is a nicety, not load-bearing; nothing else needs to know it failed.
  }
}

/**
 * Reads the saved session (if any) and hydrates the window store from it.
 * Returns whether a session existed at all — even an empty one, from a
 * boot where the user had closed every window — so the caller can tell
 * that apart from a genuinely first-ever boot (see `App.tsx`).
 */
export function restoreSession(): boolean {
  const snapshot = readSnapshot();
  if (!snapshot)
    return false;
  const { windows, focusedIndex } = resolveSessionSnapshot(snapshot);
  useWindowStore.getState().hydrateSession(windows, focusedIndex);
  return true;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveNow() {
  const { windows, focusedId } = useWindowStore.getState();
  writeSnapshot(buildSessionSnapshot(windows, focusedId));
}

/**
 * Debounced save on every window-store change (move/resize/close/minimize/
 * …). Call once at boot, after the initial restore has settled; returns an
 * unsubscribe function for cleanup.
 */
export function watchSessionForSave(): () => void {
  return useWindowStore.subscribe(() => {
    if (saveTimer !== null)
      clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  });
}
