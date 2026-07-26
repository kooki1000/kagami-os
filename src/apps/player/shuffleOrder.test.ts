import type { FsNode } from "@/system/fs/types";
import { describe, expect, it } from "vitest";
import { applyShuffleOrder, buildShuffleOrder, shuffledIds } from "./shuffleOrder";

/** A seeded PRNG (mulberry32) — deterministic, so shuffle tests can assert an exact order. */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function node(id: string, parentId = "folder"): FsNode {
  return { id, parentId, name: id, type: "file", createdAt: 0, modifiedAt: 0 };
}

describe("shuffledIds", () => {
  it("keeps the same length and elements, just reordered", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const order = shuffledIds(ids, seededRng(1));
    expect(order).toHaveLength(ids.length);
    expect([...order].sort()).toEqual([...ids].sort());
  });

  it("is deterministic for a given rng seed", () => {
    const ids = ["a", "b", "c", "d", "e"];
    expect(shuffledIds(ids, seededRng(42))).toEqual(shuffledIds(ids, seededRng(42)));
  });

  it("differs from identity order for a large enough set (given this seed)", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const order = shuffledIds(ids, seededRng(7));
    expect(order).not.toEqual(ids);
  });

  it("doesn't mutate the input array", () => {
    const ids = ["a", "b", "c"];
    shuffledIds(ids, seededRng(1));
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("buildShuffleOrder", () => {
  it("puts the current track first, then shuffles the rest", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const order = buildShuffleOrder(ids, "c", seededRng(3));
    expect(order[0]).toBe("c");
    expect([...order].sort()).toEqual([...ids].sort());
  });

  it("shuffles everything when there's no current track", () => {
    const ids = ["a", "b", "c"];
    const order = buildShuffleOrder(ids, null, seededRng(1));
    expect([...order].sort()).toEqual([...ids].sort());
  });

  it("shuffles everything when the current track isn't in the list", () => {
    const ids = ["a", "b", "c"];
    const order = buildShuffleOrder(ids, "missing", seededRng(1));
    expect([...order].sort()).toEqual([...ids].sort());
  });
});

describe("applyShuffleOrder", () => {
  it("reorders siblings to match a given id order", () => {
    const siblings = [node("a"), node("b"), node("c")];
    const result = applyShuffleOrder(siblings, ["c", "a", "b"]);
    expect(result.map(n => n.id)).toEqual(["c", "a", "b"]);
  });

  it("drops order entries no longer present in siblings", () => {
    const siblings = [node("a"), node("b")];
    const result = applyShuffleOrder(siblings, ["c", "b", "a"]);
    expect(result.map(n => n.id)).toEqual(["b", "a"]);
  });

  it("appends siblings missing from the order, in their original relative order", () => {
    const siblings = [node("a"), node("b"), node("c"), node("d")];
    const result = applyShuffleOrder(siblings, ["c", "a"]);
    expect(result.map(n => n.id)).toEqual(["c", "a", "b", "d"]);
  });
});
