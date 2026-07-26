import type { FsNode } from "@/system/fs/types";
import { describe, expect, it } from "vitest";
import { indexNodes } from "@/system/fs/fsStore";
import { DOCUMENTS_ID, HOME_ID, ROOT_ID } from "@/system/fs/types";
import { pathString, resolveFolderPath } from "./breadcrumbPath";

function node(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name" | "type">): FsNode {
  return { createdAt: 0, modifiedAt: 0, ...partial };
}

const nodes = indexNodes([
  node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
  node({ id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder" }),
  node({ id: DOCUMENTS_ID, parentId: HOME_ID, name: "Documents", type: "folder" }),
  node({ id: "reports", parentId: DOCUMENTS_ID, name: "Reports", type: "folder" }),
  node({ id: "note", parentId: DOCUMENTS_ID, name: "note.md", type: "file" }),
]);

describe("pathString", () => {
  it("joins the path from root down to the node, dropping the synthetic root itself", () => {
    expect(pathString(nodes, "reports")).toBe("/Home/Documents/Reports");
  });

  it("renders the root itself as just \"/\"", () => {
    expect(pathString(nodes, ROOT_ID)).toBe("/");
  });
});

describe("resolveFolderPath", () => {
  it("resolves an absolute path to its folder id", () => {
    expect(resolveFolderPath(nodes, "/Home/Documents/Reports")).toBe("reports");
  });

  it("tolerates a missing leading slash and trailing slash", () => {
    expect(resolveFolderPath(nodes, "Home/Documents")).toBe(DOCUMENTS_ID);
    expect(resolveFolderPath(nodes, "/Home/Documents/")).toBe(DOCUMENTS_ID);
  });

  it("matches segment names case-insensitively", () => {
    expect(resolveFolderPath(nodes, "/home/DOCUMENTS")).toBe(DOCUMENTS_ID);
  });

  it("resolves the empty/root path to the root", () => {
    expect(resolveFolderPath(nodes, "")).toBe(ROOT_ID);
    expect(resolveFolderPath(nodes, "/")).toBe(ROOT_ID);
  });

  it("returns null for a path through a missing segment", () => {
    expect(resolveFolderPath(nodes, "/Home/Nope/Reports")).toBeNull();
  });

  it("returns null when the final segment is a file, not a folder", () => {
    expect(resolveFolderPath(nodes, "/Home/Documents/note.md")).toBeNull();
  });

  it("round-trips with pathString for every folder", () => {
    for (const id of [ROOT_ID, HOME_ID, DOCUMENTS_ID, "reports"])
      expect(resolveFolderPath(nodes, pathString(nodes, id))).toBe(id);
  });
});
