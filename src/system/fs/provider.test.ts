import { beforeEach, describe, expect, it } from "vitest";
import { __resetFsStoreForTest, childrenOf, useFsStore } from "./fsStore";
import { fileSystem } from "./provider";
import { BLOB_INLINE_THRESHOLD, DOCUMENTS_ID, TRASH_ID } from "./types";

// The async, non-reactive seam from CLAUDE.md. No in-tree consumers yet, which
// is why it needs pinning. Each call awaits `init()`, which without indexedDB
// boots from `createSeedNodes()` — so these run against the real seed tree.

beforeEach(() => {
  __resetFsStoreForTest();
});

/** Names of the files directly inside a folder. */
function fileNames(parentId: string): string[] {
  return childrenOf(useFsStore.getState().nodes, parentId)
    .filter(n => n.type === "file")
    .map(n => n.name);
}

describe("writeFile", () => {
  it("overwrites a same-named file instead of forking a numbered copy", async () => {
    const first = await fileSystem.writeFile(DOCUMENTS_ID, "note.txt", "v1", "text/plain");
    const second = await fileSystem.writeFile(DOCUMENTS_ID, "note.txt", "v2", "text/plain");

    expect(second.id).toBe(first.id);
    expect(second.content).toBe("v2");
    // One note.txt, not note.txt + "note 2.txt".
    expect(fileNames(DOCUMENTS_ID).filter(n => n.startsWith("note"))).toEqual(["note.txt"]);
  });

  it("still creates a new file when none of that name exists", async () => {
    const created = await fileSystem.writeFile(DOCUMENTS_ID, "fresh.txt", "hi", "text/plain");
    expect(created.name).toBe("fresh.txt");
    expect(created.content).toBe("hi");
  });

  // review-backlog #11: content over BLOB_INLINE_THRESHOLD used to land in
  // `node.content` regardless of size, on both the create and overwrite path.
  it("routes an oversized create through the blob store instead of inlining it", async () => {
    const big = "x".repeat(BLOB_INLINE_THRESHOLD + 1);
    const created = await fileSystem.writeFile(DOCUMENTS_ID, "big.txt", big, "text/plain");
    expect(created.content).toBeUndefined();
    expect(created.contentRef).toMatchObject({ size: big.length, mimeType: "text/plain" });
  });

  it("migrates an existing small file to the blob store when an overwrite crosses the threshold", async () => {
    const first = await fileSystem.writeFile(DOCUMENTS_ID, "grows.txt", "small", "text/plain");
    expect(first.content).toBe("small");

    const big = "y".repeat(BLOB_INLINE_THRESHOLD + 1);
    const second = await fileSystem.writeFile(DOCUMENTS_ID, "grows.txt", big, "text/plain");
    expect(second.id).toBe(first.id);
    expect(second.content).toBeUndefined();
    expect(second.contentRef?.size).toBe(big.length);
  });

  it("migrates a blob-backed file back to inline content when an overwrite shrinks below the threshold", async () => {
    const big = "z".repeat(BLOB_INLINE_THRESHOLD + 1);
    const first = await fileSystem.writeFile(DOCUMENTS_ID, "shrinks.txt", big, "text/plain");
    expect(first.contentRef).toBeDefined();

    const second = await fileSystem.writeFile(DOCUMENTS_ID, "shrinks.txt", "small again", "text/plain");
    expect(second.id).toBe(first.id);
    expect(second.contentRef).toBeUndefined();
    expect(second.content).toBe("small again");
  });
});

describe("delete", () => {
  it("trashes a live node", async () => {
    const file = await fileSystem.writeFile(DOCUMENTS_ID, "a.txt", "x", "text/plain");
    await fileSystem.delete(file.id);

    expect(useFsStore.getState().nodes[file.id].parentId).toBe(TRASH_ID);
  });

  it("permanently deletes a node nested inside a trashed folder", async () => {
    // The child is in the Trash subtree without being a direct child of it.
    const folder = await fileSystem.mkdir(DOCUMENTS_ID, "Proj");
    const child = await fileSystem.writeFile(folder.id, "a.md", "x", "text/markdown");
    await fileSystem.delete(folder.id);

    await fileSystem.delete(child.id);

    // Gone, not relocated to the Trash root with a rewritten `trashedFrom`.
    expect(useFsStore.getState().nodes[child.id]).toBeUndefined();
  });

  it("permanently deletes a direct child of the Trash", async () => {
    const file = await fileSystem.writeFile(DOCUMENTS_ID, "b.txt", "x", "text/plain");
    await fileSystem.delete(file.id);
    await fileSystem.delete(file.id);

    expect(useFsStore.getState().nodes[file.id]).toBeUndefined();
  });
});
