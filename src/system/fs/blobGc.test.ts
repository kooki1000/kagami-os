import type { FsNode } from "./types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sweepUnreferencedBlobs, unreferencedBlobs } from "./blobGc";
import { blobStore } from "./blobStore";
import { indexNodes, useFsStore } from "./fsStore";
import { createMemoryBlobStore } from "./idbBlobStore";
import { ROOT_ID } from "./types";

function file(partial: Partial<FsNode> & Pick<FsNode, "id">): FsNode {
  return {
    parentId: "root",
    name: `${partial.id}.file`,
    type: "file",
    createdAt: 0,
    modifiedAt: 0,
    ...partial,
  };
}

describe("unreferencedBlobs", () => {
  it("keeps a hash referenced by a node", () => {
    const nodes = indexNodes([file({ id: "a", contentRef: { hash: "h1", size: 1 } })]);
    expect(unreferencedBlobs(nodes, ["h1"])).toEqual([]);
  });

  it("returns a stored hash no node references", () => {
    const nodes = indexNodes([file({ id: "a", contentRef: { hash: "h1", size: 1 } })]);
    expect(unreferencedBlobs(nodes, ["h1", "orphan"])).toEqual(["orphan"]);
  });

  it("keeps a shared blob alive as long as any one node still references it", () => {
    const nodes = indexNodes([
      file({ id: "a", contentRef: { hash: "shared", size: 1 } }),
      file({ id: "b", contentRef: { hash: "shared", size: 1 } }),
    ]);
    expect(unreferencedBlobs(nodes, ["shared"])).toEqual([]);
    // Only "a" removed — "b" still points at it, so it must survive.
    const { a: _a, ...rest } = nodes;
    expect(unreferencedBlobs(rest, ["shared"])).toEqual([]);
  });

  it("ignores nodes with inline content (no contentRef)", () => {
    const nodes = indexNodes([file({ id: "a", content: "hi" })]);
    expect(unreferencedBlobs(nodes, ["some-hash"])).toEqual(["some-hash"]);
  });
});

describe("sweepUnreferencedBlobs", () => {
  it("deletes orphans and leaves referenced blobs in place", async () => {
    const store = createMemoryBlobStore();
    await store.put("kept", new Blob(["kept"]));
    await store.put("orphan", new Blob(["orphan"]));
    const nodes = indexNodes([file({ id: "a", contentRef: { hash: "kept", size: 4 } })]);

    const deleted = await sweepUnreferencedBlobs(nodes, store);

    expect(deleted).toEqual(["orphan"]);
    expect(await store.has("kept")).toBe(true);
    expect(await store.has("orphan")).toBe(false);
  });

  it("is a no-op when nothing is orphaned", async () => {
    const store = createMemoryBlobStore();
    await store.put("kept", new Blob(["kept"]));
    const nodes = indexNodes([file({ id: "a", contentRef: { hash: "kept", size: 4 } })]);
    expect(await sweepUnreferencedBlobs(nodes, store)).toEqual([]);
    expect(await store.listHashes()).toEqual(["kept"]);
  });
});

describe("gc wired into the store", () => {
  const api = () => useFsStore.getState();

  beforeEach(async () => {
    useFsStore.setState({
      nodes: indexNodes([
        { id: ROOT_ID, parentId: null, name: "Kagami", type: "folder", createdAt: 0, modifiedAt: 0 },
        { id: "trash", parentId: ROOT_ID, name: "Trash", type: "folder", createdAt: 0, modifiedAt: 0 },
      ]),
      ready: true,
    });
    await blobStore.delete(await blobStore.listHashes());
  });

  it("deleteForever sweeps the blob once its only node is gone", async () => {
    const node = await api().createBlobFile(ROOT_ID, "solo.png", new Blob(["solo"], { type: "image/png" }));
    const hash = node.contentRef!.hash;
    expect(await blobStore.has(hash)).toBe(true);

    api().deleteForever(node.id);

    // removeIds fires the sweep without awaiting it — poll until it lands.
    await vi.waitFor(async () => expect(await blobStore.has(hash)).toBe(false));
  });

  it("keeps a deduped blob alive while any referencing node remains", async () => {
    const a = await api().createBlobFile(ROOT_ID, "a.png", new Blob(["dup"], { type: "image/png" }));
    const b = await api().createBlobFile(ROOT_ID, "b.png", new Blob(["dup"], { type: "image/png" }));
    const hash = a.contentRef!.hash;
    expect(hash).toBe(b.contentRef!.hash);

    api().deleteForever(a.id);
    // Give the fire-and-forget sweep a turn to run (and confirm it does
    // nothing harmful) before checking the still-referenced blob survives.
    await vi.waitFor(() => expect(api().nodes[a.id]).toBeUndefined());
    expect(await blobStore.has(hash)).toBe(true);

    api().deleteForever(b.id);
    await vi.waitFor(async () => expect(await blobStore.has(hash)).toBe(false));
  });
});
