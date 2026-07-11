import type { FsNode } from "./types";
import { beforeEach, describe, expect, it } from "vitest";
import { blobStore } from "./blobStore";
import { indexNodes, useFsStore } from "./fsStore";
import { ROOT_ID } from "./types";

const api = () => useFsStore.getState();

beforeEach(async () => {
  useFsStore.setState({
    nodes: indexNodes([
      { id: ROOT_ID, parentId: null, name: "Kagami", type: "folder", createdAt: 0, modifiedAt: 0 },
    ]),
    ready: true,
  });
  // The blob store is a module singleton; clear it between tests.
  await blobStore.delete(await blobStore.listHashes());
});

describe("createBlobFile", () => {
  it("stores bytes in the blob store and references them from the node", async () => {
    const blob = new Blob(["pretend png bytes"], { type: "image/png" });
    const node: FsNode = await api().createBlobFile(ROOT_ID, "photo.png", blob);

    expect(node.content).toBeUndefined();
    expect(node.mimeType).toBe("image/png");
    expect(node.contentRef).toMatchObject({ size: blob.size, mimeType: "image/png" });
    expect(await blobStore.has(node.contentRef!.hash)).toBe(true);
    expect(await (await blobStore.get(node.contentRef!.hash))!.text()).toBe("pretend png bytes");
  });

  it("dedupes identical bytes: one blob, two nodes pointing at it", async () => {
    const a = await api().createBlobFile(ROOT_ID, "a.png", new Blob(["same"], { type: "image/png" }));
    const b = await api().createBlobFile(ROOT_ID, "b.png", new Blob(["same"], { type: "image/png" }));

    expect(a.contentRef!.hash).toBe(b.contentRef!.hash);
    expect(a.id).not.toBe(b.id);
    expect(await blobStore.listHashes()).toHaveLength(1);
  });

  it("dedupes colliding names and defaults mime type from the blob", async () => {
    await api().createBlobFile(ROOT_ID, "clip.webm", new Blob(["v1"], { type: "video/webm" }));
    const second = await api().createBlobFile(ROOT_ID, "clip.webm", new Blob(["v2"], { type: "video/webm" }));
    expect(second.name).toBe("clip 2.webm");
    expect(second.mimeType).toBe("video/webm");
  });
});
