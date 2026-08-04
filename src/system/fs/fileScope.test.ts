import type { FsNode } from "./types";
import { describe, expect, it } from "vitest";
import { scopedFiles, splitPinned } from "./fileScope";
import { indexNodes } from "./fsStore";
import { DOCUMENTS_ID, HOME_ID, ROOT_ID, TRASH_ID } from "./types";

function node(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name" | "type">): FsNode {
  return { createdAt: 0, modifiedAt: 0, ...partial };
}

const nodes = indexNodes([
  node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
  node({ id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder" }),
  node({ id: DOCUMENTS_ID, parentId: HOME_ID, name: "Documents", type: "folder" }),
  node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
  node({ id: "src", parentId: DOCUMENTS_ID, name: "src", type: "folder" }),
  node({ id: "readme", parentId: DOCUMENTS_ID, name: "readme.md", type: "file", mimeType: "text/markdown" }),
  node({ id: "app", parentId: DOCUMENTS_ID, name: "app.ts", type: "file", mimeType: "text/typescript" }),
  node({ id: "util", parentId: "src", name: "util.ts", type: "file", mimeType: "text/typescript" }),
  node({ id: "trashed", parentId: TRASH_ID, name: "old.ts", type: "file", mimeType: "text/typescript" }),
]);

const isTypeScript = (n: FsNode): boolean => n.mimeType === "text/typescript";

describe("scopedFiles", () => {
  it("lists only what the caller's predicate accepts", () => {
    const ids = scopedFiles(nodes, DOCUMENTS_ID, "folder", isTypeScript).map(n => n.id);
    expect(ids).toEqual(["app"]);
  });

  it("\"subtree\" reaches descendant folders, \"folder\" does not", () => {
    expect(scopedFiles(nodes, DOCUMENTS_ID, "folder", isTypeScript).map(n => n.id)).toEqual(["app"]);
    expect(scopedFiles(nodes, DOCUMENTS_ID, "subtree", isTypeScript).map(n => n.id).sort()).toEqual(["app", "util"]);
  });

  it("never lists trashed files, whatever the predicate says", () => {
    const ids = scopedFiles(nodes, TRASH_ID, "subtree", () => true).map(n => n.id);
    expect(ids).toEqual([]);
  });

  it("never lists folders", () => {
    const ids = scopedFiles(nodes, DOCUMENTS_ID, "folder", () => true).map(n => n.id).sort();
    expect(ids).toEqual(["app", "readme"]);
  });
});

describe("splitPinned", () => {
  it("keeps list order within each group", () => {
    const files = [nodes.readme, nodes.app, nodes.util];
    const { pinned, rest } = splitPinned(files, new Set(["util", "readme"]));
    expect(pinned.map(n => n.id)).toEqual(["readme", "util"]);
    expect(rest.map(n => n.id)).toEqual(["app"]);
  });
});
