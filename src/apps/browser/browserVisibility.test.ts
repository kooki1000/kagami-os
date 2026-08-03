import type { OccludingWindow, Rect } from "./browserVisibility";
import { describe, expect, it } from "vitest";
import { isContentOccluded } from "./browserVisibility";

const content: Rect = { x: 100, y: 100, width: 400, height: 300 };

function win(overrides: Partial<OccludingWindow> & { id: string }): OccludingWindow {
  return {
    rect: { x: 0, y: 0, width: 200, height: 200 },
    zIndex: 1,
    minimized: false,
    ...overrides,
  };
}

/** The Browser window itself, sitting under `content`. */
const self = win({ id: "browser", rect: { x: 100, y: 60, width: 400, height: 340 }, zIndex: 5 });

describe("isContentOccluded", () => {
  it("is clear when it is the only window", () => {
    expect(isContentOccluded(content, [self], "browser")).toBe(false);
  });

  it("is clear when another window is beside it, not over it", () => {
    const beside = win({ id: "other", rect: { x: 600, y: 100, width: 300, height: 300 }, zIndex: 9 });
    expect(isContentOccluded(content, [self, beside], "browser")).toBe(false);
  });

  it("is occluded when a higher window overlaps the content region", () => {
    const over = win({ id: "other", rect: { x: 300, y: 200, width: 300, height: 300 }, zIndex: 9 });
    expect(isContentOccluded(content, [self, over], "browser")).toBe(true);
  });

  it("is clear when the overlapping window stacks below it — this is the unfocused case that used to blank", () => {
    const under = win({ id: "other", rect: { x: 300, y: 200, width: 300, height: 300 }, zIndex: 2 });
    expect(isContentOccluded(content, [self, under], "browser")).toBe(false);
  });

  it("ignores a minimized window, which paints nothing", () => {
    const hidden = win({
      id: "other",
      rect: { x: 300, y: 200, width: 300, height: 300 },
      zIndex: 9,
      minimized: true,
    });
    expect(isContentOccluded(content, [self, hidden], "browser")).toBe(false);
  });

  it("is occluded by a single-pixel overlap — partial cover isn't representable", () => {
    const nudged = win({
      id: "other",
      rect: { x: 499, y: 399, width: 300, height: 300 },
      zIndex: 9,
    });
    expect(isContentOccluded(content, [self, nudged], "browser")).toBe(true);
  });

  it("is clear when a higher window only touches the content edge", () => {
    const touching = win({ id: "other", rect: { x: 500, y: 100, width: 300, height: 300 }, zIndex: 9 });
    expect(isContentOccluded(content, [self, touching], "browser")).toBe(false);
  });

  it("ignores a higher window overlapping the chrome above the content region", () => {
    // `content` starts at y=100; this sits entirely in the window's title/address bar.
    const overChrome = win({ id: "other", rect: { x: 100, y: 60, width: 300, height: 40 }, zIndex: 9 });
    expect(isContentOccluded(content, [self, overChrome], "browser")).toBe(false);
  });

  it("is occluded when any one of several higher windows overlaps", () => {
    const clear = win({ id: "a", rect: { x: 600, y: 0, width: 200, height: 200 }, zIndex: 7 });
    const over = win({ id: "b", rect: { x: 150, y: 150, width: 100, height: 100 }, zIndex: 8 });
    expect(isContentOccluded(content, [self, clear, over], "browser")).toBe(true);
  });

  it("treats a window it can't find as occluded rather than showing over the shell", () => {
    expect(isContentOccluded(content, [], "browser")).toBe(true);
  });
});
