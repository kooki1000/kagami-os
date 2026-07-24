// Kagami OS service worker — hand-rolled (no workbox/vite-plugin-pwa; see
// ARCHITECTURE.md's StorageAdapter section and the `idb` policy precedent:
// new deps are subject to the workspace's `minimumReleaseAge` pnpm policy,
// so this project prefers a thin hand-rolled layer over pulling one in).
//
// Strategy is runtime caching (stale-while-revalidate), not a build-time
// precache manifest: the hashed asset filenames Vite emits aren't known to
// this static file, so instead every same-origin GET response is cached the
// first time it's fetched and served from cache immediately on subsequent
// loads, with a background fetch keeping the cache fresh. That's enough to
// make a repeat visit (and a fully offline boot) work once the shell has
// been loaded once.
const CACHE_NAME = "kagami-shell-v1";

globalThis.addEventListener("install", () => {
  // Nothing to precache — the cache fills in as the fetch handler below
  // observes real requests. Activate immediately rather than waiting for
  // old clients to close.
  globalThis.skipWaiting();
});

globalThis.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name)),
      );
      await globalThis.clients.claim();
    })(),
  );
});

globalThis.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only same-origin GETs are cacheable/offline-relevant; let everything
  // else (POST, cross-origin, chrome-extension:, …) go straight to network.
  if (request.method !== "GET" || new URL(request.url).origin !== globalThis.location.origin)
    return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      const networkFetch = fetch(request)
        .then((response) => {
          // Only cache genuine same-origin 200s — an opaque/error response
          // cached here would otherwise get served back as if it were good.
          if (response.ok)
            cache.put(request, response.clone());
          return response;
        })
        .catch(() => undefined);

      // Stale-while-revalidate: serve the cache instantly if we have it,
      // refreshing in the background; fall back to network for a first
      // visit (and to the error if we're offline with nothing cached yet).
      return cached ?? (await networkFetch) ?? Response.error();
    })(),
  );
});
