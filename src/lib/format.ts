/** Locale for `Intl`/`toLocaleString` calls — `navigator.language`, or `undefined` to use the runtime default. */
export function currentLocale(): string | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.language;
}

/**
 * Two formatters built once, not one options object per call. Passing a fresh
 * options bag to `toLocaleDateString` defeats V8's format cache and costs
 * ~25 µs a call — which only shows up where a list renders hundreds of rows
 * unvirtualized (the Notes and Code sidebars), where it was measured at ~15 ms
 * per render for 600 rows against ~0.4 ms this way.
 */
const dateFormatters = {
  sameYear: undefined as Intl.DateTimeFormat | undefined,
  otherYear: undefined as Intl.DateTimeFormat | undefined,
};

/** Short human date for file listings ("Jul 4", "Dec 12 2025"). */
export function formatModified(timestamp: number): string {
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const key = sameYear ? "sameYear" : "otherYear";
  // Built lazily rather than at module load: `currentLocale()` reads
  // `navigator`, which the unit tests' node environment doesn't have.
  dateFormatters[key] ??= new Intl.DateTimeFormat(currentLocale(), {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  return dateFormatters[key].format(date);
}

/**
 * Menu-bar clock time ("3:45", "15:45:12") — the math `MenuBar.tsx`'s
 * `Clock` used to hardcode inline, extracted so U7's hour12/showSeconds
 * settings can drive it. `hour12` matches the original inline logic
 * exactly (a bare 1–12 hour, no AM/PM marker — this codebase never showed
 * one) so the default settings (`hour12: true`, `showSeconds: false`)
 * reproduce the pre-U7 output byte for byte; `false` renders a zero-padded
 * 24-hour hour instead.
 */
export function formatClockTime(date: Date, opts: { hour12: boolean; showSeconds: boolean }): string {
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const hourStr = opts.hour12
    ? String(((date.getHours() + 11) % 12) + 1)
    : date.getHours().toString().padStart(2, "0");
  let time = `${hourStr}:${minutes}`;
  if (opts.showSeconds)
    time += `:${date.getSeconds().toString().padStart(2, "0")}`;
  return time;
}

/** File name without its extension ("welcome.md" → "welcome"). */
export function nameStem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Elapsed/duration for Player's scrub bar ("3:07", "1:02:03"). `NaN`/negative
 * inputs (a media element mid-load reports `NaN` duration) render as "0:00"
 * rather than "NaN:NaN" — a media element's transient states, not a real
 * duration to format.
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
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
