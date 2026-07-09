import type { Plugin } from "vite";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Content-Security-Policy for the static build. The app is fully
 * client-side and self-hosted, so everything is `'self'` except:
 *  - `img-src`/`font-src data:` for the inline SVG favicon and seed artwork
 *    (and, later, uploaded images held as data URLs);
 *  - `img-src`/`worker-src blob:` reserved for the Phase 10 blob store and
 *    the zip-download worker (B1/B3);
 *  - `style-src 'unsafe-inline'` for React inline styles and the live
 *    accent/wallpaper custom properties written onto `<html>`.
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
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
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

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMeta()],
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
