import type { FsNode } from "@/system/fs/types";
import { describe, expect, it } from "vitest";
import { indexNodes } from "@/system/fs/fsStore";
import { DOCUMENTS_ID, HOME_ID, ROOT_ID, TRASH_ID } from "@/system/fs/types";
import {
  filterDocs,
  folderOptions,
  scopedDocs,
  sortDocs,
  splitPinned,
} from "./notesFilter";

function node(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name" | "type">): FsNode {
  return { createdAt: 0, modifiedAt: 0, ...partial };
}

const nodes = indexNodes([
  node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
  node({ id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder" }),
  node({ id: DOCUMENTS_ID, parentId: HOME_ID, name: "Documents", type: "folder" }),
  node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
  node({ id: "reports", parentId: DOCUMENTS_ID, name: "Reports", type: "folder" }),
  node({ id: "note-a", parentId: DOCUMENTS_ID, name: "alpha.md", type: "file", mimeType: "text/markdown", modifiedAt: 100 }),
  node({ id: "note-b", parentId: DOCUMENTS_ID, name: "beta.md", type: "file", mimeType: "text/markdown", modifiedAt: 300 }),
  node({ id: "note-c", parentId: "reports", name: "gamma.md", type: "file", mimeType: "text/markdown", modifiedAt: 200 }),
  node({ id: "trashed", parentId: TRASH_ID, name: "old.md", type: "file", mimeType: "text/markdown" }),
  node({ id: "pic", parentId: DOCUMENTS_ID, name: "photo.png", type: "file", mimeType: "image/png" }),
]);

describe("scopedDocs", () => {
  it("\"folder\" scope lists only direct children, never Trash", () => {
    const ids = scopedDocs(nodes, DOCUMENTS_ID, "folder").map(n => n.id).sort();
    expect(ids).toEqual(["note-a", "note-b"]);
  });

  it("\"subtree\" scope also includes descendant folders", () => {
    const ids = scopedDocs(nodes, DOCUMENTS_ID, "subtree").map(n => n.id).sort();
    expect(ids).toEqual(["note-a", "note-b", "note-c"]);
  });

  it("excludes non-text files regardless of scope", () => {
    const ids = scopedDocs(nodes, DOCUMENTS_ID, "subtree").map(n => n.id);
    expect(ids).not.toContain("pic");
  });

  it("excludes items sitting in the Trash even in subtree mode", () => {
    const ids = scopedDocs(nodes, ROOT_ID, "subtree").map(n => n.id);
    expect(ids).not.toContain("trashed");
  });
});

describe("filterDocs", () => {
  const docs = scopedDocs(nodes, DOCUMENTS_ID, "subtree");

  it("keeps everything for a blank query", () => {
    expect(filterDocs(docs, "  ")).toHaveLength(docs.length);
  });

  it("matches case-insensitively against the name", () => {
    expect(filterDocs(docs, "ALPHA").map(n => n.id)).toEqual(["note-a"]);
  });
});

describe("sortDocs", () => {
  const docs = scopedDocs(nodes, DOCUMENTS_ID, "subtree");

  it("sorts by name ascending", () => {
    expect(sortDocs(docs, { key: "name", dir: "asc" }).map(n => n.id)).toEqual(["note-a", "note-b", "note-c"]);
  });

  it("sorts by date descending (newest first)", () => {
    expect(sortDocs(docs, { key: "date", dir: "desc" }).map(n => n.id)).toEqual(["note-b", "note-c", "note-a"]);
  });

  it("does not mutate its input", () => {
    const copy = [...docs];
    sortDocs(docs, { key: "name", dir: "asc" });
    expect(docs).toEqual(copy);
  });
});

describe("splitPinned", () => {
  it("separates pinned docs from the rest, preserving relative order", () => {
    const docs = scopedDocs(nodes, DOCUMENTS_ID, "subtree");
    const { pinned, rest } = splitPinned(docs, new Set(["note-c"]));
    expect(pinned.map(n => n.id)).toEqual(["note-c"]);
    expect(rest.map(n => n.id).sort()).toEqual(["note-a", "note-b"]);
  });

  it("returns everything as \"rest\" when nothing is pinned", () => {
    const docs = scopedDocs(nodes, DOCUMENTS_ID, "folder");
    const { pinned, rest } = splitPinned(docs, new Set());
    expect(pinned).toEqual([]);
    expect(rest).toHaveLength(docs.length);
  });
});

describe("folderOptions", () => {
  it("flattens the subtree rooted at the given folder, depth-indented, alphabetical", () => {
    expect(folderOptions(nodes, HOME_ID)).toEqual([
      { id: HOME_ID, name: "Home", depth: 0 },
      { id: DOCUMENTS_ID, name: "Documents", depth: 1 },
      { id: "reports", name: "Reports", depth: 2 },
    ]);
  });

  it("never includes the Trash folder", () => {
    const ids = folderOptions(nodes, ROOT_ID).map(o => o.id);
    expect(ids).not.toContain(TRASH_ID);
  });

  it("returns an empty list for a missing or non-folder id", () => {
    expect(folderOptions(nodes, "does-not-exist")).toEqual([]);
    expect(folderOptions(nodes, "note-a")).toEqual([]);
  });
});
