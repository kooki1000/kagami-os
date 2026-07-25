import type { FsNode } from "@/system/fs/types";
import { describe, expect, it } from "vitest";
import { indexNodes } from "@/system/fs/fsStore";
import { folderSizes, isAudioNode, isVideoNode, nodeKind, nodeSize } from "./fileMeta";

function node(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name" | "type">): FsNode {
  return { createdAt: 0, modifiedAt: 0, ...partial };
}

describe("audio/video classification (D5)", () => {
  it("isAudioNode/isVideoNode match on the mimeType prefix only", () => {
    const audio = node({ id: "a", parentId: "home", name: "song.mp3", type: "file", mimeType: "audio/mpeg" });
    const video = node({ id: "v", parentId: "home", name: "clip.mp4", type: "file", mimeType: "video/mp4" });
    const image = node({ id: "i", parentId: "home", name: "pic.png", type: "file", mimeType: "image/png" });
    const folder = node({ id: "f", parentId: "home", name: "Box", type: "folder", mimeType: "audio/mpeg" });

    expect(isAudioNode(audio)).toBe(true);
    expect(isVideoNode(audio)).toBe(false);
    expect(isVideoNode(video)).toBe(true);
    expect(isAudioNode(video)).toBe(false);
    expect(isAudioNode(image)).toBe(false);
    expect(isVideoNode(image)).toBe(false);
    // A folder never counts, even one somehow carrying a media mimeType.
    expect(isAudioNode(folder)).toBe(false);
  });

  it("nodeKind falls back to a generic Audio/Video label for mimeTypes not in the lookup table", () => {
    const flac = node({ id: "a", parentId: "home", name: "song.flac", type: "file", mimeType: "audio/flac" });
    const mkv = node({ id: "v", parentId: "home", name: "clip.mkv", type: "file", mimeType: "video/x-matroska" });
    expect(nodeKind(flac)).toBe("Audio");
    expect(nodeKind(mkv)).toBe("Video");
  });

  it("nodeKind prefers the specific lookup-table label when one exists", () => {
    const mp3 = node({ id: "a", parentId: "home", name: "song.mp3", type: "file", mimeType: "audio/mpeg" });
    expect(nodeKind(mp3)).toBe("MP3 Audio");
  });
});

describe("nodeSize (B8)", () => {
  it("sizes an inline-content file by its UTF-8 byte length, not character count", () => {
    // "café" is 4 JS characters but 5 UTF-8 bytes (é is 2 bytes) — proves the
    // computation uses TextEncoder rather than `.length`.
    const nodes = indexNodes([
      node({ id: "f", parentId: "home", name: "note.txt", type: "file", content: "café" }),
    ]);
    expect(nodeSize(nodes, nodes.f)).toBe(5);
  });

  it("sizes a blob-backed file from contentRef.size, ignoring content", () => {
    const nodes = indexNodes([
      node({
        id: "f",
        parentId: "home",
        name: "photo.png",
        type: "file",
        contentRef: { hash: "abc123", size: 204_800, mimeType: "image/png" },
      }),
    ]);
    expect(nodeSize(nodes, nodes.f)).toBe(204_800);
  });

  it("sizes an empty file (no content, no contentRef) as zero", () => {
    const nodes = indexNodes([
      node({ id: "f", parentId: "home", name: "empty.txt", type: "file" }),
    ]);
    expect(nodeSize(nodes, nodes.f)).toBe(0);
  });

  it("rolls a folder's size up recursively across nested children", () => {
    const nodes = indexNodes([
      node({ id: "box", parentId: "home", name: "Box", type: "folder" }),
      node({ id: "a", parentId: "box", name: "a.txt", type: "file", content: "12345" }), // 5 bytes
      node({ id: "sub", parentId: "box", name: "Sub", type: "folder" }),
      node({ id: "b", parentId: "sub", name: "b.png", type: "file", contentRef: { hash: "h", size: 100 } }),
      node({ id: "c", parentId: "sub", name: "c.txt", type: "file", content: "12" }), // 2 bytes
    ]);
    expect(nodeSize(nodes, nodes.box)).toBe(5 + 100 + 2);
  });

  it("sizes an empty folder as zero", () => {
    const nodes = indexNodes([
      node({ id: "box", parentId: "home", name: "Box", type: "folder" }),
    ]);
    expect(nodeSize(nodes, nodes.box)).toBe(0);
  });
});

describe("folderSizes (review-backlog #5)", () => {
  it("computes every folder's rolled-up size in one pass, matching nodeSize per folder", () => {
    const nodes = indexNodes([
      node({ id: "box", parentId: "home", name: "Box", type: "folder" }),
      node({ id: "a", parentId: "box", name: "a.txt", type: "file", content: "12345" }), // 5 bytes
      node({ id: "sub", parentId: "box", name: "Sub", type: "folder" }),
      node({ id: "b", parentId: "sub", name: "b.png", type: "file", contentRef: { hash: "h", size: 100 } }),
      node({ id: "c", parentId: "sub", name: "c.txt", type: "file", content: "12" }), // 2 bytes
      node({ id: "empty", parentId: "home", name: "Empty", type: "folder" }),
    ]);
    const sizes = folderSizes(nodes);
    expect(sizes.get("box")).toBe(5 + 100 + 2);
    expect(sizes.get("sub")).toBe(100 + 2);
    expect(sizes.get("empty")).toBe(0);
    // Agrees with the single-node lookup for the same tree.
    expect(sizes.get("box")).toBe(nodeSize(nodes, nodes.box));
    expect(sizes.get("sub")).toBe(nodeSize(nodes, nodes.sub));
  });

  it("terminates on a corrupt parentId cycle instead of recursing forever", () => {
    // `a` and `b` are each other's parent — a corrupted tree that would
    // stack-overflow a naive recursive implementation.
    const nodes = indexNodes([
      node({ id: "a", parentId: "b", name: "A", type: "folder" }),
      node({ id: "b", parentId: "a", name: "B", type: "folder" }),
    ]);
    expect(() => folderSizes(nodes)).not.toThrow();
  });

  it("returns an empty map for an empty node set", () => {
    expect(folderSizes({}).size).toBe(0);
  });
});
