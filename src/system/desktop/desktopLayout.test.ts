import { describe, expect, it } from "vitest";
import { autoPosition, DESKTOP_CELL_H, DESKTOP_CELL_W, DESKTOP_MARGIN_TOP, DESKTOP_MARGIN_X } from "./desktopLayout";

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
