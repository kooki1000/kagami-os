import { describe, expect, it } from "vitest";
import { formatShortcut, matchesMacPlatform } from "./format";

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
