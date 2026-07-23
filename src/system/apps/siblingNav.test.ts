import type { FsNode } from "@/system/fs/types";
import { describe, expect, it } from "vitest";
import { siblingsOf, stepSibling } from "./siblingNav";

function file(id: string, parentId: string, mimeType = "image/png"): FsNode {
  return {
    id,
    parentId,
    name: id,
    type: "file",
    mimeType,
    content: "",
    createdAt: 0,
    modifiedAt: 0,
  } as FsNode;
}

describe("siblingsOf", () => {
  it("returns [] when there is no node", () => {
    expect(siblingsOf({}, undefined, () => true)).toEqual([]);
  });

  it("filters the parent's children", () => {
    const a = file("a", "folder");
    const b = file("b", "folder");
    const c = file("c", "folder", "text/plain");
    const nodes = { a, b, c };
    expect(siblingsOf(nodes, a, n => n.mimeType === "image/png")).toEqual([a, b]);
  });
});

describe("stepSibling", () => {
  const a = file("a", "folder");
  const b = file("b", "folder");
  const c = file("c", "folder");
  const siblings = [a, b, c];

  it("returns null for an empty list", () => {
    expect(stepSibling([], "a", 1)).toBeNull();
  });

  it("wraps forward past the last entry", () => {
    expect(stepSibling(siblings, "c", 1)).toBe("a");
  });

  it("wraps backward past the first entry", () => {
    expect(stepSibling(siblings, "a", -1)).toBe("c");
  });

  it("steps to the next entry in the middle of the list", () => {
    expect(stepSibling(siblings, "a", 1)).toBe("b");
  });

  it("falls back to the first entry when currentId is not found", () => {
    expect(stepSibling(siblings, "missing", 1)).toBe("a");
    expect(stepSibling(siblings, "missing", -1)).toBe("a");
  });

  it("falls back to the first entry when currentId is null", () => {
    expect(stepSibling(siblings, null, 1)).toBe("a");
  });
});
