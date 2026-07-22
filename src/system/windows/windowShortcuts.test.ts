import { describe, expect, it } from "vitest";
import { isHideChord } from "./windowShortcuts";

/** Minimal fake — only the fields the predicates read. */
function key(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    code: "",
    ...overrides,
  } as KeyboardEvent;
}

describe("isHideChord", () => {
  it("matches Ctrl+Alt+H by physical key code", () => {
    expect(isHideChord(key({ ctrlKey: true, altKey: true, code: "KeyH" }))).toBe(true);
  });

  it("rejects e.key-based composed characters — code is what matters", () => {
    // On macOS, Option+H produces a composed e.key ("Ó" or similar); the
    // predicate must not depend on it.
    expect(isHideChord(key({ ctrlKey: true, altKey: true, code: "KeyH", key: "Ó" } as Partial<KeyboardEvent>))).toBe(true);
  });

  it("rejects without Ctrl", () => {
    expect(isHideChord(key({ altKey: true, code: "KeyH" }))).toBe(false);
  });

  it("rejects without Alt", () => {
    expect(isHideChord(key({ ctrlKey: true, code: "KeyH" }))).toBe(false);
  });

  it("rejects a different key", () => {
    expect(isHideChord(key({ ctrlKey: true, altKey: true, code: "KeyJ" }))).toBe(false);
  });

  it("rejects when Meta or Shift is also held", () => {
    expect(isHideChord(key({ ctrlKey: true, altKey: true, code: "KeyH", metaKey: true }))).toBe(false);
    expect(isHideChord(key({ ctrlKey: true, altKey: true, code: "KeyH", shiftKey: true }))).toBe(false);
  });
});
