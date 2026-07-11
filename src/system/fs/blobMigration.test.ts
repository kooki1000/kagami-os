import type { FsNode } from "./types";
import { beforeEach, describe, expect, it } from "vitest";
import { dataUrlToBlob, migrateInlineBlobs } from "./blobMigration";
import { indexNodes } from "./fsStore";
import { createMemoryBlobStore } from "./idbBlobStore";

// A small threshold keeps the fixtures tiny; the real default is 64 KB.
const THRESHOLD = 40;

function file(partial: Partial<FsNode> & Pick<FsNode, "id">): FsNode {
  return {
    parentId: "pictures",
    name: `${partial.id}.file`,
    type: "file",
    createdAt: 0,
    modifiedAt: 0,
    ...partial,
  };
}

const BIG_PAYLOAD = "some binary content that is comfortably over the threshold";
const bigImageUrl = `data:image/png;base64,${btoa(BIG_PAYLOAD)}`;
const smallSvgUrl = `data:image/svg+xml;utf8,${encodeURIComponent("<svg/>")}`;

let store: ReturnType<typeof createMemoryBlobStore>;
beforeEach(() => {
  store = createMemoryBlobStore();
});

describe("dataUrlToBlob", () => {
  it("decodes base64 and percent-encoded data URLs", async () => {
    const base64 = dataUrlToBlob("data:text/plain;base64,aGVsbG8=");
    expect(base64?.type).toBe("text/plain");
    expect(await base64!.text()).toBe("hello");

    const utf8 = dataUrlToBlob("data:image/svg+xml;utf8,%3Csvg%2F%3E");
    expect(utf8?.type).toBe("image/svg+xml");
    expect(await utf8!.text()).toBe("<svg/>");
  });

  it("returns null for non-data or malformed URLs", () => {
    expect(dataUrlToBlob("https://example.com/x.png")).toBeNull();
    expect(dataUrlToBlob("data:image/png;base64")).toBeNull();
  });
});

describe("migrateInlineBlobs", () => {
  it("moves over-threshold data-URL bytes into blobs, leaving small/text inline", async () => {
    const nodes = indexNodes([
      file({ id: "big", mimeType: "image/png", content: bigImageUrl }),
      file({ id: "svg", mimeType: "image/svg+xml", content: smallSvgUrl }),
      file({ id: "text", mimeType: "text/plain", content: "just a short note" }),
    ]);

    const changed = await migrateInlineBlobs(nodes, store, THRESHOLD);

    expect(changed.map(n => n.id)).toEqual(["big"]);
    const big = changed[0];
    expect(big.content).toBeUndefined();
    expect(big.contentRef).toMatchObject({ mimeType: "image/png", size: BIG_PAYLOAD.length });
    expect(await store.has(big.contentRef!.hash)).toBe(true);
    expect(await (await store.get(big.contentRef!.hash))!.text()).toBe(BIG_PAYLOAD);
  });

  it("is idempotent: a second pass over migrated data changes nothing", async () => {
    const nodes = indexNodes([file({ id: "big", mimeType: "image/png", content: bigImageUrl })]);
    const first = await migrateInlineBlobs(nodes, store, THRESHOLD);
    for (const node of first)
      nodes[node.id] = node;
    expect(await migrateInlineBlobs(nodes, store, THRESHOLD)).toEqual([]);
  });

  it("leaves already-migrated nodes (contentRef, no content) untouched", async () => {
    const nodes = indexNodes([
      file({ id: "ref", contentRef: { hash: "abc", size: 999 } }),
    ]);
    expect(await migrateInlineBlobs(nodes, store, THRESHOLD)).toEqual([]);
  });
});
