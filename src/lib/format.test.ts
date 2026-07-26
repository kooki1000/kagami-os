import { describe, expect, it } from "vitest";
import { formatClockTime, formatShortcut, matchesMacPlatform } from "./format";

describe("formatClockTime (U7)", () => {
  const morning = new Date(2026, 0, 1, 3, 5, 9); // 3:05:09 AM
  const afternoon = new Date(2026, 0, 1, 15, 45, 0); // 3:45:00 PM
  const midnight = new Date(2026, 0, 1, 0, 30, 0); // 12:30:00 AM

  it("matches the original hardcoded 12-hour, no-seconds output by default", () => {
    expect(formatClockTime(afternoon, { hour12: true, showSeconds: false })).toBe("3:45");
    expect(formatClockTime(morning, { hour12: true, showSeconds: false })).toBe("3:05");
  });

  it("wraps hour 0 to 12 in 12-hour mode (no AM/PM marker, matching the pre-U7 behavior)", () => {
    expect(formatClockTime(midnight, { hour12: true, showSeconds: false })).toBe("12:30");
  });

  it("zero-pads a 24-hour hour", () => {
    expect(formatClockTime(morning, { hour12: false, showSeconds: false })).toBe("03:05");
    expect(formatClockTime(afternoon, { hour12: false, showSeconds: false })).toBe("15:45");
  });

  it("appends zero-padded seconds when requested", () => {
    expect(formatClockTime(morning, { hour12: true, showSeconds: true })).toBe("3:05:09");
    expect(formatClockTime(afternoon, { hour12: false, showSeconds: true })).toBe("15:45:00");
  });
});

describe("formatShortcut", () => {
  it("passes shortcuts through unchanged on Mac", () => {
    expect(formatShortcut("⌘W", true)).toBe("⌘W");
    expect(formatShortcut("⇧⌘N", true)).toBe("⇧⌘N");
  });

  it("converts a plain ⌘ chord to Ctrl+ on non-Mac", () => {
    expect(formatShortcut("⌘W", false)).toBe("Ctrl+W");
  });

  it("converts a shifted chord to Ctrl+Shift+, Ctrl first, on non-Mac", () => {
    expect(formatShortcut("⇧⌘N", false)).toBe("Ctrl+Shift+N");
  });

  it("handles a multi-character key like ⌘K's own hint", () => {
    expect(formatShortcut("⌘K", false)).toBe("Ctrl+K");
  });
});

describe("matchesMacPlatform", () => {
  it("matches a Mac-flavored platform string", () => {
    expect(matchesMacPlatform("MacIntel")).toBe(true);
    expect(matchesMacPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(true);
  });

  it("doesn't match a non-Mac platform string", () => {
    expect(matchesMacPlatform("Linux x86_64")).toBe(false);
    expect(matchesMacPlatform("Win32")).toBe(false);
  });

  it("defaults to true when no platform string is available", () => {
    expect(matchesMacPlatform(undefined)).toBe(true);
  });
});
