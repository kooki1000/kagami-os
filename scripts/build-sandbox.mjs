#!/usr/bin/env node
/**
 * Builds the sandboxed-app JS bundles under `public/sandbox/`, loaded by
 * `SandboxedAppHost` inside an opaque-origin `srcdoc` iframe (step 16a) —
 * separate from the main app build since these ship as classic
 * `<script src>` / `Worker` assets outside the SPA's own module graph.
 *
 * Uses Vite's JS API directly rather than a CLI-run config: our own code
 * needs real bundling (it imports `pdfjs-dist`), while pdf.js's worker
 * ships pre-built and only needs copying — and `build.lib` supports just
 * one entry for `format: "iife"` anyway, so one multi-entry config
 * couldn't produce both.
 *
 * Wired as `predev` and prepended to `build` (see package.json) so
 * `public/sandbox/*.js` is never stale.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = `${root}public/sandbox`;

await mkdir(outDir, { recursive: true });

await Promise.all([
  build({
    root,
    configFile: false,
    // outDir sits inside the project's publicDir (public/sandbox) —
    // without this, Vite's default publicDir→outDir copy dumps the whole
    // public/ tree (icons, manifest.webmanifest, sw.js) in here too.
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
  }),
  // pdf.worker.min.mjs is already a complete, standalone ES module — copied
  // rather than re-bundled. It must stay an ES module (not IIFE): pdf.js
  // always constructs its worker with `new Worker(src, { type: "module" })`.
  copyFile(
    `${root}node_modules/pdfjs-dist/build/pdf.worker.min.mjs`,
    `${outDir}/pdf.worker.js`,
  ),
]);

console.log("[build:sandbox] wrote public/sandbox/documents.js and pdf.worker.js");
