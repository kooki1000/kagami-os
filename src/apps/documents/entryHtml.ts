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
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildDocumentsEntryHtml(fileId: string | null): string {
  const fileIdAttr = fileId ? ` data-file-id="${escapeHtmlAttribute(fileId)}"` : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { height: 100%; margin: 0; }
  body {
    font: 13px/1.5 system-ui, sans-serif;
    color: #2b2925;
    background: #efece4;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: auto;
  }
  #status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    color: #75706a;
  }
  #status[hidden] { display: none; }
  #spinner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid rgba(15, 155, 142, .25);
    border-top-color: #0f9b8e;
    animation: spin .7s linear infinite;
  }
  #spinner[hidden] { display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #page {
    margin: 16px;
    box-shadow: 0 1px 4px rgba(30, 25, 18, .18);
    background: #fff;
    max-width: calc(100% - 32px);
    height: auto;
  }
  #pageinfo {
    position: fixed;
    /* Top, not bottom: the shell's dock always sits at the bottom of the
       screen and would otherwise cover this for any window near it. */
    right: 12px;
    top: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(43, 41, 37, .78);
    color: #efece5;
    font-size: 11px;
    letter-spacing: .01em;
  }
  #pageinfo[hidden] { display: none; }
</style>
</head>
<body${fileIdAttr}>
  <div id="status" role="status">
    <span id="spinner" hidden></span>
    <span id="status-text"></span>
  </div>
  <canvas id="page"></canvas>
  <div id="pageinfo" hidden></div>
  <script src="/sandbox/documents.js"></script>
</body>
</html>`;
}
