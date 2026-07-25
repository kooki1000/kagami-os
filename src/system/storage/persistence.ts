import { useEffect, useState } from "react";

/** Best-effort request for durable storage (ROADMAP.md risk R1) — result shown in Settings › About. */

let pending: Promise<boolean | null> | null = null;

/** Idempotent — every caller shares the same in-flight/settled promise. */
export function requestPersistentStorage(): Promise<boolean | null> {
  pending ??= typeof navigator === "undefined" || !navigator.storage?.persist
    ? Promise.resolve(null)
    : navigator.storage.persist().catch(() => null);
  return pending;
}

/** Whether storage persistence was granted — `null` while pending or unsupported. */
export function usePersistentStorageStatus(): boolean | null {
  const [status, setStatus] = useState<boolean | null>(null);
  useEffect(() => {
    requestPersistentStorage().then(setStatus);
  }, []);
  return status;
}
