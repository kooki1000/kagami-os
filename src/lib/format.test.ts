import { describe, expect, it } from "vitest";
import { formatDuration, formatShortcut, matchesMacPlatform } from "./format";

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

describe("formatDuration", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7)).toBe("0:07");
    expect(formatDuration(187)).toBe("3:07");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("treats NaN/negative as 0:00 instead of crashing on a not-yet-loaded duration", () => {
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(-1)).toBe("0:00");
  });

  it("truncates fractional seconds rather than rounding up", () => {
    expect(formatDuration(7.9)).toBe("0:07");
  });
});
