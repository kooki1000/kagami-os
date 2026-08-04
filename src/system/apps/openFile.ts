import type { FsNode } from "../fs/types";
import type { FilePayload } from "./filePayload";
import { effectiveMimeType, isTextLikeMime } from "../fs/mimeTypes";
import { notify } from "../notifications/notificationStore";
import { useSettingsStore } from "../settings/settingsStore";
import { useViewPrefsStore } from "../settings/viewPrefsStore";
import { useWindowStore } from "../windows/windowStore";
import { payloadFileId } from "./filePayload";
import { launchApp } from "./launch";
import { getApp } from "./registry";

export type { FilePayload } from "./filePayload";
export { payloadFileId } from "./filePayload";

// Built-in mime-family → app defaults (B11's baseline, before any
// user override from settingsStore.fileAssociations). Ordered by
// specificity: whichever family matches first wins, so the exact code types
// below have to precede the bare `text/` family they belong to.
const FAMILY_DEFAULTS: Array<{ prefix: string; appId: string }> = [
  // Code and structured data open in the editor (D4). Prose — `text/plain`,
  // `text/markdown` — deliberately stays with Notes: both apps can open
  // either, and this only picks what a double-click does.
  { prefix: "text/javascript", appId: "code" },
  { prefix: "text/typescript", appId: "code" },
  { prefix: "text/css", appId: "code" },
  { prefix: "text/html", appId: "code" },
  { prefix: "text/rust", appId: "code" },
  { prefix: "text/x-", appId: "code" },
  { prefix: "application/json", appId: "code" },
  { prefix: "application/xml", appId: "code" },
  { prefix: "application/yaml", appId: "code" },
  { prefix: "application/toml", appId: "code" },
  { prefix: "application/sql", appId: "code" },
  { prefix: "application/x-sh", appId: "code" },
  { prefix: "text/", appId: "notes" },
  { prefix: "image/", appId: "viewer" },
  { prefix: "application/pdf", appId: "documents" },
  { prefix: "audio/", appId: "player" },
  { prefix: "video/", appId: "player" },
];

/** Apps that can open any text-ish file, whichever one is the default for it. */
const TEXT_CAPABLE_APP_IDS = ["notes", "code"];

function familyDefaultAppId(mime: string): string | null {
  return FAMILY_DEFAULTS.find(f => mime.startsWith(f.prefix))?.appId ?? null;
}

/**
 * Every app capable of opening this exact mime type, built-in default
 * first. The mime-type-only half of `candidateAppsForFile`, for callers
 * (e.g. Settings' Default Apps pane, U5) that want to offer a mime type
 * no file on disk happens to have right now.
 *
 * Text is the first type with more than one candidate — Notes and the code
 * editor both open it — which is what turns "Open With ▸" and the Default
 * Apps pane from one-item menus into real choices.
 */
export function candidateAppsForMime(mime: string): string[] {
  const appId = familyDefaultAppId(mime);
  const candidates = appId ? [appId] : [];
  if (isTextLikeMime(mime)) {
    for (const id of TEXT_CAPABLE_APP_IDS) {
      if (!candidates.includes(id))
        candidates.push(id);
    }
  }
  // An app can be absent from a build (a flag-gated one, or a manifest that
  // was removed); offering it would produce a menu item that can only fail.
  return candidates.filter(id => getApp(id));
}

/**
 * Every app capable of opening this file's mime type, built-in default
 * first. Powers the Files "Open With ▸" submenu.
 */
export function candidateAppsForFile(node: FsNode): string[] {
  if (node.type !== "file")
    return [];
  return candidateAppsForMime(effectiveMimeType(node));
}

/**
 * Which app opens this file? A user override (settingsStore) wins over the
 * built-in mime-family table.
 *
 * Routes on `effectiveMimeType`, not the stored one: a `.ts` uploaded as
 * `video/mp2t` or a `.py` uploaded as nothing at all would otherwise match no
 * family and fail to open at all.
 */
export function appIdForFile(node: FsNode): string | null {
  if (node.type !== "file")
    return null;
  const mime = effectiveMimeType(node);
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

  // U14 "Recents": every successful open of a file (regardless of which app
  // or launch path — Files double-click, Desktop, Search) bumps it to the
  // front of the ring buffer. Recorded here, not in Files' `openNode`, so
  // every entry point shares one "recently opened" history.
  useViewPrefsStore.getState().recordRecent(node.id);

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
    // Keyed on the effective type, the same one `appIdForFile` will look the
    // override up by — storing the raw `video/mp2t` a `.ts` upload carries
    // would record a preference nothing ever reads back.
    const mime = effectiveMimeType(node);
    if (mime)
      useSettingsStore.getState().setFileAssociation(mime, appId);
  }
  return ok;
}
