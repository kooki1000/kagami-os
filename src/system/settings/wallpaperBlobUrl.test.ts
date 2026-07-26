import type { BlobStore, FsNode } from "@/system/fs/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blobStore } from "@/system/fs/blobStore";
import { indexNodes, useFsStore } from "@/system/fs/fsStore";
import {
  __resetWallpaperBlobUrlForTest,
  ensureWallpaperUrl,
  getWallpaperUrl,
  resolveWallpaperUrl,
  subscribeWallpaperUrl,
} from "./wallpaperBlobUrl";

function node(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name" | "type">): FsNode {
  return { createdAt: 0, modifiedAt: 0, ...partial };
}

/** A `BlobStore` double where only `get` is ever exercised by `resolveWallpaperUrl`. */
function fakeBlobStore(get: BlobStore["get"]): BlobStore {
  return {
    has: async () => false,
    get,
    put: async () => {},
    delete: async () => {},
    listHashes: async () => [],
  };
}

describe("resolveWallpaperUrl", () => {
  it("returns null for a missing node", async () => {
    expect(await resolveWallpaperUrl(undefined, fakeBlobStore(async () => null))).toBeNull();
  });

  it("returns null for a folder", async () => {
    const folder = node({ id: "f", parentId: null, name: "Pictures", type: "folder" });
    expect(await resolveWallpaperUrl(folder, fakeBlobStore(async () => null))).toBeNull();
  });

  it("returns an inline data URL as-is, without touching the blob store", async () => {
    let calledStore = false;
    const file = node({ id: "n", parentId: null, name: "a.png", type: "file", content: "data:image/png;base64,abc" });
    const result = await resolveWallpaperUrl(file, fakeBlobStore(async () => {
      calledStore = true;
      return null;
    }));
    expect(result).toEqual({ url: "data:image/png;base64,abc", isObjectUrl: false });
    expect(calledStore).toBe(false);
  });

  it("resolves a blob-backed node to a fresh object URL", async () => {
    const blob = new Blob(["bytes"]);
    const file = node({ id: "n", parentId: null, name: "a.png", type: "file", contentRef: { hash: "h1", size: 5 } });
    const result = await resolveWallpaperUrl(file, fakeBlobStore(async hash => (hash === "h1" ? blob : null)));
    expect(result?.isObjectUrl).toBe(true);
    expect(result?.url).toMatch(/^blob:/);
  });

  it("returns null when the blob hash is no longer in the store", async () => {
    const file = node({ id: "n", parentId: null, name: "a.png", type: "file", contentRef: { hash: "gone", size: 5 } });
    expect(await resolveWallpaperUrl(file, fakeBlobStore(async () => null))).toBeNull();
  });

  it("returns null for a file with neither content nor contentRef", async () => {
    const file = node({ id: "n", parentId: null, name: "a.png", type: "file" });
    expect(await resolveWallpaperUrl(file, fakeBlobStore(async () => null))).toBeNull();
  });
});

describe("ensureWallpaperUrl / getWallpaperUrl (module-owned lifetime, independent of any mount)", () => {
  beforeEach(async () => {
    __resetWallpaperBlobUrlForTest();
    await blobStore.delete(await blobStore.listHashes());
    useFsStore.setState({
      nodes: indexNodes([
        node({ id: "root", parentId: null, name: "Kagami", type: "folder" }),
        node({ id: "inline", parentId: "root", name: "inline.png", type: "file", content: "data:image/png;base64,abc" }),
        node({ id: "blobby", parentId: "root", name: "blobby.png", type: "file", contentRef: { hash: "wall-hash", size: 5 } }),
      ]),
      ready: true,
    });
    await blobStore.put("wall-hash", new Blob(["bytes"]));
  });

  afterEach(() => {
    __resetWallpaperBlobUrlForTest();
  });

  it("starts with no resolved URL for either slot", () => {
    expect(getWallpaperUrl("light")).toBeNull();
    expect(getWallpaperUrl("dark")).toBeNull();
  });

  it("resolves an inline-content node without needing the blob store", async () => {
    await ensureWallpaperUrl("light", "inline");
    expect(getWallpaperUrl("light")).toBe("data:image/png;base64,abc");
  });

  it("resolves a blob-backed node to an object URL", async () => {
    await ensureWallpaperUrl("dark", "blobby");
    expect(getWallpaperUrl("dark")).toMatch(/^blob:/);
  });

  it("clearing with null resets the slot", async () => {
    await ensureWallpaperUrl("light", "inline");
    await ensureWallpaperUrl("light", null);
    expect(getWallpaperUrl("light")).toBeNull();
  });

  it("re-targeting the same slot to a different file replaces its URL", async () => {
    await ensureWallpaperUrl("light", "inline");
    await ensureWallpaperUrl("light", "blobby");
    expect(getWallpaperUrl("light")).toMatch(/^blob:/);
  });

  it("is a no-op when asked for the same fileId again", async () => {
    await ensureWallpaperUrl("light", "blobby");
    const first = getWallpaperUrl("light");
    await ensureWallpaperUrl("light", "blobby");
    expect(getWallpaperUrl("light")).toBe(first);
  });

  it("notifies subscribers once a slot's resolved URL settles", async () => {
    let notified = 0;
    const unsubscribe = subscribeWallpaperUrl(() => {
      notified++;
    });
    await ensureWallpaperUrl("light", "inline");
    expect(notified).toBeGreaterThan(0);
    unsubscribe();
  });

  it("light and dark slots resolve independently", async () => {
    await ensureWallpaperUrl("light", "inline");
    await ensureWallpaperUrl("dark", "blobby");
    expect(getWallpaperUrl("light")).toBe("data:image/png;base64,abc");
    expect(getWallpaperUrl("dark")).toMatch(/^blob:/);
  });

  it("resolves to null (rather than throwing) for a fileId with no matching node", async () => {
    await ensureWallpaperUrl("light", "does-not-exist");
    expect(getWallpaperUrl("light")).toBeNull();
  });
});
