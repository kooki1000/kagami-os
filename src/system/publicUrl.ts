/**
 * Root-relative URL for a file in `public/`, honoring Vite's `base`.
 *
 * The site is served from `/` almost everywhere (dev server, the e2e preview,
 * the Tauri shell), but the GitHub Pages demo lives under `/kagami-os/`. A
 * hardcoded `/sandbox/documents.js` would resolve against the origin root
 * there and 404, so anything that builds a URL to a `public/` asset by hand
 * (the sandbox iframes' `<script src>`, the service worker) goes through here.
 * Assets Vite itself processes (imports, `?url`, `new URL(..., import.meta.url)`)
 * already respect `base` and don't need this.
 *
 * The result stays root-relative rather than absolute: a `srcdoc` iframe
 * resolves it against the embedding page's origin, which is what we want.
 */
export function joinBase(base: string, path: string): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${path.replace(/^\/+/, "")}`;
}

export function publicUrl(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path);
}
