/** Short human date for file listings ("Jul 4", "Dec 12 2025"). */
export function formatModified(timestamp: number): string {
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

/** File name without its extension ("welcome.md" → "welcome"). */
export function nameStem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

const BYTE_UNITS = ["bytes", "KB", "MB", "GB"];

/** Human file size ("512 bytes", "3.4 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${BYTE_UNITS[unit]}`;
}

/** Compact relative time for notifications ("now", "3m", "2h", "Jul 4"). */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45)
    return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return `${hours}h`;
  return formatModified(timestamp);
}

function readPlatformString(): string | undefined {
  if (typeof navigator === "undefined")
    return undefined;
  return (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? navigator.userAgent;
}

/**
 * True if `platform` looks like macOS; true (safe default) when no platform
 * string is available at all. A plain required parameter, not a default —
 * a default of `readPlatformString()` can't be tested deterministically,
 * since JS fires a parameter default on an explicit `undefined` argument
 * exactly the same as on an omitted one.
 */
export function matchesMacPlatform(platform: string | undefined): boolean {
  if (platform === undefined)
    return true;
  return /mac/i.test(platform);
}

/** True on macOS — a live read of the real platform. */
export function isMacPlatform(): boolean {
  return matchesMacPlatform(readPlatformString());
}

/**
 * Display form of a menu-item shortcut string ("⌘W", "⇧⌘N"). Unchanged on
 * Mac; on other platforms, ⌘/⇧ become "Ctrl+"/"Shift+" in that order,
 * matching the Windows/Linux convention. `mac` defaults to the real
 * platform check but can be passed explicitly (tests must, since this
 * suite's Node environment has no `navigator`).
 */
export function formatShortcut(shortcut: string, mac: boolean = isMacPlatform()): string {
  if (mac)
    return shortcut;
  const hasShift = shortcut.includes("⇧");
  const key = shortcut.replace("⇧", "").replace("⌘", "");
  return hasShift ? `Ctrl+Shift+${key}` : `Ctrl+${key}`;
}
