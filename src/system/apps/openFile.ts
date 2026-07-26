import type { FsNode } from "../fs/types";
import type { FilePayload } from "./filePayload";
import { notify } from "../notifications/notificationStore";
import { useSettingsStore } from "../settings/settingsStore";
import { useWindowStore } from "../windows/windowStore";
import { payloadFileId } from "./filePayload";
import { launchApp } from "./launch";
import { getApp } from "./registry";

export type { FilePayload } from "./filePayload";
export { payloadFileId } from "./filePayload";

// Built-in mime-family → app defaults (B11's baseline, before any
// user override from settingsStore.fileAssociations). Ordered by
// specificity: whichever family matches first wins.
const FAMILY_DEFAULTS: Array<{ prefix: string; appId: string }> = [
  { prefix: "text/", appId: "notes" },
  { prefix: "image/", appId: "viewer" },
  { prefix: "audio/", appId: "player" },
  { prefix: "video/", appId: "player" },
];

function familyDefaultAppId(mime: string): string | null {
  return FAMILY_DEFAULTS.find(f => mime.startsWith(f.prefix))?.appId ?? null;
}

/**
 * Every app capable of opening this exact mime type, built-in default
 * first. The mime-type-only half of `candidateAppsForFile`, for callers
 * (e.g. Settings' Default Apps pane, U5) that want to offer a mime type
 * no file on disk happens to have right now.
 */
export function candidateAppsForMime(mime: string): string[] {
  const appId = familyDefaultAppId(mime);
  return appId ? [appId] : [];
}

/**
 * Every app capable of opening this file's mime type, built-in default
 * first. Powers the Files "Open With ▸" submenu; today every family has
 * exactly one built-in candidate, but the list shape is what lets a
 * future second app (e.g. a code editor) show up alongside it.
 */
export function candidateAppsForFile(node: FsNode): string[] {
  if (node.type !== "file")
    return [];
  return candidateAppsForMime(node.mimeType ?? "");
}

/** Which app opens this file? A user override (settingsStore) wins over the built-in mime-family table. */
export function appIdForFile(node: FsNode): string | null {
  if (node.type !== "file")
    return null;
  const mime = node.mimeType ?? "";
  const override = useSettingsStore.getState().fileAssociations[mime];
  if (override && getApp(override))
    return override;
  return familyDefaultAppId(mime);
}

function launchFileInApp(node: FsNode, appId: string): boolean {
  const app = getApp(appId);
  if (!app) {
    notify({
      title: "Can’t open this file",
      body: `No app is associated with “${node.name}”.`,
      tone: "danger",
    });
    return false;
  }

  // Multi-instance apps (e.g. the image viewer, the player) get one window
  // per file; focus an existing one instead of opening a duplicate.
  if (!app.singleInstance) {
    const store = useWindowStore.getState();
    const existing = store.windows.find(
      w => w.appId === app.id && payloadFileId(w.payload) === node.id,
    );
    if (existing) {
      // A fresh payload object, even with the same fileId, is what lets the
      // app notice a re-launch during render (review-backlog #7: Player's
      // `activeId` only re-syncs when `payload` changes identity, not when
      // the window is merely focused).
      const refreshedPayload: FilePayload = { fileId: node.id };
      store.reuseWindow(existing.id, refreshedPayload);
      return true;
    }
  }

  const payload: FilePayload = { fileId: node.id };
  launchApp(app.id, {
    payload,
    title: app.singleInstance ? undefined : node.name,
  });
  return true;
}

/**
 * Open a file in its associated app (user override, else the built-in
 * mime-family table). Returns false when no app is associated with the
 * file's type.
 */
export function openFile(node: FsNode): boolean {
  return launchFileInApp(node, appIdForFile(node) ?? "");
}

/**
 * "Open With" (B11): open this file with a specific app, and remember it
 * as the default for the file's exact mime type going forward — mirrors
 * the "always open with" behavior users expect from a desktop file manager.
 */
export function openFileWithApp(node: FsNode, appId: string): boolean {
  const ok = launchFileInApp(node, appId);
  // Persist only once the launch actually succeeded (review-backlog #18) —
  // otherwise a bad/unregistered appId still overwrites the association,
  // silently breaking every future plain `openFile()` for this mime type.
  if (ok) {
    const mime = node.mimeType ?? "";
    if (mime)
      useSettingsStore.getState().setFileAssociation(mime, appId);
  }
  return ok;
}
