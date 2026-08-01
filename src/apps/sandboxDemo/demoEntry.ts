/**
 * The `srcdoc` document for the sandbox demo app (step 16a). Its own JS
 * loads via a real `<script src>` to a same-origin static asset
 * (`public/sandbox/demo-app.js`), not an inline `<script>` — a `srcdoc`
 * document inherits the embedding page's CSP, and `script-src 'self'`
 * would otherwise block inline JS. Kept as a plain string, not a bundled
 * component: a real per-app build pipeline is 16b's concern, not this
 * step's — this only has to prove the bridge works.
 */
export const DEMO_ENTRY_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font: 13px/1.5 system-ui, sans-serif; margin: 0; padding: 12px; color: #1a1a1a; background: #fff; }
  section { margin-bottom: 16px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; margin: 0 0 6px; }
  input { font: inherit; padding: 4px 6px; width: 220px; }
  button { font: inherit; padding: 4px 10px; margin-left: 6px; cursor: pointer; }
  pre { background: #f4f4f4; padding: 6px 8px; margin: 6px 0 0; white-space: pre-wrap; word-break: break-all; min-height: 1em; }
</style>
</head>
<body>
  <section>
    <h2>fs.read</h2>
    <input id="read-id" type="text" placeholder="file node id" />
    <button id="read-btn" type="button">Read</button>
    <pre id="read-result" data-testid="read-result"></pre>
  </section>
  <section>
    <h2>notifications.notify</h2>
    <button id="notify-btn" type="button">Send notification</button>
    <pre id="notify-result" data-testid="notify-result"></pre>
  </section>
  <section>
    <h2>Escape attempts (should all fail)</h2>
    <button id="escape-btn" type="button">Try localStorage / cookies / fetch</button>
    <pre id="escape-result" data-testid="escape-result"></pre>
  </section>
  <script src="/sandbox/demo-app.js"></script>
</body>
</html>`;
