/**
 * The `documents.js` bundle (step 16b, D6) — runs inside the opaque-origin
 * `srcdoc` iframe `SandboxedAppHost` renders, loaded via a real
 * `<script src="/sandbox/documents.js">` tag (see `entryHtml.ts`). Built by
 * `scripts/build-sandbox.mjs` into `public/sandbox/documents.js`. No
 * storage/cookies/network access exists in this scope other than the bridge
 * client below — that's the point of rendering PDFs here rather than in the
 * shell (`ROADMAP.md` R7).
 */
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { getDocument, GlobalWorkerOptions, VerbosityLevel } from "pdfjs-dist";
import pdfWorkerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
import { createSandboxClient } from "@/system/sandbox/client";
import { BASE_SCALE, clampPage, clampScale, fitWidthScale, formatPageInfo, ZOOM_STEP } from "./pageNav";

// pdf.js always tries a real background Worker first, and this frame's
// opaque origin (`allow-scripts`, no `allow-same-origin` — the point of the
// sandbox) forces it through a fallback path one way or another, verified
// empirically to diverge by engine: Chromium/Firefox throw a synchronous
// SecurityError constructing the Worker at all; WebKit instead lets the
// worker construct but then rejects its module import as a `script-src`
// CSP violation (a real inherited-CSP corner case: 'self' apparently
// resolves against this document's own opaque origin there, unlike in
// Chromium/Firefox — nothing pdf.js or this file's CSP config can steer).
// Embedding the worker's source as a same-realm `blob:` URL (`script-src`
// already allows `blob:`, unambiguous in every engine, unlike `self` for an
// opaque origin) sidesteps the divergence entirely rather than chasing it
// engine-by-engine. Either way pdf.js's automatic "fake worker" fallback
// still runs the actual parsing on this frame's own main thread, never the
// shell's. Verbosity is turned down only so the expected fallback warning
// doesn't read as a bug to a manual tester.
GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([pdfWorkerSource], { type: "text/javascript" }));
const PDF_VERBOSITY = VerbosityLevel.ERRORS;

const bridge = createSandboxClient("documents");
bridge.onAppCommand(handleAppCommand);

// --- DOM --------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Shared by the transient status line and the persistent page-info badge: both hide themselves when set to empty text. */
function setVisibleText(target: HTMLElement, text: string) {
  target.hidden = text.length === 0;
  target.textContent = text;
}

function setStatus(text: string, { loading = false } = {}) {
  el("status").hidden = text.length === 0;
  el("spinner").hidden = !loading;
  setVisibleText(el("status-text"), text);
}

// --- Document state -----------------------------------------------------

let pdfDocument: PDFDocumentProxy | null = null;
let currentPage = 1;
let scale = BASE_SCALE;
let renderTask: RenderTask | null = null;

async function renderCurrentPage() {
  if (!pdfDocument)
    return;

  // A rapid zoom/page change can start a new render before the previous one
  // finishes — cancel it rather than let two renders race on one canvas.
  renderTask?.cancel();

  let page: PDFPageProxy;
  try {
    page = await pdfDocument.getPage(currentPage);
  }
  catch (error) {
    setStatus(`Couldn't open page ${currentPage}: ${error instanceof Error ? error.message : "unknown error"}`);
    return;
  }

  const viewport = page.getViewport({ scale });
  const canvas = el<HTMLCanvasElement>("page");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  try {
    // `canvas` (not the legacy `canvasContext`) is pdf.js 6.x's recommended
    // render target — passing both is unsupported ("if canvasContext must
    // be used, canvas must be null").
    const task = page.render({ canvas, viewport });
    renderTask = task;
    await task.promise;
    if (renderTask === task)
      renderTask = null;
  }
  catch (error) {
    // A cancelled render rejects too — not a real failure, just a
    // superseded frame; only surface genuine render errors.
    const isCancellation = error && typeof error === "object" && "name" in error && error.name === "RenderingCancelledException";
    if (!isCancellation)
      setStatus(`Couldn't render page ${currentPage}: ${error instanceof Error ? error.message : "unknown error"}`);
    return;
  }

  setStatus("");
  setVisibleText(el("pageinfo"), formatPageInfo(currentPage, pdfDocument.numPages, scale));
}

function goToPage(pageNumber: number) {
  if (!pdfDocument)
    return;
  const clamped = clampPage(pageNumber, pdfDocument.numPages);
  if (clamped === currentPage)
    return;
  currentPage = clamped;
  void renderCurrentPage();
}

function setScale(nextScale: number) {
  scale = clampScale(nextScale);
  void renderCurrentPage();
}

async function zoomToFitWidth() {
  if (!pdfDocument)
    return;
  const page = await pdfDocument.getPage(currentPage);
  const unscaledWidth = page.getViewport({ scale: 1 }).width;
  // 32px matches #page's horizontal margin in entryHtml.ts's stylesheet.
  const available = document.body.clientWidth - 32;
  setScale(fitWidthScale(unscaledWidth, available));
}

function handleAppCommand(command: string) {
  switch (command) {
    case "documents.zoomIn":
      setScale(scale * ZOOM_STEP);
      break;
    case "documents.zoomOut":
      setScale(scale / ZOOM_STEP);
      break;
    case "documents.zoomFit":
      void zoomToFitWidth();
      break;
    case "documents.nextPage":
      goToPage(currentPage + 1);
      break;
    case "documents.previousPage":
      goToPage(currentPage - 1);
      break;
  }
}

// --- Boot -----------------------------------------------------------------

async function boot() {
  const fileId = document.body.dataset.fileId;
  if (!fileId) {
    setStatus("No document open.");
    return;
  }

  setStatus("Loading…", { loading: true });
  const response = await bridge.call("fs.read", { id: fileId });
  if (!response.ok) {
    setStatus(`Couldn't open this file: ${response.error.message}`);
    return;
  }

  const { bytes, name } = response.data as { bytes: ArrayBuffer; name: string };

  try {
    pdfDocument = await getDocument({ data: bytes, verbosity: PDF_VERBOSITY }).promise;
  }
  catch (error) {
    setStatus(`Couldn't open "${name}": ${error instanceof Error ? error.message : "unknown error"}`);
    return;
  }

  currentPage = 1;
  await renderCurrentPage();
  void bridge.call("window.setTitle", { title: name });
}

void boot();
