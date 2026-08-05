import type { FsNode } from "@/system/fs/types";
import { describe, expect, it } from "vitest";
import { indexNodes } from "@/system/fs/fsStore";
import { createMemoryBlobStore } from "@/system/fs/idbBlobStore";
import { APPS_ID, ROOT_ID } from "@/system/fs/types";
import { resolveInstalledAppBundles } from "./installedApps";

function folder(id: string, parentId: string): FsNode {
  return { id, parentId, name: id, type: "folder", createdAt: 0, modifiedAt: 0 };
}

function file(id: string, parentId: string, name: string, content: string): FsNode {
  return { id, parentId, name, type: "file", content, createdAt: 0, modifiedAt: 0 };
}

const VALID_MANIFEST = JSON.stringify({
  id: "cool-app",
  name: "Cool App",
  version: "1.0.0",
  entry: "entry.js",
  capabilities: ["notifications"],
});

describe("resolveInstalledAppBundles", () => {
  it("returns nothing when /Apps has no subfolders", async () => {
    const nodes = indexNodes([folder(APPS_ID, ROOT_ID)]);
    expect(await resolveInstalledAppBundles(nodes, createMemoryBlobStore())).toEqual([]);
  });

  it("returns nothing when /Apps doesn't exist at all", async () => {
    const nodes = indexNodes([folder(ROOT_ID, ROOT_ID)]);
    expect(await resolveInstalledAppBundles(nodes, createMemoryBlobStore())).toEqual([]);
  });

  it("resolves a valid bundle: manifest + matching entry file", async () => {
    const nodes = indexNodes([
      folder(APPS_ID, ROOT_ID),
      folder("cool-app", APPS_ID),
      file("manifest", "cool-app", "manifest.json", VALID_MANIFEST),
      file("entry", "cool-app", "entry.js", "console.log('hi')"),
    ]);
    const result = await resolveInstalledAppBundles(nodes, createMemoryBlobStore());
    expect(result).toEqual([
      { manifest: { id: "cool-app", name: "Cool App", version: "1.0.0", entry: "entry.js", capabilities: ["notifications"] }, entryNodeId: "entry" },
    ]);
  });

  it("skips a subfolder with no manifest.json", async () => {
    const nodes = indexNodes([
      folder(APPS_ID, ROOT_ID),
      folder("no-manifest", APPS_ID),
      file("entry", "no-manifest", "entry.js", "// nothing"),
    ]);
    expect(await resolveInstalledAppBundles(nodes, createMemoryBlobStore())).toEqual([]);
  });

  it("skips a subfolder whose manifest.json is invalid JSON", async () => {
    const nodes = indexNodes([
      folder(APPS_ID, ROOT_ID),
      folder("bad-json", APPS_ID),
      file("manifest", "bad-json", "manifest.json", "{ not json"),
    ]);
    expect(await resolveInstalledAppBundles(nodes, createMemoryBlobStore())).toEqual([]);
  });

  it("skips a subfolder whose manifest.json parses but fails schema validation", async () => {
    const nodes = indexNodes([
      folder(APPS_ID, ROOT_ID),
      folder("bad-shape", APPS_ID),
      file("manifest", "bad-shape", "manifest.json", JSON.stringify({ id: "bad-shape" })),
    ]);
    expect(await resolveInstalledAppBundles(nodes, createMemoryBlobStore())).toEqual([]);
  });

  it("skips a subfolder whose manifest is valid but its entry file is missing", async () => {
    const nodes = indexNodes([
      folder(APPS_ID, ROOT_ID),
      folder("cool-app", APPS_ID),
      file("manifest", "cool-app", "manifest.json", VALID_MANIFEST),
      // entry.js never created
    ]);
    expect(await resolveInstalledAppBundles(nodes, createMemoryBlobStore())).toEqual([]);
  });

  it("one malformed bundle doesn't block a valid sibling from resolving", async () => {
    const nodes = indexNodes([
      folder(APPS_ID, ROOT_ID),
      folder("bad-json", APPS_ID),
      file("manifest-bad", "bad-json", "manifest.json", "{ not json"),
      folder("cool-app", APPS_ID),
      file("manifest-good", "cool-app", "manifest.json", VALID_MANIFEST),
      file("entry", "cool-app", "entry.js", "console.log('hi')"),
    ]);
    const result = await resolveInstalledAppBundles(nodes, createMemoryBlobStore());
    expect(result).toEqual([
      { manifest: { id: "cool-app", name: "Cool App", version: "1.0.0", entry: "entry.js", capabilities: ["notifications"] }, entryNodeId: "entry" },
    ]);
  });

  it("ignores a non-folder child of /Apps", async () => {
    const nodes = indexNodes([
      folder(APPS_ID, ROOT_ID),
      file("stray-file", APPS_ID, "readme.txt", "not an app"),
    ]);
    expect(await resolveInstalledAppBundles(nodes, createMemoryBlobStore())).toEqual([]);
  });
});
