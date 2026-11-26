import { storageLevel, usedFraction, useStorageEstimate } from "@/system/storage/storageEstimate";

/** How often the optional menu-bar item re-reads the browser's estimate. */
const REFRESH_MS = 60_000;

/**
 * C5 — the opt-in menu-bar storage item: the share of the quota in use,
 * tinted once it's getting full. Renders nothing where the browser offers no
 * estimate. Detail and the exact figures live in Settings › General.
 */
export function StorageIndicator() {
  const estimate = useStorageEstimate(REFRESH_MS);
  if (!estimate)
    return null;
  const percent = Math.round(usedFraction(estimate) * 100);
  const level = storageLevel(estimate);
  return (
    <span
      role="status"
      aria-label={`Storage ${percent}% used`}
      className={`rounded-full bg-ph px-2 py-[calc(2px*var(--ui-scale))] text-11 font-medium tabular-nums ${level === "ok" ? "text-ink-2" : "text-accent-2"}`}
    >
      {`${percent}%`}
    </span>
  );
}
