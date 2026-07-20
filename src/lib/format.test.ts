import { describe, expect, it } from "vitest";
import { formatShortcut, isMacPlatform } from "./format";

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

describe("isMacPlatform", () => {
  it("defaults to true when navigator is unavailable, as in this test environment", () => {
    expect(isMacPlatform()).toBe(true);
  });
});
