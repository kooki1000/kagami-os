import type { FsNode } from "./types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  childrenOf,
  expiredTrashIds,
  indexNodes,
  isDescendantOf,
  isValidNodeName,
  pathOf,
  TRASH_MAX_AGE_MS,
  uniqueChildName,
  useFsStore,
} from "./fsStore";
import {
  DOCUMENTS_ID,
  HOME_ID,
  ROOT_ID,
  TRASH_ID,
} from "./types";

function node(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name" | "type">): FsNode {
  return { createdAt: 0, modifiedAt: 0, ...partial };
}

/** Small deterministic tree with known ids. */
function seed(): void {
  const nodes = indexNodes([
    node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
    node({ id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder" }),
    node({ id: DOCUMENTS_ID, parentId: HOME_ID, name: "Documents", type: "folder" }),
    node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
    node({ id: "reports", parentId: DOCUMENTS_ID, name: "Reports", type: "folder" }),
    node({ id: "child", parentId: "reports", name: "Child", type: "folder" }),
    node({ id: "note", parentId: DOCUMENTS_ID, name: "note.md", type: "file", mimeType: "text/markdown", content: "hi" }),
    node({ id: "deep", parentId: "reports", name: "deep.txt", type: "file", mimeType: "text/plain" }),
  ]);
  useFsStore.setState({ nodes, ready: true });
}

const api = () => useFsStore.getState();
const get = (id: string) => api().nodes[id];

beforeEach(seed);

describe("tree helpers", () => {
  it("childrenOf lists folders before files, each alphabetical", () => {
    api().createFolder(DOCUMENTS_ID, "Archive");
    const names = childrenOf(api().nodes, DOCUMENTS_ID).map(n => n.name);
    expect(names).toEqual(["Archive", "Reports", "note.md"]);
  });

  it("childrenOf sorts by name descending while keeping folders first", () => {
    api().createFolder(DOCUMENTS_ID, "Archive");
    const names = childrenOf(api().nodes, DOCUMENTS_ID, { key: "name", dir: "desc" }).map(n => n.name);
    // Folders (Reports, Archive) still precede files, but each group reversed.
    expect(names).toEqual(["Reports", "Archive", "note.md"]);
  });

  it("childrenOf sorts by date, tie-breaking on name", () => {
    const map = indexNodes([
      node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
      node({ id: "a", parentId: ROOT_ID, name: "a.txt", type: "file", modifiedAt: 300 }),
      node({ id: "b", parentId: ROOT_ID, name: "b.txt", type: "file", modifiedAt: 100 }),
      node({ id: "c", parentId: ROOT_ID, name: "c.txt", type: "file", modifiedAt: 100 }),
    ]);
    useFsStore.setState({ nodes: map, ready: true });
    expect(childrenOf(map, ROOT_ID, { key: "date", dir: "asc" }).map(n => n.id)).toEqual(["b", "c", "a"]);
    expect(childrenOf(map, ROOT_ID, { key: "date", dir: "desc" }).map(n => n.id)).toEqual(["a", "b", "c"]);
  });

  it("childrenOf sorts by kind (mime type), tie-breaking on name", () => {
    const map = indexNodes([
      node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
      node({ id: "pic", parentId: ROOT_ID, name: "pic.png", type: "file", mimeType: "image/png" }),
      node({ id: "doc", parentId: ROOT_ID, name: "doc.md", type: "file", mimeType: "text/markdown" }),
      node({ id: "txt", parentId: ROOT_ID, name: "txt.txt", type: "file", mimeType: "text/markdown" }),
    ]);
    // image/* before text/*; within text/markdown, name order.
    expect(childrenOf(map, ROOT_ID, { key: "kind", dir: "asc" }).map(n => n.id)).toEqual(["pic", "doc", "txt"]);
  });

  it("pathOf returns the chain from root to the node", () => {
    expect(pathOf(api().nodes, "deep").map(n => n.id)).toEqual([
      ROOT_ID,
      HOME_ID,
      DOCUMENTS_ID,
      "reports",
      "deep",
    ]);
  });

  it("isDescendantOf detects nested membership", () => {
    expect(isDescendantOf(api().nodes, "deep", DOCUMENTS_ID)).toBe(true);
    expect(isDescendantOf(api().nodes, DOCUMENTS_ID, "deep")).toBe(false);
  });

  it("uniqueChildName suffixes on collision, preserving extension", () => {
    expect(uniqueChildName(api().nodes, DOCUMENTS_ID, "Reports")).toBe("Reports 2");
    expect(uniqueChildName(api().nodes, DOCUMENTS_ID, "note.md")).toBe("note 2.md");
    expect(uniqueChildName(api().nodes, DOCUMENTS_ID, "fresh.md")).toBe("fresh.md");
  });
});

describe("create + rename", () => {
  it("createFolder places a uniquely-named folder under the parent", () => {
    const folder = api().createFolder(DOCUMENTS_ID, "Reports");
    expect(folder.parentId).toBe(DOCUMENTS_ID);
    expect(folder.name).toBe("Reports 2");
    expect(get(folder.id).type).toBe("folder");
  });

  it("createFile stores content and mime type", () => {
    const file = api().createFile(DOCUMENTS_ID, "todo.md", "list", "text/markdown");
    expect(get(file.id)).toMatchObject({ content: "list", mimeType: "text/markdown", type: "file" });
  });

  it("updateFileContent replaces content and bumps modifiedAt", () => {
    const before = get("note").modifiedAt;
    api().updateFileContent("note", "changed");
    expect(get("note").content).toBe("changed");
    expect(get("note").modifiedAt).toBeGreaterThanOrEqual(before);
  });

  it("rename dedupes against siblings and ignores system folders", () => {
    api().rename("note", "Reports");
    expect(get("note").name).toBe("Reports 2");
    api().rename(DOCUMENTS_ID, "Papers");
    expect(get(DOCUMENTS_ID).name).toBe("Documents");
  });

  it("rename ignores empty names", () => {
    api().rename("note", "   ");
    expect(get("note").name).toBe("note.md");
  });

  it("rename rejects names containing a slash (keeps nodes Terminal-addressable)", () => {
    api().rename("note", "a/b.md");
    expect(get("note").name).toBe("note.md");
    expect(isValidNodeName("a/b.md")).toBe(false);
    expect(isValidNodeName("valid name.md")).toBe(true);
    expect(isValidNodeName("   ")).toBe(false);
  });
});

describe("move", () => {
  it("moves a node into another folder", () => {
    expect(api().move("note", "reports")).toBe(true);
    expect(get("note").parentId).toBe("reports");
  });

  it("rejects moving a folder into its own descendant", () => {
    expect(api().move("reports", "child")).toBe(false);
    expect(get("reports").parentId).toBe(DOCUMENTS_ID);
  });

  it("rejects moving into a non-folder", () => {
    expect(api().move("reports", "note")).toBe(false);
  });

  it("rejects moving a system folder", () => {
    expect(api().move(DOCUMENTS_ID, "reports")).toBe(false);
  });

  it("routes a move into Trash through the trash flow", () => {
    expect(api().move("note", TRASH_ID)).toBe(true);
    expect(get("note").parentId).toBe(TRASH_ID);
    expect(get("note").trashedFrom).toBe(DOCUMENTS_ID);
  });
});

describe("trash lifecycle", () => {
  it("moveToTrash records the original parent", () => {
    api().moveToTrash("note");
    expect(get("note").parentId).toBe(TRASH_ID);
    expect(get("note").trashedFrom).toBe(DOCUMENTS_ID);
  });

  it("does not trash system folders", () => {
    api().moveToTrash(DOCUMENTS_ID);
    expect(get(DOCUMENTS_ID).parentId).toBe(HOME_ID);
  });

  it("restoreFromTrash returns a node to where it came from", () => {
    api().moveToTrash("note");
    api().restoreFromTrash("note");
    expect(get("note").parentId).toBe(DOCUMENTS_ID);
    expect(get("note").trashedFrom).toBeUndefined();
  });

  it("restores to Documents when the original parent now sits in the Trash", () => {
    api().moveToTrash("deep"); // trashedFrom = "reports"
    api().moveToTrash("reports");
    api().restoreFromTrash("deep");
    expect(get("deep").parentId).toBe(DOCUMENTS_ID);
  });

  it("restores to Documents when the original parent is gone", () => {
    useFsStore.setState(state => ({
      nodes: {
        ...state.nodes,
        note: { ...state.nodes.note, parentId: TRASH_ID, trashedFrom: "ghost" },
      },
    }));
    api().restoreFromTrash("note");
    expect(get("note").parentId).toBe(DOCUMENTS_ID);
  });

  it("emptyTrash permanently removes trashed items and their subtrees", () => {
    api().moveToTrash("reports"); // folder with child + deep.txt
    api().emptyTrash();
    expect(get("reports")).toBeUndefined();
    expect(get("child")).toBeUndefined();
    expect(get("deep")).toBeUndefined();
  });

  it("deleteForever removes a subtree but never a system folder", () => {
    api().deleteForever("reports");
    expect(get("reports")).toBeUndefined();
    expect(get("deep")).toBeUndefined();
    api().deleteForever(DOCUMENTS_ID);
    expect(get(DOCUMENTS_ID)).toBeDefined();
  });

  it("expiredTrashIds picks only trash items older than the horizon, with subtrees", () => {
    const now = 1_000_000_000_000;
    const map = indexNodes([
      node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
      node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
      // Trashed 40 days ago (expired) — a folder with a child.
      node({ id: "old", parentId: TRASH_ID, name: "old", type: "folder", modifiedAt: now - 40 * 864e5 }),
      node({ id: "oldChild", parentId: "old", name: "c.txt", type: "file", modifiedAt: now - 40 * 864e5 }),
      // Trashed 5 days ago (fresh).
      node({ id: "recent", parentId: TRASH_ID, name: "recent.txt", type: "file", modifiedAt: now - 5 * 864e5 }),
    ]);
    const ids = expiredTrashIds(map, TRASH_MAX_AGE_MS, now).sort();
    expect(ids).toEqual(["old", "oldChild"]);
  });

  it("purgeExpiredTrash removes expired items and leaves fresh ones", () => {
    const now = Date.now();
    const map = indexNodes([
      node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
      node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
      node({ id: "stale", parentId: TRASH_ID, name: "stale.txt", type: "file", modifiedAt: now - 31 * 864e5 }),
      node({ id: "fresh", parentId: TRASH_ID, name: "fresh.txt", type: "file", modifiedAt: now - 1 * 864e5 }),
    ]);
    useFsStore.setState({ nodes: map, ready: true });
    const removed = api().purgeExpiredTrash();
    expect(removed).toBe(1);
    expect(get("stale")).toBeUndefined();
    expect(get("fresh")).toBeDefined();
  });
});
