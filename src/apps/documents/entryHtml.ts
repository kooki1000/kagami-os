/**
 * Builds the `srcdoc` document for the Documents app (step 16b, D6) — the
 * PDF-viewing counterpart to `sandboxDemo`'s `demoEntry.ts`, except this one
 * is templated per launch (which file to open) rather than a static string.
 *
 * The file id is carried as a `data-file-id` HTML attribute rather than an
 * inline `<script>` global, because `script-src 'self'` (a `srcdoc`
 * document inherits the embedder's CSP) blocks inline script execution —
 * markup data doesn't need script-src at all. `fileId` is always an
 * internal fs-store id, never raw user input, but it's escaped anyway on
 * general principle before landing in an HTML attribute.
 *
 * **This document deliberately holds no chrome.** It used to carry a whole
 * stylesheet — page background, status line, spinner, a fixed page-info pill
 * — every value hardcoded to the *light* theme, because CSS custom properties
 * don't cross a `srcdoc` boundary and the frame had no way to read
 * `--surface`. The result was a viewer that was visibly wrong in dark mode
 * and could never be fixed from in here.
 *
 * So the chrome moved out to `DocumentsApp.tsx`, where it's React using the
 * shell's own tokens, and the frame reports its view state outward over
 * `ui.setState` instead of drawing it. The one surface left in here — the
 * backdrop the page sits on — takes its color from a token the host pushes
 * in over the sandbox theme event, since a transparent iframe turned out not
 * to be achievable (see the stylesheet comment).
 *
 * Note for editors: the markup below is a JS template literal, so it must
 * contain no backticks. Keep prose inside it plain.
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Horizontal breathing room around the page canvas; `sandboxEntry`'s fit-width math subtracts the same total. */
export const PAGE_MARGIN_PX = 16;

/** Lagoon light's `--surface-2`, painted for the frame or two before the host's first theme event lands. */
const BACKDROP_FALLBACK = "#efece4";

export function buildDocumentsEntryHtml(fileId: string | null): string {
  const fileIdAttr = fileId ? ` data-file-id="${escapeHtmlAttribute(fileId)}"` : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  /* The frame paints its own backdrop from --surface-2, which the host pushes
     in over the sandbox theme event and sandboxEntry applies to :root. It
     cannot inherit the value (a srcdoc document gets no custom properties
     from its embedder), and it cannot simply be transparent either: an
     opaque-origin iframe's canvas is painted opaque whatever the embedded
     document sets, which is what left a white slab around the page in dark
     mode. */
  html, body {
    height: 100%;
    margin: 0;
    background: var(--surface-2, ${BACKDROP_FALLBACK});
  }
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: auto;
  }
  #page {
    margin: ${PAGE_MARGIN_PX}px;
    /* Paper is legitimately white - it is the document, not chrome. The drop
       shadow is the one concession to depth, and reads on either theme. */
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, .28);
    max-width: calc(100% - ${PAGE_MARGIN_PX * 2}px);
    height: auto;
  }
  #page[hidden] { display: none; }
</style>
</head>
<body${fileIdAttr}>
  <canvas id="page" hidden></canvas>
  <script src="/sandbox/documents.js"></script>
</body>
</html>`;
}
