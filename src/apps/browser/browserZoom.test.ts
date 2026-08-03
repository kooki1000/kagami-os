import { describe, expect, it } from "vitest";
import { canZoomIn, canZoomOut, clampZoom, DEFAULT_ZOOM, formatZoom, stepZoom, ZOOM_LEVELS } from "./browserZoom";

describe("stepZoom", () => {
  it("steps up and down one rung from the default", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
  });

  it("stops at the ends of the ladder instead of running past them", () => {
    const min = ZOOM_LEVELS[0];
    const max = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    expect(stepZoom(min, -1)).toBe(min);
    expect(stepZoom(max, 1)).toBe(max);
  });

  it("snaps an off-ladder level onto the nearest rung before stepping", () => {
    // 1.13 sits between 1.1 and 1.25 but nearer 1.1, so stepping up gives 1.25.
    expect(stepZoom(1.13, 1)).toBe(1.25);
    expect(stepZoom(1.13, -1)).toBe(1);
  });

  it("returns to exactly 1 rather than an accumulated near-miss", () => {
    let level = DEFAULT_ZOOM;
    level = stepZoom(level, 1);
    level = stepZoom(level, 1);
    level = stepZoom(level, -1);
    level = stepZoom(level, -1);
    expect(level).toBe(1);
  });
});

describe("canZoomIn / canZoomOut", () => {
  it("reports both directions available at the default", () => {
    expect(canZoomIn(1)).toBe(true);
    expect(canZoomOut(1)).toBe(true);
  });

  it("reports the exhausted direction at each end", () => {
    expect(canZoomIn(ZOOM_LEVELS[ZOOM_LEVELS.length - 1])).toBe(false);
    expect(canZoomOut(ZOOM_LEVELS[0])).toBe(false);
  });
});

describe("clampZoom", () => {
  it("passes a level on the ladder through", () => {
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it("clamps out-of-range levels", () => {
    expect(clampZoom(99)).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
    expect(clampZoom(0.01)).toBe(ZOOM_LEVELS[0]);
  });

  it("falls back to the default for any non-finite level, infinities included", () => {
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_ZOOM);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(DEFAULT_ZOOM);
    expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_ZOOM);
  });
});

describe("formatZoom", () => {
  it("renders a level as a whole percentage", () => {
    expect(formatZoom(1)).toBe("100%");
    expect(formatZoom(0.67)).toBe("67%");
    expect(formatZoom(2.5)).toBe("250%");
  });
});
