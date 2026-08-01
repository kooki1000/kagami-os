import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Read at config-eval time rather than a JSON import assertion, so this
// stays agnostic of the Node/TS import-attributes syntax churn — this file
// only ever needs the one field.
const pkgVersion = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string }
).version;

/**
 * Content-Security-Policy for the static build. The app is fully
 * client-side and self-hosted, so everything is `'self'` except:
 *  - `img-src`/`font-src data:` for the inline SVG favicon and seed artwork
 *    (and, later, uploaded images held as data URLs);
 *  - `img-src`/`media-src`/`worker-src blob:` for the blob store and the
 *    zip-download worker (B1/B3). `media-src` must be spelled out — it falls
 *    back to `default-src`, not `img-src`, so omitting it blocks every
 *    `<audio>`/`<video>` blob URL in a production build;
 *  - `style-src 'unsafe-inline'` for React inline styles and the live
 *    accent/wallpaper custom properties written onto `<html>`;
 *  - `frame-src 'self'` for the capability sandbox's srcdoc iframe (step
 *    16a) — no second origin needed, since `sandbox="allow-scripts"` (no
 *    `allow-same-origin`) already forces an opaque origin on its own; see
 *    `src/system/sandbox/SandboxedAppHost.tsx` and
 *    `src/apps/sandboxDemo/demoEntry.ts` for the fuller mechanism.
 *
 * `script-src 'self'` holds because the production bundle emits no inline
 * scripts. Injected build-only — the dev server needs inline/eval for HMR.
 * `frame-ancestors` and HSTS can't be set from a meta tag; enforce those as
 * response headers at the CDN/server on deploy.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function cspMeta(): Plugin {
  return {
    name: "kagami-csp-meta",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", "content": CSP },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

/**
 * `Access-Control-Allow-Origin: *` for `/sandbox/*` static assets only —
 * the sandboxed iframe's opaque origin makes even same-server fetches
 * cross-origin from its perspective, which pdf.js's worker fallback needs
 * CORS for (see `src/apps/documents/sandboxEntry.ts` for the full story).
 * Scoped to `/sandbox/` (public, non-sensitive JS bundles) rather than
 * every response. Unlike CSP this can't be a static-build meta tag — it
 * only helps `vite dev`/`vite preview`; production hosting needs the same
 * header at the CDN/server, alongside the `frame-ancestors`/HSTS note above.
 */
function sandboxAssetCorsMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url?.startsWith("/sandbox/"))
      res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  };
}

function sandboxAssetCors(): Plugin {
  return {
    name: "kagami-sandbox-asset-cors",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(sandboxAssetCorsMiddleware());
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(sandboxAssetCorsMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMeta(), sandboxAssetCors()],
  // Injected build-time so About (SettingsApp) shows the real package
  // version instead of a string that only ever gets more stale
  // (review-backlog #15).
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Honor an externally assigned port (e.g. preview tooling).
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
});
