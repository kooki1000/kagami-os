import type { FsNode } from "@/system/fs/types";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { indexNodes } from "@/system/fs/fsStore";
import { createMemoryBlobStore } from "@/system/fs/idbBlobStore";
import {
  DESKTOP_ID,
  DOCUMENTS_ID,
  DOWNLOADS_ID,
  HOME_ID,
  PICTURES_ID,
  ROOT_ID,
  TRASH_ID,
} from "@/system/fs/types";
import {
  buildExportEntries,
  buildExportManifest,
  EXPORT_MANIFEST_VERSION,
  InvalidArchiveError,
  MANIFEST_ENTRY,
  planImport,
} from "./exportImport";

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function file(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name">): FsNode {
  return { type: "file", createdAt: 0, modifiedAt: 0, ...partial };
}

function folder(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name">): FsNode {
  return { type: "folder", createdAt: 0, modifiedAt: 0, ...partial };
}

/** A minimal but realistic disk: the system folders plus a small mixed tree. */
function baseDisk(): FsNode[] {
  return [
    folder({ id: ROOT_ID, parentId: null, name: "Kagami" }),
    folder({ id: HOME_ID, parentId: ROOT_ID, name: "Home" }),
    folder({ id: DESKTOP_ID, parentId: HOME_ID, name: "Desktop" }),
    folder({ id: DOCUMENTS_ID, parentId: HOME_ID, name: "Documents" }),
    folder({ id: DOWNLOADS_ID, parentId: HOME_ID, name: "Downloads" }),
    folder({ id: PICTURES_ID, parentId: HOME_ID, name: "Pictures" }),
    folder({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash" }),
  ];
}

function makeCounter(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

describe("buildExportManifest", () => {
  it("records every file's metadata by zip-relative path, excluding the root", () => {
    const nodes = indexNodes([
      ...baseDisk(),
      file({ id: "f1", parentId: DOCUMENTS_ID, name: "welcome.md", mimeType: "text/markdown", content: "hi", createdAt: 10, modifiedAt: 20 }),
    ]);
    const manifest = buildExportManifest(nodes);
    expect(manifest.version).toBe(EXPORT_MANIFEST_VERSION);
    expect(manifest.files).toEqual({
      "Home/Documents/welcome.md": { mimeType: "text/markdown", createdAt: 10, modifiedAt: 20 },
    });
    expect(Object.keys(manifest.files)).not.toContain("Kagami");
  });

  it("maps system-folder paths to their well-known ids, independent of name", () => {
    const disk = baseDisk();
    // Rename Documents — the manifest should still key it by its *current*
    // path but record the fixed id, so a rename before export doesn't break
    // the well-known-id round trip.
    const renamed = disk.map(n => (n.id === DOCUMENTS_ID ? { ...n, name: "My Docs" } : n));
    const manifest = buildExportManifest(indexNodes(renamed));
    expect(manifest.systemFolders).toEqual({
      "Home": HOME_ID,
      "Home/Desktop": DESKTOP_ID,
      "Home/My Docs": DOCUMENTS_ID,
      "Home/Downloads": DOWNLOADS_ID,
      "Home/Pictures": PICTURES_ID,
      "Trash": TRASH_ID,
    });
  });
});

describe("buildExportEntries", () => {
  it("includes Trash content when rooted at the true VFS root, plus the manifest entry", async () => {
    const nodes = indexNodes([
      ...baseDisk(),
      file({ id: "f1", parentId: DOCUMENTS_ID, name: "welcome.md", mimeType: "text/markdown", content: "hi" }),
      file({ id: "t1", parentId: TRASH_ID, name: "deleted.txt", mimeType: "text/plain", content: "gone" }),
    ]);
    const entries = await buildExportEntries(nodes, createMemoryBlobStore());
    // Desktop/Downloads/Pictures are empty in this fixture, so they show up
    // as empty-folder marker entries alongside the two real files.
    expect(Object.keys(entries).sort()).toEqual([
      MANIFEST_ENTRY,
      "Home/Desktop/",
      "Home/Documents/welcome.md",
      "Home/Downloads/",
      "Home/Pictures/",
      "Trash/deleted.txt",
    ].sort());
    expect(decode(entries["Trash/deleted.txt"])).toBe("gone");
  });

  it("round-trips through zipSync/unzipSync byte-identically", async () => {
    const nodes = indexNodes([
      ...baseDisk(),
      file({ id: "f1", parentId: PICTURES_ID, name: "art.svg", mimeType: "image/svg+xml", content: "<svg/>" }),
    ]);
    const entries = await buildExportEntries(nodes, createMemoryBlobStore());
    const unzipped = unzipSync(zipSync(entries));
    expect(decode(unzipped["Home/Pictures/art.svg"])).toBe("<svg/>");
    expect(JSON.parse(decode(unzipped[MANIFEST_ENTRY])).version).toBe(EXPORT_MANIFEST_VERSION);
  });
});

describe("planImport", () => {
  it("rejects an archive with no manifest", async () => {
    await expect(planImport({ "readme.txt": encode("hi") })).rejects.toThrow(InvalidArchiveError);
  });

  it("rejects an archive from an incompatible manifest version", async () => {
    const entries = { [MANIFEST_ENTRY]: encode(JSON.stringify({ version: 999, files: {}, systemFolders: {} })) };
    await expect(planImport(entries)).rejects.toThrow(InvalidArchiveError);
  });

  it("reconstructs folders and files with the right parent chain, preserving system-folder ids", async () => {
    const nodes = indexNodes([
      ...baseDisk(),
      file({ id: "f1", parentId: DOCUMENTS_ID, name: "welcome.md", mimeType: "text/markdown", content: "hi", createdAt: 5, modifiedAt: 6 }),
    ]);
    const entries = await buildExportEntries(nodes, createMemoryBlobStore());
    const plan = await planImport(entries, makeCounter());

    const byPath = new Map(plan.nodes.map(n => [n.id, n]));
    const home = plan.nodes.find(n => n.id === HOME_ID)!;
    expect(home.parentId).toBe(ROOT_ID);
    const documents = plan.nodes.find(n => n.id === DOCUMENTS_ID)!;
    expect(documents.parentId).toBe(HOME_ID);
    const welcome = plan.nodes.find(n => n.name === "welcome.md")!;
    expect(welcome.parentId).toBe(DOCUMENTS_ID);
    expect(welcome.type).toBe("file");
    expect(welcome.content).toBe("hi");
    expect(welcome.mimeType).toBe("text/markdown");
    expect(welcome.createdAt).toBe(5);
    expect(welcome.modifiedAt).toBe(6);
    expect(byPath.get(TRASH_ID)?.parentId).toBe(ROOT_ID);
  });

  it("preserves an empty subfolder", async () => {
    const nodes = indexNodes([
      ...baseDisk(),
      folder({ id: "empty", parentId: DOCUMENTS_ID, name: "Empty Album" }),
    ]);
    const entries = await buildExportEntries(nodes, createMemoryBlobStore());
    const plan = await planImport(entries, makeCounter());
    const empty = plan.nodes.find(n => n.name === "Empty Album");
    expect(empty).toBeDefined();
    expect(empty!.type).toBe("folder");
    expect(empty!.parentId).toBe(DOCUMENTS_ID);
  });

  it("keeps small text files inline and large/binary files blob-backed, matching the upload threshold", async () => {
    const bigText = "x".repeat(70 * 1024); // over BLOB_INLINE_THRESHOLD (64 KB)
    const nodes = indexNodes([
      ...baseDisk(),
      file({ id: "small", parentId: DOCUMENTS_ID, name: "small.txt", mimeType: "text/plain", content: "hi" }),
      file({ id: "big", parentId: DOCUMENTS_ID, name: "big.txt", mimeType: "text/plain", content: bigText }),
      file({ id: "img", parentId: PICTURES_ID, name: "img.png", mimeType: "image/png", contentRef: { hash: "h1", size: 3, mimeType: "image/png" } }),
    ]);
    const store = createMemoryBlobStore();
    await store.put("h1", new Blob(["abc"]));
    const entries = await buildExportEntries(nodes, store);
    const plan = await planImport(entries, makeCounter());

    const small = plan.nodes.find(n => n.name === "small.txt")!;
    expect(small.content).toBe("hi");
    expect(small.contentRef).toBeUndefined();

    const big = plan.nodes.find(n => n.name === "big.txt")!;
    expect(big.content).toBeUndefined();
    expect(big.contentRef).toBeDefined();
    expect(plan.blobs.find(b => b.hash === big.contentRef!.hash)?.bytes.byteLength).toBe(bigText.length);

    const img = plan.nodes.find(n => n.name === "img.png")!;
    expect(img.contentRef).toBeDefined();
    expect(plan.blobs.find(b => b.hash === img.contentRef!.hash)).toBeDefined();
  });

  it("dedupes identical bytes into one blob, same as a fresh upload would", async () => {
    const bytes = new Blob(["duplicate content"]);
    const nodes = indexNodes([
      ...baseDisk(),
      file({ id: "a", parentId: PICTURES_ID, name: "a.png", mimeType: "image/png", contentRef: { hash: "h1", size: 5 } }),
      file({ id: "b", parentId: DOWNLOADS_ID, name: "b.png", mimeType: "image/png", contentRef: { hash: "h1", size: 5 } }),
    ]);
    const store = createMemoryBlobStore();
    await store.put("h1", bytes);
    const entries = await buildExportEntries(nodes, store);
    const plan = await planImport(entries, makeCounter());

    expect(plan.blobs).toHaveLength(1);
    const a = plan.nodes.find(n => n.name === "a.png")!;
    const b = plan.nodes.find(n => n.name === "b.png")!;
    expect(a.contentRef!.hash).toBe(b.contentRef!.hash);
  });

  it("lands trashed items directly under Trash without a trashedFrom (falls back to Documents on restore)", async () => {
    const nodes = indexNodes([
      ...baseDisk(),
      file({ id: "t1", parentId: TRASH_ID, name: "deleted.txt", mimeType: "text/plain", content: "gone", trashedFrom: DOCUMENTS_ID }),
    ]);
    const entries = await buildExportEntries(nodes, createMemoryBlobStore());
    const plan = await planImport(entries, makeCounter());
    const deleted = plan.nodes.find(n => n.name === "deleted.txt")!;
    expect(deleted.parentId).toBe(TRASH_ID);
    expect(deleted.trashedFrom).toBeUndefined();
  });
});
