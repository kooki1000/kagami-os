import type { FsNode } from "../fs/types";
import { describe, expect, it } from "vitest";
import { indexNodes } from "../fs/fsStore";
import { DOCUMENTS_ID, HOME_ID, ROOT_ID, TRASH_ID } from "../fs/types";
import { searchNodes } from "./searchNodes";

function node(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name" | "type">): FsNode {
  return { createdAt: 0, modifiedAt: 0, ...partial };
}

/** Home/Documents holds two "report"-matching nodes plus a decoy; Trash holds a direct child and a nested one, both matching too. */
const nodes = indexNodes([
  node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
  node({ id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder" }),
  node({ id: DOCUMENTS_ID, parentId: HOME_ID, name: "Documents", type: "folder" }),
  node({ id: "reports", parentId: DOCUMENTS_ID, name: "Reports", type: "folder" }),
  node({ id: "old-report", parentId: DOCUMENTS_ID, name: "old-report.txt", type: "file" }),
  node({ id: "note", parentId: DOCUMENTS_ID, name: "note.md", type: "file" }),
  node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
  node({ id: "trashed-direct", parentId: TRASH_ID, name: "trashed-report.txt", type: "file" }),
  node({ id: "trashed-folder", parentId: TRASH_ID, name: "Old Reports", type: "folder" }),
  node({ id: "trashed-nested", parentId: "trashed-folder", name: "buried-report.txt", type: "file" }),
]);

describe("searchNodes", () => {
  it("matches names case-insensitively and skips non-matches", () => {
    const ids = searchNodes(nodes, "REPORT").map(r => r.node.id);
    expect(ids).not.toContain("note");
    expect(ids).toContain("reports");
    expect(ids).toContain("old-report");
  });

  it("excludes anything in the Trash, including nested descendants of a trashed folder", () => {
    const ids = searchNodes(nodes, "report").map(r => r.node.id);
    expect(ids).not.toContain("trashed-direct");
    expect(ids).not.toContain("trashed-nested");
  });

  it("ranks a prefix match above an interior-substring match", () => {
    const ids = searchNodes(nodes, "report").map(r => r.node.id);
    expect(ids.indexOf("reports")).toBeLessThan(ids.indexOf("old-report"));
  });

  it("returns nothing for an empty or whitespace-only query", () => {
    expect(searchNodes(nodes, "")).toEqual([]);
    expect(searchNodes(nodes, "   ")).toEqual([]);
  });

  it("caps results at the given limit", () => {
    expect(searchNodes(nodes, "report", 1)).toHaveLength(1);
  });

  it("labels each result with its ancestor path, root and the node itself excluded", () => {
    const result = searchNodes(nodes, "old-report")[0];
    expect(result.path).toBe("Home/Documents");
  });
});
