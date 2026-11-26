import { useBrowserPrefsStore } from "@/apps/browser/browserPrefsStore";
import { useCodePrefsStore } from "@/apps/code/codePrefsStore";
import { useNotesPrefsStore } from "@/apps/notes/notesPrefsStore";
import { useTerminalStore } from "@/apps/terminal/terminalStore";
import { useAppGrantsStore } from "@/system/apps/appGrantsStore";
import { useDesktopLayoutStore } from "@/system/desktop/desktopLayoutStore";
import { useDockStore } from "@/system/dock/dockStore";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { useViewPrefsStore } from "@/system/settings/viewPrefsStore";
import { useThemeStore } from "@/system/theme/themeStore";

/**
 * B13 — the half of a backup that isn't files: the look, dock, desktop
 * layout, per-app preferences and installed-app grants. Each of those lives
 * in a persisted zustand store, so the snapshot is simply each store's raw
 * `localStorage` payload (`{ state, version }`), keyed by its storage name.
 * Restoring writes the payload back and asks the store to rehydrate, which
 * runs the store's own `migrate` — an old backup gets the same upgrade a
 * long-lived install would.
 *
 * Deliberately not here: session-scoped state (open windows, notifications),
 * device-specific feature-flag overrides, and the disk itself.
 */

/** Zip entry for the snapshot. Dot-prefixed like the manifest, so it can't be mistaken for a user file. */
export const DESKTOP_STATE_ENTRY = ".kagami-desktop-state.json";

export interface DesktopStateSnapshot {
  format: 1;
  /** Storage key -> that store's raw persisted JSON string. */
  stores: Record<string, string>;
}

interface PersistHandle {
  getOptions: () => { name?: string };
  rehydrate: () => Promise<void> | void;
}

/** Anything with a zustand `persist` handle (absent where no `localStorage` existed at creation). */
interface PersistedStore {
  persist?: PersistHandle;
}

const STORES: PersistedStore[] = [
  useSettingsStore,
  useDockStore,
  useDesktopLayoutStore,
  useThemeStore,
  useViewPrefsStore,
  useAppGrantsStore,
  useTerminalStore,
  useCodePrefsStore,
  useNotesPrefsStore,
  useBrowserPrefsStore,
];

/** The storage keys a snapshot may carry — anything else in an archive is ignored. */
export const DESKTOP_STATE_KEYS: readonly string[] = [
  "kagami-settings",
  "kagami-dock",
  "kagami-desktop-layout",
  "kagami-theme",
  "kagami-view-prefs",
  "kagami-app-grants",
  "kagami-terminal",
  "kagami-code-prefs",
  "kagami-notes-prefs",
  "kagami-browser-prefs",
];

/** A payload bigger than this is not a preferences store; refuse it rather than write it. */
const MAX_PAYLOAD_CHARS = 2_000_000;

export function collectDesktopState(storage: Storage = localStorage): DesktopStateSnapshot {
  const stores: Record<string, string> = {};
  for (const key of DESKTOP_STATE_KEYS) {
    const raw = storage.getItem(key);
    if (raw !== null)
      stores[key] = raw;
  }
  return { format: 1, stores };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Per-store sanity checks beyond "is a persisted payload". */
function hasValidShape(key: string, state: Record<string, unknown>): boolean {
  if (key === "kagami-app-grants") {
    const { grants } = state;
    return isPlainObject(grants)
      && Object.values(grants).every(list => Array.isArray(list) && list.every(cap => typeof cap === "string"));
  }
  return true;
}

/**
 * Reads a snapshot out of an archive entry. An archive is untrusted input, so
 * only the known keys survive, and only when the value parses to a persisted
 * payload (`{ state: {...}, version? }`) of sane size. `null` when the entry
 * is absent or holds nothing usable, which is how a v1 export, or one made
 * before any preference was saved, reads.
 */
export function parseDesktopState(bytes: Uint8Array | undefined): DesktopStateSnapshot | null {
  if (!bytes)
    return null;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  }
  catch {
    return null;
  }
  if (!isPlainObject(raw) || raw.format !== 1 || !isPlainObject(raw.stores))
    return null;

  const stores: Record<string, string> = {};
  for (const key of DESKTOP_STATE_KEYS) {
    const value = raw.stores[key];
    if (typeof value !== "string" || value.length > MAX_PAYLOAD_CHARS)
      continue;
    try {
      const payload: unknown = JSON.parse(value);
      if (isPlainObject(payload) && isPlainObject(payload.state) && hasValidShape(key, payload.state))
        stores[key] = value;
    }
    catch {
      // Not JSON: drop this store, keep the rest.
    }
  }
  return Object.keys(stores).length > 0 ? { format: 1, stores } : null;
}

/**
 * Writes each store's payload back and rehydrates it, so the running app
 * picks the state up without a reload. A store that fails to rehydrate is
 * skipped rather than aborting the others. Returns the storage keys applied.
 */
export async function applyDesktopState(
  snapshot: DesktopStateSnapshot,
  storage: Storage = localStorage,
  stores: readonly PersistedStore[] = STORES,
): Promise<string[]> {
  const applied: string[] = [];
  for (const store of stores) {
    const name = store.persist?.getOptions().name;
    const payload = name ? snapshot.stores[name] : undefined;
    if (!store.persist || !name || payload === undefined)
      continue;
    try {
      storage.setItem(name, payload);
      await store.persist.rehydrate();
      applied.push(name);
    }
    catch {
      // Out of quota, or a migrate that threw: this store keeps its current state.
    }
  }
  return applied;
}
