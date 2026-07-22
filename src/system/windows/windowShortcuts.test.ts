import { describe, expect, it } from "vitest";
import {
  arrowSnapDirection,
  isAppCycleChord,
  isHideChord,
  isSwitcherChord,
  isSwitcherModifierRelease,
  isSwitcherReverse,
} from "./windowShortcuts";

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

describe("arrowSnapDirection", () => {
  it.each([
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
  ] as const)("maps Ctrl+Alt+%s to %s", (code, direction) => {
    expect(arrowSnapDirection(key({ ctrlKey: true, altKey: true, code }))).toBe(direction);
  });

  it("rejects without Ctrl or Alt", () => {
    expect(arrowSnapDirection(key({ altKey: true, code: "ArrowLeft" }))).toBeNull();
    expect(arrowSnapDirection(key({ ctrlKey: true, code: "ArrowLeft" }))).toBeNull();
  });

  it("rejects a non-arrow key", () => {
    expect(arrowSnapDirection(key({ ctrlKey: true, altKey: true, code: "KeyH" }))).toBeNull();
  });

  it("rejects when Meta or Shift is also held", () => {
    expect(arrowSnapDirection(key({ ctrlKey: true, altKey: true, code: "ArrowLeft", metaKey: true }))).toBeNull();
    expect(arrowSnapDirection(key({ ctrlKey: true, altKey: true, code: "ArrowLeft", shiftKey: true }))).toBeNull();
  });
});

describe("isSwitcherChord", () => {
  it("matches ⌥Tab on macOS but not ⌃⌥Tab's plain-Alt-Tab counterpart on other platforms", () => {
    expect(isSwitcherChord(key({ altKey: true, code: "Tab" }), true)).toBe(true);
    expect(isSwitcherChord(key({ altKey: true, code: "Tab" }), false)).toBe(false);
  });

  it("matches ⌃⌥Tab on non-mac platforms but not on macOS", () => {
    expect(isSwitcherChord(key({ ctrlKey: true, altKey: true, code: "Tab" }), false)).toBe(true);
    expect(isSwitcherChord(key({ ctrlKey: true, altKey: true, code: "Tab" }), true)).toBe(false);
  });

  it("still matches with Shift held (reverse direction, not a different chord)", () => {
    expect(isSwitcherChord(key({ altKey: true, shiftKey: true, code: "Tab" }), true)).toBe(true);
  });

  it("rejects a non-Tab key or Meta held", () => {
    expect(isSwitcherChord(key({ altKey: true, code: "KeyH" }), true)).toBe(false);
    expect(isSwitcherChord(key({ altKey: true, metaKey: true, code: "Tab" }), true)).toBe(false);
  });
});

describe("isSwitcherReverse", () => {
  it("reflects whether Shift is held", () => {
    expect(isSwitcherReverse(key({ shiftKey: true }))).toBe(true);
    expect(isSwitcherReverse(key({}))).toBe(false);
  });
});

describe("isSwitcherModifierRelease", () => {
  it("commits on releasing Alt on macOS", () => {
    expect(isSwitcherModifierRelease(key({ key: "Alt" } as Partial<KeyboardEvent>), true)).toBe(true);
  });

  it("commits on releasing either Control or Alt on non-mac platforms", () => {
    expect(isSwitcherModifierRelease(key({ key: "Control" } as Partial<KeyboardEvent>), false)).toBe(true);
    expect(isSwitcherModifierRelease(key({ key: "Alt" } as Partial<KeyboardEvent>), false)).toBe(true);
  });

  it("ignores an unrelated key release", () => {
    expect(isSwitcherModifierRelease(key({ key: "Tab" } as Partial<KeyboardEvent>), true)).toBe(false);
  });
});

describe("isAppCycleChord", () => {
  it("matches Ctrl+Backquote on every platform", () => {
    expect(isAppCycleChord(key({ ctrlKey: true, code: "Backquote" }))).toBe(true);
  });

  it("rejects with Alt, Meta, or Shift also held", () => {
    expect(isAppCycleChord(key({ ctrlKey: true, altKey: true, code: "Backquote" }))).toBe(false);
    expect(isAppCycleChord(key({ ctrlKey: true, metaKey: true, code: "Backquote" }))).toBe(false);
    expect(isAppCycleChord(key({ ctrlKey: true, shiftKey: true, code: "Backquote" }))).toBe(false);
  });

  it("rejects a different key", () => {
    expect(isAppCycleChord(key({ ctrlKey: true, code: "KeyH" }))).toBe(false);
  });
});
