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

/**
 * Built-in mime → app defaults (B11's baseline, before any user override from
 * `settingsStore.fileAssociations`).
 *
 * Two tables rather than one ordered list: an exact type always beats a
 * family, so adding a row can't accidentally be shadowed by a broader prefix
 * declared above it. Code and structured data open in the editor (D4); prose
 * — `text/plain`, `text/markdown` — stays with Notes. Both apps can open
 * either, so this only decides what a double-click does.
 */
const EXACT_DEFAULTS: Record<string, string> = {
  "text/javascript": "code",
  "text/typescript": "code",
  "text/css": "code",
  "text/x-scss": "code",
  "text/x-less": "code",
  "text/html": "code",
  "text/rust": "code",
  "text/x-python": "code",
  "text/x-go": "code",
  "application/json": "code",
  "application/xml": "code",
  "application/yaml": "code",
  "application/toml": "code",
  "application/sql": "code",
  "application/x-sh": "code",
  "application/pdf": "documents",
};

const FAMILY_DEFAULTS: Array<{ prefix: string; appId: string }> = [
  { prefix: "text/", appId: "notes" },
  { prefix: "image/", appId: "viewer" },
  { prefix: "audio/", appId: "player" },
  { prefix: "video/", appId: "player" },
];

/**
 * Apps that can open any text-ish file, whichever one is the default for it.
 * A hardcoded list because an app can't yet *declare* what it opens — step 17
 * (`ROADMAP.md` D8) needs exactly that declaration for third-party apps, and
 * this list dissolves into it. Every id here must accept anything
 * `isTextLikeMime` accepts, not just `text/*`.
 */
const TEXT_CAPABLE_APP_IDS = ["notes", "code"];

function familyDefaultAppId(mime: string): string | null {
  return EXACT_DEFAULTS[mime] ?? FAMILY_DEFAULTS.find(f => mime.startsWith(f.prefix))?.appId ?? null;
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
 * Routes on `effectiveMimeType` rather than the stored type, so a file whose
 * creator recorded the wrong one still opens — see `system/fs/mimeTypes.ts`.
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
