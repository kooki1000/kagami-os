import type { FsNode } from "./types";
import { beforeEach, describe, expect, it } from "vitest";
import { sweepUnreferencedBlobs } from "./blobGc";
import { hashBlob } from "./blobHash";
import { blobStore } from "./blobStore";
import { indexNodes, useFsStore } from "./fsStore";
import { ROOT_ID, TRASH_ID } from "./types";

// Regression suite for the `content` / `contentRef` invariant documented on
// `FsNode`: "A node has at most one of `content` / `contentRef`", and for the
// blob GC's interaction with in-flight blob writes.

const api = () => useFsStore.getState();

function base(): FsNode[] {
  return [
    { id: ROOT_ID, parentId: null, name: "Kagami", type: "folder", createdAt: 0, modifiedAt: 0 },
    { id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder", createdAt: 0, modifiedAt: 0 },
  ];
}

beforeEach(async () => {
  useFsStore.setState({ nodes: indexNodes(base()), ready: true });
  await blobStore.delete(await blobStore.listHashes());
});

describe("updateFileContent on a blob-backed file", () => {
  it("clears contentRef so the new inline text is what readers resolve", async () => {
    // A large text upload lands in the blob store, not inline.
    const node = await api().createBlobFile(
      ROOT_ID,
      "notes.txt",
      new Blob(["original from upload"], { type: "text/plain" }),
    );
    expect(node.contentRef).toBeDefined();

    // Notes edits it and autosaves.
    api().updateFileContent(node.id, "edited in Notes");

    const updated = api().nodes[node.id];
    expect(updated.content).toBe("edited in Notes");
    // Without this, resolveFileBytes()/useBlobUrl() still prefer contentRef
    // and hand back the pre-edit bytes — the edit is silently invisible to
    // download, the Viewer, and `cat`.
    expect(updated.contentRef).toBeUndefined();
  });

  it("releases the orphaned blob once nothing references it", async () => {
    const node = await api().createBlobFile(
      ROOT_ID,
      "notes.txt",
      new Blob(["original from upload"], { type: "text/plain" }),
    );
    const { hash } = node.contentRef!;

    api().updateFileContent(node.id, "edited in Notes");
    await Promise.resolve();

    expect(await blobStore.has(hash)).toBe(false);
  });
});

describe("blob GC vs. an in-flight blob write", () => {
  it("does not collect a blob whose node commit hasn't landed yet", async () => {
    // `createBlobFile` writes blob-before-node, so between the two there is a
    // window in which bytes are stored that nothing references — a sweep
    // landing there can't tell an in-flight upload from a true orphan.
    // What keeps this safe today is ordering, not a lock: the node `commit`
    // is synchronous off the blob write's microtask, while a sweep needs two
    // full IndexedDB transactions to get to its delete. That's load-bearing
    // and easy to break by making the commit path async, so it's pinned here.
    const pending = api().createBlobFile(
      ROOT_ID,
      "photo.png",
      new Blob(["fresh upload bytes"], { type: "image/png" }),
    );

    const hash = await hashBlob(new Blob(["fresh upload bytes"], { type: "image/png" }));
    while (!(await blobStore.has(hash)))
      await Promise.resolve();

    // A concurrent deletion elsewhere sweeps while the upload is mid-flight.
    await sweepUnreferencedBlobs(api().nodes, blobStore);

    const node = await pending;

    // A committed node whose bytes the sweep collected is a dangling
    // reference — the file is in the tree but can never be read again.
    expect(node.contentRef!.hash).toBe(hash);
    expect(await blobStore.has(hash)).toBe(true);
  });
});

describe("touchFile", () => {
  it("bumps modifiedAt without disturbing a blob-backed file's bytes", async () => {
    const node = await api().createBlobFile(
      ROOT_ID,
      "archive.log",
      new Blob(["a big log file"], { type: "text/plain" }),
    );
    const { hash } = node.contentRef!;

    api().touchFile(node.id);
    await Promise.resolve();

    const touched = api().nodes[node.id];
    expect(touched.contentRef?.hash).toBe(hash);
    expect(touched.modifiedAt).toBeGreaterThanOrEqual(node.modifiedAt);
    expect(await blobStore.has(hash)).toBe(true);
  });
});
