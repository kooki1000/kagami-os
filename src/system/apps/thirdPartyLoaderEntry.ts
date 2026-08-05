/**
 * Step 17 (D8.5) — the generic first-party bootstrap every installed
 * third-party app's `srcdoc` frame loads via a real `<script src="...">`
 * (satisfies `script-src 'self'`, built by `scripts/build-sandbox.mjs` the
 * same way Documents' own bundle is). Its only job: turn the app's
 * entry-script source — carried in as a base64 `data-entry-source`
 * attribute, since an inline `<script>` is blocked by CSP the same way a
 * hand-authored one would be — into a same-realm `blob:` URL and execute it.
 *
 * Why not have the *shell* build that blob: URL directly and hand the frame
 * its src, the more obvious-looking design? A blob: URL is scoped to the
 * document that created it, and this frame's opaque origin
 * (`sandbox="allow-scripts"`, no `allow-same-origin`) can't dereference one
 * created by the shell's real origin — confirmed empirically ("Not allowed
 * to load local resource"). Building it here, inside the frame's own
 * execution context, is exactly `documents/sandboxEntry.ts`'s pdf.js-worker
 * trick: a blob a document creates is always fetchable by that same
 * document, never by a different one, opaque or not.
 */
const encoded = document.body.dataset.entrySource ?? "";
const source = atob(encoded);
const script = document.createElement("script");
script.src = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
document.body.append(script);
