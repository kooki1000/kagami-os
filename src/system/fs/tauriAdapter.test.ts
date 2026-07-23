import type { FsNode } from "./types";
import { describe, expect, it } from "vitest";
import { mergeNodes, removeNodes } from "./tauriAdapter";

function node(id: string, overrides: Partial<FsNode> = {}): FsNode {
  return {
    id,
    parentId: "home",
    name: id,
    type: "file",
    createdAt: 0,
    modifiedAt: 0,
    ...overrides,
  };
}

// These are the pure read-modify-write helpers behind `createTauriAdapter`'s
// whole-file JSON persistence — the IPC-calling shell itself is exercised
// manually via `pnpm tauri dev` (see the file's own comment for why).
describe("mergeNodes", () => {
  it("appends nodes not already present", () => {
    const result = mergeNodes([node("a")], [node("b")]);
    expect(result.map(n => n.id).sort()).toEqual(["a", "b"]);
  });

  it("overwrites an existing node by id rather than duplicating it", () => {
    const result = mergeNodes([node("a", { name: "old" })], [node("a", { name: "new" })]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("new");
  });

  it("is a no-op merge of nothing new against an empty base", () => {
    expect(mergeNodes([], [])).toEqual([]);
  });
});

describe("removeNodes", () => {
  it("drops only the given ids", () => {
    const result = removeNodes([node("a"), node("b"), node("c")], ["b"]);
    expect(result.map(n => n.id).sort()).toEqual(["a", "c"]);
  });

  it("is a no-op for ids that aren't present", () => {
    const existing = [node("a")];
    expect(removeNodes(existing, ["missing"])).toEqual(existing);
  });

  it("removing everything leaves an empty list", () => {
    expect(removeNodes([node("a"), node("b")], ["a", "b"])).toEqual([]);
  });
});
