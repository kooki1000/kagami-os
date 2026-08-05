/**
 * Encodes bytes to base64 in fixed-size chunks — `String.fromCharCode(...bytes)`
 * blows the call stack on a large `Uint8Array` spread as arguments (an entry
 * script easily can be one), so this feeds it in pieces well under that limit.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  return btoa(binary);
}

/**
 * Minimal `srcdoc` shell for a third-party app's sandboxed frame. Unlike
 * `documents/entryHtml.ts`, there's no first-party chrome to carry — the
 * whole frame is the app's own JS building its own DOM (§ the "entry is
 * always JavaScript, never HTML" decision, step 17).
 *
 * The entry script's source travels in as base64 on a data attribute, not a
 * `blob:` URL — see `thirdPartyLoaderEntry.ts`'s doc comment for why a
 * shell-created blob: URL can't be dereferenced by this opaque-origin
 * frame at all. Base64's alphabet (`A-Za-z0-9+/=`) contains none of HTML's
 * special characters, so no escaping is needed the way `entryHtml.ts`'s
 * `data-file-id` attribute needs `escapeHtmlAttribute`.
 */
export function buildThirdPartyEntryHtml(entryBytes: Uint8Array): string {
  const entrySourceBase64 = bytesToBase64(entryBytes);
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body data-entry-source="${entrySourceBase64}">
<script src="/sandbox/third-party-loader.js"></script>
</body>
</html>`;
}
