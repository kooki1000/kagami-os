import type { NodeMap } from "./fsStore";
import type { FsNode } from "./types";
import { bench, describe } from "vitest";
import { childrenOf, indexNodes, pathOf, uniqueChildName } from "./fsStore";

// Perf baseline (P9.9 / T7): the store's read helpers scan every node in the
// map on each call, so their cost tracks total drive size, not folder size.
// This models the T7 concern at 1k and 10k nodes to size Phase 10's index +
// virtualization work. Run with `pnpm bench`.

const FOLDER = "bench-folder";

function makeDrive(count: number): { nodes: NodeMap; deepId: string } {
  const list: FsNode[] = [
    { id: FOLDER, parentId: null, name: "Bench", type: "folder", createdAt: 0, modifiedAt: 0 },
  ];
  for (let i = 0; i < count; i++) {
    const isFolder = i % 10 === 0;
    list.push({
      id: `n${i}`,
      parentId: FOLDER,
      name: `item-${String(i).padStart(6, "0")}.txt`,
      type: isFolder ? "folder" : "file",
      mimeType: isFolder ? undefined : i % 3 === 0 ? "text/markdown" : "image/png",
      createdAt: i,
      // Reverse of the index so date order differs from name order.
      modifiedAt: count - i,
    });
  }
  // A deep chain to exercise pathOf's parent walk.
  let parent = FOLDER;
  let deepId = FOLDER;
  for (let d = 0; d < 20; d++) {
    const id = `deep-${d}`;
    list.push({ id, parentId: parent, name: `d${d}`, type: "folder", createdAt: 0, modifiedAt: 0 });
    parent = id;
    deepId = id;
  }
  return { nodes: indexNodes(list), deepId };
}

const small = makeDrive(1_000);
const large = makeDrive(10_000);

describe("childrenOf (one folder's children)", () => {
  bench("1k nodes · name sort", () => {
    childrenOf(small.nodes, FOLDER);
  });
  bench("10k nodes · name sort", () => {
    childrenOf(large.nodes, FOLDER);
  });
  bench("10k nodes · date sort", () => {
    childrenOf(large.nodes, FOLDER, { key: "date", dir: "desc" });
  });
  bench("10k nodes · kind sort", () => {
    childrenOf(large.nodes, FOLDER, { key: "kind", dir: "asc" });
  });
});

describe("uniqueChildName (10k siblings)", () => {
  bench("collision", () => {
    uniqueChildName(large.nodes, FOLDER, "item-000000.txt");
  });
  bench("no collision", () => {
    uniqueChildName(large.nodes, FOLDER, "a-brand-new-name.txt");
  });
});

describe("pathOf (depth 20)", () => {
  bench("10k-node drive", () => {
    pathOf(large.nodes, large.deepId);
  });
});

describe("files per-render data prep (10k folder)", () => {
  // What a single FilesApp render recomputes: the folder listing, the Trash
  // count (another full scan), and the name filter over the result.
  bench("childrenOf + trash count + filter", () => {
    const kids = childrenOf(large.nodes, FOLDER);
    childrenOf(large.nodes, "trash");
    kids.filter(n => n.name.toLowerCase().includes("item-0001"));
  });
});
