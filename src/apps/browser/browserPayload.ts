import { navigableUrl } from "./browserUrl";

/**
 * A Browser window's launch payload — the page it should open on (U17).
 *
 * The Browser used to implement neither session-restore hook, so a restored
 * window came back on the homepage no matter where it had been left. Unlike
 * the file-backed apps, nothing else in the system holds this app's "where am
 * I" — the URL lives only in the child webview — so `BrowserApp` writes it
 * back with `setWindowPayload` on every navigation, and this module is what
 * survives the round-trip through localStorage.
 *
 * A leaf module (no registry/store imports) for the same reason
 * `system/apps/filePayload.ts` is one: the manifest references these directly.
 */
export interface BrowserPayload {
  url: string;
}

/** The URL a payload points at, or `null` if it doesn't carry a usable one. */
export function payloadUrl(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object" || !("url" in payload))
    return null;
  return navigableUrl((payload as { url: unknown }).url);
}

/** `AppManifest.serializePayload` — persists the page a window is on. */
export function serializeBrowserPayload(payload: unknown): BrowserPayload | undefined {
  const url = payloadUrl(payload);
  return url ? { url } : undefined;
}

/**
 * `AppManifest.restorePayload` counterpart. Anything that isn't a navigable
 * URL restores as `undefined` rather than being passed through, which reopens
 * the window on the homepage — a session file is editable, so this is the
 * boundary where a hostile `javascript:` entry would otherwise get in.
 */
export function restoreBrowserPayload(json: unknown): BrowserPayload | undefined {
  const url = payloadUrl(json);
  return url ? { url } : undefined;
}
