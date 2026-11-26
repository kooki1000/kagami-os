import { useEffect, useState } from "react";

/**
 * C5 — how much of the browser's storage quota this site is using, from
 * `navigator.storage.estimate()`. The numbers are the browser's own rough
 * accounting (they include caches and are deliberately imprecise), so the UI
 * says "about" and the warnings leave slack rather than promising a failure.
 */

export interface StorageEstimate {
  usage: number;
  quota: number;
}

export type StorageLevel = "ok" | "low" | "critical";

/** Above this share of the quota the meter turns to a warning. */
export const LOW_SPACE_FRACTION = 0.8;
export const CRITICAL_SPACE_FRACTION = 0.95;

export async function readStorageEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate)
    return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== "number" || typeof quota !== "number" || quota <= 0)
      return null;
    return { usage, quota };
  }
  catch {
    return null;
  }
}

export function usedFraction({ usage, quota }: StorageEstimate): number {
  return Math.min(1, Math.max(0, usage / quota));
}

export function storageLevel(estimate: StorageEstimate): StorageLevel {
  const fraction = usedFraction(estimate);
  if (fraction >= CRITICAL_SPACE_FRACTION)
    return "critical";
  return fraction >= LOW_SPACE_FRACTION ? "low" : "ok";
}

/**
 * Whether adding `bytes` more would push usage to or past the quota. Blob
 * bytes are stored once (dedupe) and the estimate is approximate, so this
 * errs toward warning only when the write clearly doesn't fit.
 */
export function wouldExceedQuota(estimate: StorageEstimate, bytes: number): boolean {
  return estimate.usage + bytes >= estimate.quota;
}

/**
 * Reads the estimate on mount and then every `refreshMs` (the menu-bar item
 * wants it to follow writes; Settings only needs the first value). `null`
 * while loading, or where the browser doesn't offer an estimate.
 */
export function useStorageEstimate(refreshMs?: number): StorageEstimate | null {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  useEffect(() => {
    let cancelled = false;
    function refresh(): void {
      void readStorageEstimate().then((next) => {
        if (!cancelled)
          setEstimate(next);
      });
    }
    refresh();
    const timer = refreshMs ? window.setInterval(refresh, refreshMs) : undefined;
    return () => {
      cancelled = true;
      if (timer !== undefined)
        window.clearInterval(timer);
    };
  }, [refreshMs]);
  return estimate;
}
