import type { FsNode } from "../fs/types";
import { notify } from "../notifications/notificationStore";
import { useWindowStore } from "../windows/windowStore";
import { launchApp } from "./launch";
import { getApp } from "./registry";

/** Launch payload used when an app is asked to open a specific file. */
export interface FilePayload {
  fileId: string;
}

export function payloadFileId(payload: unknown): string | null {
  if (
    payload
    && typeof payload === "object"
    && "fileId" in payload
    && typeof (payload as FilePayload).fileId === "string"
  ) {
    return (payload as FilePayload).fileId;
  }
  return null;
}

/** Which app opens this file? The MVP association table. */
export function appIdForFile(node: FsNode): string | null {
  if (node.type !== "file")
    return null;
  const mime = node.mimeType ?? "";
  if (mime.startsWith("text/"))
    return "notes";
  if (mime.startsWith("image/"))
    return "viewer";
  return null;
}

/**
 * Open a file in its associated app. Returns false when no app is
 * associated with the file's type.
 */
export function openFile(node: FsNode): boolean {
  const appId = appIdForFile(node);
  const app = appId ? getApp(appId) : undefined;
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
