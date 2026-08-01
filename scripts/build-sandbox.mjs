#!/usr/bin/env node
/**
 * Builds the sandboxed-app JS bundles that live under `public/sandbox/` and
 * are loaded by `SandboxedAppHost` inside an opaque-origin `srcdoc` iframe
 * (step 16a) — separate from the main app build because these ship as
 * classic `<script src>` / `Worker` assets outside the SPA's own module
 * graph, not as Vite-served app routes.
 *
 * Uses Vite's JS API directly (rather than a `vite.sandbox.config.ts` run
 * via the CLI) because the two outputs need different handling: our own
 * code needs real bundling (it imports `pdfjs-dist`), while `pdfjs-dist`'s
 * worker ships pre-built and just needs copying to a stable path — Vite's
 * `build.lib` only supports one entry when `format: "iife"`, so a single
 * multi-entry config can't produce both anyway.
 *
 * Wired as `predev` and prepended to `build` (see package.json) so
 * `public/sandbox/*.js` is never stale.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = `${root}public/sandbox`;

mkdirSync(outDir, { recursive: true });

await build({
  root,
  configFile: false,
  // outDir sits inside the project's publicDir (public/sandbox) — without
  // this, Vite's default publicDir→outDir copy step dumps the whole
  // public/ tree (icons, manifest.webmanifest, sw.js) into public/sandbox
  // on every run.
  publicDir: false,
  resolve: {
    alias: {
      "@": `${root}src`,
    },
  },
  build: {
    outDir,
    emptyOutDir: false, // demo-app.js (hand-authored, step 16a) also lives here
    minify: true,
    lib: {
      entry: `${root}src/apps/documents/sandboxEntry.ts`,
      formats: ["iife"],
      name: "KagamiDocumentsSandbox",
      fileName: () => "documents.js",
    },
  },
  logLevel: "warn",
});

// pdf.worker.min.mjs is already a complete, standalone ES module — copied
// rather than re-bundled. It must stay an ES module (not IIFE): pdf.js
// always constructs its worker with `new Worker(src, { type: "module" })`.
copyFileSync(
  `${root}node_modules/pdfjs-dist/build/pdf.worker.min.mjs`,
  `${outDir}/pdf.worker.js`,
);

console.log("[build:sandbox] wrote public/sandbox/documents.js and pdf.worker.js");
