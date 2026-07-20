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
 * Every app capable of opening this file's mime type, built-in default
 * first. Powers the Files "Open With ▸" submenu; today every family has
 * exactly one built-in candidate, but the list shape is what lets a
 * future second app (e.g. a code editor) show up alongside it.
 */
export function candidateAppsForFile(node: FsNode): string[] {
  if (node.type !== "file")
    return [];
  const appId = familyDefaultAppId(node.mimeType ?? "");
  return appId ? [appId] : [];
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

  // Multi-instance apps (e.g. the image viewer) get one window per file;
  // focus an existing one instead of opening a duplicate.
  if (!app.singleInstance) {
    const store = useWindowStore.getState();
    const existing = store.windows.find(
      w => w.appId === app.id && payloadFileId(w.payload) === node.id,
    );
    if (existing) {
      if (existing.minimized)
        store.restoreWindow(existing.id);
      else store.focusWindow(existing.id);
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
  const mime = node.mimeType ?? "";
  if (mime)
    useSettingsStore.getState().setFileAssociation(mime, appId);
  return launchFileInApp(node, appId);
}
