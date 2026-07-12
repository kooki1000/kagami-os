import type { UploadEntry } from "./upload";
import { describe, expect, it } from "vitest";
import { uniqueFolderPaths } from "./upload";

function entry(path: string[]): UploadEntry {
  // The file itself is irrelevant to path planning; a stub satisfies the type.
  return { path, file: new File(["x"], path.at(-1) ?? "f") };
}

describe("uniqueFolderPaths", () => {
  it("returns no folders for flat (top-level) entries", () => {
    expect(uniqueFolderPaths([entry([]), entry([])])).toEqual([]);
  });

  it("collects a single-level folder once per distinct name", () => {
    const paths = uniqueFolderPaths([
      entry(["Vacation"]),
      entry(["Vacation"]),
      entry(["Work"]),
    ]);
    expect(paths).toEqual([["Vacation"], ["Work"]]);
  });

  it("orders nested paths parent-before-child", () => {
    const paths = uniqueFolderPaths([entry(["Trip", "2026", "Beach"])]);
    expect(paths).toEqual([["Trip"], ["Trip", "2026"], ["Trip", "2026", "Beach"]]);
  });

  it("dedupes a shared ancestor across multiple entries, still parent-first", () => {
    const paths = uniqueFolderPaths([
      entry(["Trip", "Beach"]),
      entry(["Trip", "Mountains"]),
    ]);
    expect(paths).toEqual([["Trip"], ["Trip", "Beach"], ["Trip", "Mountains"]]);
  });

  it("mixes flat and nested entries without duplicating", () => {
    const paths = uniqueFolderPaths([
      entry([]),
      entry(["A"]),
      entry(["A", "B"]),
      entry(["A"]),
    ]);
    expect(paths).toEqual([["A"], ["A", "B"]]);
  });
});
