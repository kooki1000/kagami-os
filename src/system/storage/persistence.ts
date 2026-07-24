/**
 * Best-effort request for durable storage (ROADMAP.md risk R1): browsers may
 * evict IndexedDB/localStorage for a site under storage pressure unless the
 * origin has been granted "persistent" storage. Requesting it can't force a
 * grant — that's up to browser heuristics (installed PWAs and frequently
 * visited sites are favored) — but asking is free, and the result is worth
 * showing the user rather than silently hoping. Deliberately not a Zustand
 * store: this resolves once per session and has exactly one reader
 * (Settings › About), so a plain memoized promise is enough.
 */

let resolved: boolean | null = null;

const request: Promise<boolean | null> = (async () => {
  if (typeof navigator === "undefined" || !navigator.storage?.persist)
    return null;
  try {
    resolved = await navigator.storage.persist();
  }
  catch {
    resolved = null;
  }
  return resolved;
})();

/** Kick off the request. Idempotent — every caller shares the same promise. */
export function requestPersistentStorage(): Promise<boolean | null> {
  return request;
}

/** Last-known result, synchronously: `null` before it resolves or when unsupported. */
export function getPersistedStorageStatus(): boolean | null {
  return resolved;
}
