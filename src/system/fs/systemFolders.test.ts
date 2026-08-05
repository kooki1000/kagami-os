import type { FsNode } from "./types";
import { describe, expect, it } from "vitest";
import { indexNodes } from "./fsStore";
import { ensureAppsFolder } from "./systemFolders";
import { APPS_ID, ROOT_ID } from "./types";

function node(partial: Partial<FsNode> & Pick<FsNode, "id">): FsNode {
  return {
    parentId: ROOT_ID,
    name: partial.id,
    type: "folder",
    createdAt: 0,
    modifiedAt: 0,
    ...partial,
  };
}

describe("ensureAppsFolder", () => {
  it("returns a new Apps folder under root when the tree predates it", () => {
    const nodes = indexNodes([node({ id: ROOT_ID, parentId: null }), node({ id: "home" })]);
    const result = ensureAppsFolder(nodes, 1000);
    expect(result).toMatchObject({ id: APPS_ID, parentId: ROOT_ID, name: "Apps", type: "folder", createdAt: 1000, modifiedAt: 1000 });
  });

  it("is idempotent: returns null when the Apps folder already exists", () => {
    const nodes = indexNodes([
      node({ id: ROOT_ID, parentId: null }),
      node({ id: APPS_ID, name: "Apps" }),
    ]);
    expect(ensureAppsFolder(nodes, 1000)).toBeNull();
  });
});
