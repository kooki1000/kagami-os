/**
 * The `documents.js` bundle (step 16b, D6) — runs inside the opaque-origin
 * `srcdoc` iframe `SandboxedAppHost` renders, loaded via a real
 * `<script src="/sandbox/documents.js">` tag (see `entryHtml.ts`). Built by
 * `scripts/build-sandbox.mjs` into `public/sandbox/documents.js`, IIFE
 * format so it needs no CORS to load as a classic script (unlike the pdf.js
 * worker it spawns — see `vite.config.ts`'s `sandboxAssetCors` plugin for
 * why that one does).
 *
 * No storage/cookies/network access exists in this scope other than the
 * bridge below — that's the whole point of rendering PDFs here rather than
 * in the shell (`ROADMAP.md` R7).
 */
import type { SandboxRequest, SandboxResponse } from "@/system/sandbox/types";
import { getDocument, GlobalWorkerOptions, VerbosityLevel } from "pdfjs-dist";

// Captured synchronously at top-level script execution — `currentScript` is
// `null` once any microtask/await runs, so this is the only reliable way to
// learn our own script's absolute URL. `window.location` is unusable for
// this: inside an opaque-origin srcdoc document it reports as
// `about:srcdoc`, not the embedder's URL, even though relative URLs in HTML
// attributes (like this very script's `src`) resolve against the embedder
// correctly — the two don't agree, so anchor everything off the one that
// does.
const scriptUrl = (document.currentScript as HTMLScriptElement | null)?.src;
if (!scriptUrl)
  throw new Error("documents.js must load as a classic <script src>, not inline or as a module.");

GlobalWorkerOptions.workerSrc = new URL("pdf.worker.js", scriptUrl).href;

// pdf.js always tries a real background Worker first. Verified empirically
// (not just reasoned about): `new Worker(url, { type: "module" })` from
// inside this opaque-origin (`window.location.origin === "null"`) frame
// throws synchronously —
// `SecurityError: Failed to construct 'Worker': Script at '<url>' cannot be
// accessed from origin 'null'.` — regardless of CORS headers on the worker
// script itself. This is a hard platform restriction on opaque origins, not
// something `sandboxAssetCors` (vite.config.ts) can work around, and not a
// bug here: it's the direct, correct consequence of `allow-scripts` with no
// `allow-same-origin` (the whole point of the sandbox). pdf.js catches the
// failure and falls back to its documented "fake worker" mode — PDF parsing
// on this frame's own thread via `import()` instead, which *is* permitted
// cross-origin with the CORS header `sandboxAssetCors` adds. That fallback
// is silent by design in pdf.js (an expected `console.warn`, not an error);
// verbosity is turned down here only to avoid confusing manual testers, not
// to hide a real problem. Net effect: PDF parsing runs on this sandboxed
// iframe's own main thread, never the shell's — isolation is preserved,
// only true worker backgrounding is unavailable inside this sandbox model.
const PDF_VERBOSITY = VerbosityLevel.ERRORS;

// --- Bridge client (same request/response shape as demo-app.js) ---------

let nextRequestId = 0;
const pending = new Map<string, (response: SandboxResponse) => void>();

window.addEventListener("message", (event) => {
  if (event.source !== window.parent)
    return;
  const data = event.data as SandboxResponse | undefined;
  if (!data || data.kind !== "kagami.sandbox.response")
    return;
  const resolve = pending.get(data.id);
  if (!resolve)
    return;
  pending.delete(data.id);
  resolve(data);
});

function call(method: SandboxRequest["method"], params?: unknown): Promise<SandboxResponse> {
  const id = `documents-${++nextRequestId}`;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    window.parent.postMessage({ kind: "kagami.sandbox.request", id, method, params }, "*");
  });
}

// --- DOM ------------------------------------------------------------------

function statusEl(): HTMLElement {
  return document.getElementById("status")!;
}

function setStatus(text: string) {
  statusEl().textContent = text;
  statusEl().hidden = text.length === 0;
}

function canvasEl(): HTMLCanvasElement {
  return document.getElementById("page") as HTMLCanvasElement;
}

// --- Boot -------------------------------------------------------------

async function boot() {
  const fileId = document.body.dataset.fileId;
  if (!fileId) {
    setStatus("No document open.");
    return;
  }

  setStatus("Loading…");
  const response = await call("fs.read", { id: fileId });
  if (!response.ok) {
    setStatus(`Couldn't open this file: ${response.error.message}`);
    return;
  }

  const { bytes, name } = response.data as { bytes: ArrayBuffer; name: string };

  let page1Rendered = false;
  try {
    const pdf = await getDocument({ data: bytes, verbosity: PDF_VERBOSITY }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = canvasEl();
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    // `canvas` (not the legacy `canvasContext`) is pdf.js 6.x's recommended
    // render target — passing both is unsupported ("if canvasContext must
    // be used, canvas must be null").
    await page.render({ canvas, viewport }).promise;
    page1Rendered = true;
  }
  catch (error) {
    setStatus(`Couldn't render "${name}": ${error instanceof Error ? error.message : "unknown error"}`);
    return;
  }

  if (page1Rendered) {
    setStatus("");
    void call("window.setTitle", { title: name });
  }
}

void boot();
