#!/usr/bin/env node
/**
 * Builds the sandboxed-app JS bundles under `public/sandbox/`, loaded by
 * `SandboxedAppHost` inside an opaque-origin `srcdoc` iframe (step 16a) —
 * separate from the main app build since these ship as classic
 * `<script src>` assets outside the SPA's own module graph.
 *
 * Uses Vite's JS API directly rather than a CLI-run config, since this only
 * needs to run for a single sandboxed app's entry today.
 *
 * Wired as `predev` and prepended to `build` (see package.json) so
 * `public/sandbox/*.js` is never stale.
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = `${root}public/sandbox`;

await mkdir(outDir, { recursive: true });

const sharedConfig = {
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
  logLevel: "warn",
};

await build({
  ...sharedConfig,
  build: {
    outDir,
    emptyOutDir: false, // demo-app.js (hand-authored, step 16a) also lives here
    minify: true,
    lib: {
      // pdf.js's worker source is imported with Vite's `?raw` suffix and
      // embedded as a blob: URL at runtime (sandboxEntry.ts) rather than
      // shipped as a second static file — see that file's comment for why.
      entry: `${root}src/apps/documents/sandboxEntry.ts`,
      formats: ["iife"],
      name: "KagamiDocumentsSandbox",
      fileName: () => "documents.js",
    },
  },
});
console.log("[build:sandbox] wrote public/sandbox/documents.js");

// Step 17 (D8.5): the generic loader every installed third-party app's
// frame loads via a real <script src>. Has no imports of its own — a
// separate build call (rather than a multi-entry lib config) keeps each
// bundle's config next to its own comment, since the two have nothing in
// common besides outDir.
await build({
  ...sharedConfig,
  build: {
    outDir,
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: `${root}src/system/apps/thirdPartyLoaderEntry.ts`,
      formats: ["iife"],
      name: "KagamiThirdPartyLoader",
      fileName: () => "third-party-loader.js",
    },
  },
});
console.log("[build:sandbox] wrote public/sandbox/third-party-loader.js");
