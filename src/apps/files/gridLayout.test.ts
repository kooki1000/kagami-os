import { describe, expect, it } from "vitest";
import { chunkIntoRows, gridColumnCount } from "./gridLayout";

describe("gridColumnCount", () => {
  it("matches CSS auto-fill's track count for an exact-fit width", () => {
    // 3 tiles of 120px + 2 gaps of 12px = 384px exactly.
    expect(gridColumnCount(384, 120, 12)).toBe(3);
  });

  it("floors when the container is a few px short of fitting another track", () => {
    expect(gridColumnCount(383, 120, 12)).toBe(2);
  });

  it("never returns fewer than 1 column, even for a container narrower than one tile", () => {
    expect(gridColumnCount(50, 120, 12)).toBe(1);
    expect(gridColumnCount(0, 120, 12)).toBe(1);
    expect(gridColumnCount(-10, 120, 12)).toBe(1);
  });

  it("grows with a wider container", () => {
    expect(gridColumnCount(800, 120, 12)).toBeGreaterThan(gridColumnCount(400, 120, 12));
  });
});

describe("chunkIntoRows", () => {
  it("splits items into fixed-size rows", () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns one item per row when columns is 1", () => {
    expect(chunkIntoRows([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it("returns an empty array for an empty item list", () => {
    expect(chunkIntoRows([], 4)).toEqual([]);
  });

  it("puts everything in one row when columns exceeds the item count", () => {
    expect(chunkIntoRows([1, 2], 10)).toEqual([[1, 2]]);
  });
});
