/**
 * Minimal `srcdoc` shell for a third-party app's sandboxed frame. Unlike
 * `documents/entryHtml.ts`, there's no first-party chrome to carry — the
 * whole frame is the app's own JS building its own DOM (§ the "entry is
 * always JavaScript, never HTML" decision, step 17). `scriptSrc` is always a
 * same-realm `blob:` URL the shell builds itself at launch time from the
 * app's VFS-stored entry-script bytes (`ThirdPartyAppHost.tsx`) — never
 * derived from untrusted text, so unlike `entryHtml.ts`'s file-id attribute
 * it needs no escaping. `script-src 'self' blob:` is the same CSP directive
 * pdf.js's worker already relies on (`vite.config.ts`).
 *
 * No inline `<script>` here either: an inline bootstrap that just set
 * `document.currentScript`'s `src` wouldn't itself be blob:-sourced, so it
 * would be blocked the same way a third-party inline script would be.
 */
export function buildThirdPartyEntryHtml(scriptSrc: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script src="${scriptSrc}"></script>
</body>
</html>`;
}
