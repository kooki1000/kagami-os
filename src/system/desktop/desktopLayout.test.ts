import { describe, expect, it } from "vitest";
import { autoPosition, cellSizeFor, clampIconPosition, DESKTOP_CELL_H, DESKTOP_CELL_W, DESKTOP_MARGIN_TOP, DESKTOP_MARGIN_X, snapToGridPoint } from "./desktopLayout";

describe("autoPosition (B7)", () => {
  it("places the first few icons down the first column before wrapping", () => {
    const viewportHeight = DESKTOP_MARGIN_TOP + DESKTOP_CELL_H * 3 + 24; // room for exactly 3 rows
    expect(autoPosition(0, viewportHeight)).toEqual({ x: DESKTOP_MARGIN_X, y: DESKTOP_MARGIN_TOP });
    expect(autoPosition(1, viewportHeight)).toEqual({ x: DESKTOP_MARGIN_X, y: DESKTOP_MARGIN_TOP + DESKTOP_CELL_H });
    expect(autoPosition(2, viewportHeight)).toEqual({ x: DESKTOP_MARGIN_X, y: DESKTOP_MARGIN_TOP + DESKTOP_CELL_H * 2 });
    // Index 3 overflows the 3-row column and wraps to column 2.
    expect(autoPosition(3, viewportHeight)).toEqual({ x: DESKTOP_MARGIN_X + DESKTOP_CELL_W, y: DESKTOP_MARGIN_TOP });
  });

  it("never divides by zero on a viewport too short for even one row", () => {
    expect(() => autoPosition(0, 10)).not.toThrow();
    expect(autoPosition(0, 10)).toEqual({ x: DESKTOP_MARGIN_X, y: DESKTOP_MARGIN_TOP });
  });

  it("is deterministic: the same index always yields the same slot for a given viewport", () => {
    const a = autoPosition(5, 900);
    const b = autoPosition(5, 900);
    expect(a).toEqual(b);
  });
});

describe("clampIconPosition (B7)", () => {
  const viewport = { width: 1000, height: 800 };

  it("leaves a position that's already fully on screen alone", () => {
    expect(clampIconPosition({ x: 300, y: 400 }, viewport)).toEqual({ x: 300, y: 400 });
  });

  it("pulls an icon dragged past the right/bottom edges back into view", () => {
    const clamped = clampIconPosition({ x: 5000, y: 5000 }, viewport);
    expect(clamped.x).toBe(1000 - DESKTOP_CELL_W - DESKTOP_MARGIN_X);
    expect(clamped.y).toBe(800 - DESKTOP_CELL_H);
  });

  it("keeps an icon below the menu bar and inside the left margin", () => {
    expect(clampIconPosition({ x: -500, y: -500 }, viewport)).toEqual({
      x: DESKTOP_MARGIN_X,
      y: DESKTOP_MARGIN_TOP,
    });
  });

  it("re-clamps a stored position when the viewport shrinks below it", () => {
    // Dragged to the corner of a large display, reopened on a small one.
    const stored = clampIconPosition({ x: 900, y: 700 }, viewport);
    const onSmaller = clampIconPosition(stored, { width: 500, height: 400 });
    expect(onSmaller.x).toBeLessThanOrEqual(500 - DESKTOP_CELL_W);
    expect(onSmaller.y).toBeLessThanOrEqual(400 - DESKTOP_CELL_H);
  });

  it("never inverts its range on a viewport smaller than one cell", () => {
    expect(clampIconPosition({ x: 50, y: 50 }, { width: 10, height: 10 })).toEqual({
      x: DESKTOP_MARGIN_X,
      y: DESKTOP_MARGIN_TOP,
    });
  });

  it("accepts a non-default cell size (U8's icon size presets)", () => {
    const small = cellSizeFor("small");
    const clamped = clampIconPosition({ x: 5000, y: 5000 }, viewport, small);
    expect(clamped.x).toBe(1000 - small.w - DESKTOP_MARGIN_X);
    expect(clamped.y).toBe(800 - small.h);
  });
});

describe("cellSizeFor (U8)", () => {
  it("returns the pre-U8 fixed constants for 'medium', unchanged", () => {
    expect(cellSizeFor("medium")).toEqual({ w: DESKTOP_CELL_W, h: DESKTOP_CELL_H });
  });

  it("small is smaller and large is bigger than medium", () => {
    const small = cellSizeFor("small");
    const large = cellSizeFor("large");
    expect(small.w).toBeLessThan(DESKTOP_CELL_W);
    expect(small.h).toBeLessThan(DESKTOP_CELL_H);
    expect(large.w).toBeGreaterThan(DESKTOP_CELL_W);
    expect(large.h).toBeGreaterThan(DESKTOP_CELL_H);
  });
});

describe("snapToGridPoint (U8)", () => {
  it("snaps to the exact grid origin for a point already on it", () => {
    const cell = cellSizeFor("medium");
    const origin = { x: DESKTOP_MARGIN_X + cell.w * 2, y: DESKTOP_MARGIN_TOP + cell.h * 3 };
    expect(snapToGridPoint(origin, cell)).toEqual(origin);
  });

  it("rounds a freely-dragged point to the nearest cell", () => {
    const cell = cellSizeFor("medium");
    const near = { x: DESKTOP_MARGIN_X + cell.w * 2 + 5, y: DESKTOP_MARGIN_TOP + cell.h * 1 - 3 };
    expect(snapToGridPoint(near, cell)).toEqual({
      x: DESKTOP_MARGIN_X + cell.w * 2,
      y: DESKTOP_MARGIN_TOP + cell.h * 1,
    });
  });

  it("never snaps to a negative column/row", () => {
    expect(snapToGridPoint({ x: -500, y: -500 })).toEqual({
      x: DESKTOP_MARGIN_X,
      y: DESKTOP_MARGIN_TOP,
    });
  });
});
