import type { FsNode } from "@/system/fs/types";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { indexNodes } from "@/system/fs/fsStore";
import { createMemoryBlobStore } from "@/system/fs/idbBlobStore";
import { buildZipEntries, resolveFileBytes } from "./download";

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function file(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name">): FsNode {
  return { type: "file", createdAt: 0, modifiedAt: 0, ...partial };
}

function folder(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name">): FsNode {
  return { type: "folder", createdAt: 0, modifiedAt: 0, ...partial };
}

describe("resolveFileBytes", () => {
  it("reads plain inline text", async () => {
    const node = file({ id: "a", parentId: null, name: "a.txt", content: "hello" });
    expect(decode(await resolveFileBytes(node, createMemoryBlobStore()))).toBe("hello");
  });

  it("decodes an inline data URL", async () => {
    const node = file({
      id: "a",
      parentId: null,
      name: "a.svg",
      content: `data:image/svg+xml;utf8,${encodeURIComponent("<svg/>")}`,
    });
    expect(decode(await resolveFileBytes(node, createMemoryBlobStore()))).toBe("<svg/>");
  });

  it("reads blob-backed content", async () => {
    const store = createMemoryBlobStore();
    await store.put("h1", new Blob(["blob bytes"]));
    const node = file({ id: "a", parentId: null, name: "a.bin", contentRef: { hash: "h1", size: 10 } });
    expect(decode(await resolveFileBytes(node, store))).toBe("blob bytes");
  });

  it("throws instead of silently producing an empty file when a blob is missing", async () => {
    const node = file({ id: "a", parentId: null, name: "a.bin", contentRef: { hash: "gone", size: 10 } });
    await expect(resolveFileBytes(node, createMemoryBlobStore())).rejects.toThrow("a.bin");
  });
});

describe("buildZipEntries", () => {
  it("flattens a nested folder into relative paths, resolving each file's bytes", async () => {
    const nodes = indexNodes([
      folder({ id: "root", parentId: null, name: "Kagami" }),
      folder({ id: "trip", parentId: "root", name: "Trip" }),
      folder({ id: "beach", parentId: "trip", name: "Beach" }),
      file({ id: "photo", parentId: "beach", name: "photo.txt", content: "pic" }),
      file({ id: "notes", parentId: "trip", name: "notes.txt", content: "notes" }),
    ]);
    const entries = await buildZipEntries("trip", nodes, createMemoryBlobStore());
    expect(Object.keys(entries).sort()).toEqual(["Beach/photo.txt", "notes.txt"]);
    expect(decode(entries["Beach/photo.txt"])).toBe("pic");
    expect(decode(entries["notes.txt"])).toBe("notes");
  });

  it("preserves an empty subfolder as a directory entry", async () => {
    const nodes = indexNodes([
      folder({ id: "root", parentId: null, name: "Kagami" }),
      folder({ id: "trip", parentId: "root", name: "Trip" }),
      folder({ id: "empty", parentId: "trip", name: "Empty" }),
    ]);
    const entries = await buildZipEntries("trip", nodes, createMemoryBlobStore());
    expect(Object.keys(entries)).toEqual(["Empty/"]);
    expect(entries["Empty/"]).toHaveLength(0);
  });

  it("returns no entries for a top-level empty folder", async () => {
    const nodes = indexNodes([
      folder({ id: "root", parentId: null, name: "Kagami" }),
      folder({ id: "empty", parentId: "root", name: "Empty" }),
    ]);
    expect(await buildZipEntries("empty", nodes, createMemoryBlobStore())).toEqual({});
  });

  it("mixes blob-backed and inline files under the same folder", async () => {
    const store = createMemoryBlobStore();
    await store.put("h1", new Blob(["image bytes"]));
    const nodes = indexNodes([
      folder({ id: "root", parentId: null, name: "Kagami" }),
      folder({ id: "pics", parentId: "root", name: "Pics" }),
      file({ id: "img", parentId: "pics", name: "img.png", mimeType: "image/png", contentRef: { hash: "h1", size: 11 } }),
      file({ id: "readme", parentId: "pics", name: "readme.txt", content: "hi" }),
    ]);
    const entries = await buildZipEntries("pics", nodes, store);
    expect(decode(entries["img.png"])).toBe("image bytes");
    expect(decode(entries["readme.txt"])).toBe("hi");
  });

  it("produces entries that zip and unzip back to byte-identical content", async () => {
    const nodes = indexNodes([
      folder({ id: "root", parentId: null, name: "Kagami" }),
      folder({ id: "docs", parentId: "root", name: "Docs" }),
      file({ id: "f", parentId: "docs", name: "readme.txt", content: "round trip me" }),
    ]);
    const entries = await buildZipEntries("docs", nodes, createMemoryBlobStore());
    const unzipped = unzipSync(zipSync(entries));
    expect(decode(unzipped["readme.txt"])).toBe("round trip me");
  });
});
