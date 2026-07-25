// Hand-rolled (no workbox/vite-plugin-pwa) — new deps are subject to this
// workspace's minimumReleaseAge pnpm policy; see ARCHITECTURE.md's
// StorageAdapter section for the same idb precedent.
//
// Runtime caching (stale-while-revalidate), not a precache manifest: Vite's
// hashed chunk filenames aren't known to this static file, so every
// same-origin GET gets cached on first fetch and served from cache
// immediately after, refreshed in the background.
const CACHE_NAME = "kagami-shell-v1";
const cachePromise = caches.open(CACHE_NAME);
const ORIGIN_PREFIX = `${globalThis.location.origin}/`;

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
  if (request.method !== "GET" || !request.url.startsWith(ORIGIN_PREFIX))
    return;

  event.respondWith(
    (async () => {
      const cache = await cachePromise;
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

      // Serve the cache instantly if we have it; first visit (or offline
      // with nothing cached yet) falls through to the network/error.
      return cached ?? (await networkFetch) ?? Response.error();
    })(),
  );
});
