import { describe, expect, it } from "vitest";
import { BASE_SCALE, clampPage, clampScale, fitWidthScale, formatPageInfo, goToPageCommand, MAX_SCALE, MIN_SCALE, parseGoToPageCommand, ZOOM_STEP, zoomPercent } from "./pageNav";

describe("clampPage", () => {
  it("keeps an in-range page as-is", () => {
    expect(clampPage(3, 10)).toBe(3);
  });

  it("clamps below the first page", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-5, 10)).toBe(1);
  });

  it("clamps past the last page", () => {
    expect(clampPage(99, 10)).toBe(10);
  });

  it("a single-page document clamps everything to page 1", () => {
    expect(clampPage(5, 1)).toBe(1);
  });
});

describe("clampScale", () => {
  it("keeps an in-range scale as-is", () => {
    expect(clampScale(2)).toBe(2);
  });

  it("clamps to MIN_SCALE/MAX_SCALE at the bounds", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(100)).toBe(MAX_SCALE);
  });
});

describe("fitWidthScale", () => {
  it("computes the scale that fits the page width into the available width", () => {
    expect(fitWidthScale(200, 400)).toBe(2);
    expect(fitWidthScale(400, 200)).toBe(0.5);
  });

  it("clamps the result, e.g. an unreasonably narrow window doesn't zoom out past MIN_SCALE", () => {
    expect(fitWidthScale(1000, 10)).toBe(MIN_SCALE);
  });
});

describe("formatPageInfo", () => {
  it("renders the page counter and a 100% baseline at BASE_SCALE", () => {
    expect(formatPageInfo(2, 5, 1.5)).toBe("Page 2 of 5 · 100%");
  });

  it("reflects zoom relative to the 100% baseline", () => {
    expect(formatPageInfo(1, 1, 1.5 * ZOOM_STEP)).toBe(`Page 1 of 1 · ${Math.round(ZOOM_STEP * 100)}%`);
  });
});

describe("goToPage command codec", () => {
  it("round-trips a page number", () => {
    expect(parseGoToPageCommand(goToPageCommand(12))).toBe(12);
    expect(parseGoToPageCommand(goToPageCommand(1))).toBe(1);
  });

  it("rejects the app's other commands", () => {
    expect(parseGoToPageCommand("documents.nextPage")).toBeNull();
    expect(parseGoToPageCommand("documents.zoomIn")).toBeNull();
  });

  it("rejects a malformed or non-positive argument", () => {
    expect(parseGoToPageCommand("documents.goToPage:")).toBeNull();
    expect(parseGoToPageCommand("documents.goToPage:abc")).toBeNull();
    expect(parseGoToPageCommand("documents.goToPage:1.5")).toBeNull();
    expect(parseGoToPageCommand("documents.goToPage:0")).toBeNull();
    expect(parseGoToPageCommand("documents.goToPage:-3")).toBeNull();
  });
});

describe("zoomPercent", () => {
  it("treats BASE_SCALE as 100%", () => {
    expect(zoomPercent(BASE_SCALE)).toBe(100);
    expect(zoomPercent(BASE_SCALE * 2)).toBe(200);
    expect(zoomPercent(BASE_SCALE / 2)).toBe(50);
  });
});
