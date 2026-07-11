import { beforeEach, describe, expect, it } from "vitest";
import { hashBlob } from "./blobHash";
import { createMemoryBlobStore } from "./idbBlobStore";

// The memory store is what `createIdbBlobStore` falls back to under Node
// (no IndexedDB), so exercising it covers the logic the whole seam shares.
let store: ReturnType<typeof createMemoryBlobStore>;

beforeEach(() => {
  store = createMemoryBlobStore();
});

async function putText(text: string): Promise<string> {
  const blob = new Blob([text]);
  const hash = await hashBlob(blob);
  await store.put(hash, blob);
  return hash;
}

describe("blob store", () => {
  it("stores and reads a blob back by its hash", async () => {
    const hash = await putText("hello blobs");
    expect(await store.has(hash)).toBe(true);
    const back = await store.get(hash);
    expect(back).not.toBeNull();
    expect(await back!.text()).toBe("hello blobs");
  });

  it("reports absent hashes", async () => {
    expect(await store.has("deadbeef")).toBe(false);
    expect(await store.get("deadbeef")).toBeNull();
  });

  it("dedupes: writing identical bytes twice keeps a single entry", async () => {
    const h1 = await putText("same");
    const h2 = await putText("same");
    expect(h1).toBe(h2);
    expect(await store.listHashes()).toEqual([h1]);
  });

  it("lists every stored hash", async () => {
    const a = await putText("one");
    const b = await putText("two");
    expect(new Set(await store.listHashes())).toEqual(new Set([a, b]));
  });

  it("deletes only the requested hashes", async () => {
    const a = await putText("keep");
    const b = await putText("drop");
    await store.delete([b]);
    expect(await store.has(a)).toBe(true);
    expect(await store.has(b)).toBe(false);
    expect(await store.listHashes()).toEqual([a]);
  });
});
