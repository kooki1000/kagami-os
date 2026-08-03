import type { SortSpec } from "./fsStore";
import type { FsNode } from "./types";
import { beforeEach, describe, expect, it } from "vitest";
import { useNotificationStore } from "@/system/notifications/notificationStore";
import { blobStore } from "./blobStore";
import {
  cachedFolderSizes,
  childIdsByParent,
  childrenOf,
  expiredTrashIds,
  indexNodes,
  isDescendantOf,
  isValidNodeName,
  logPersistError,
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

  // T7: childrenOf was rewritten to look up childIdsByParent's index instead
  // of scanning every node in the map. This asserts the new, index-backed
  // implementation produces identical results to a naive full-scan
  // reimplementation of the old behavior, across every sort key/direction —
  // faster, not different.
  describe("childrenOf matches a naive full-scan reimplementation (T7)", () => {
    const DEFAULT_SORT_FOR_TEST: SortSpec = { key: "name", dir: "asc" };
    function naiveChildrenOf(nodes: ReturnType<typeof api>["nodes"], parentId: string, sort: SortSpec = DEFAULT_SORT_FOR_TEST) {
      return Object.values(nodes)
        .filter(n => n.parentId === parentId)
        .sort((a, b) => {
          if (a.type !== b.type)
            return a.type === "folder" ? -1 : 1;
          const primary = sort.key === "date"
            ? a.modifiedAt - b.modifiedAt
            : sort.key === "kind"
              ? (a.mimeType ?? "").localeCompare(b.mimeType ?? "", undefined, { numeric: true })
              : a.name.localeCompare(b.name, undefined, { numeric: true });
          const dirApplied = sort.dir === "desc" ? -primary : primary;
          return dirApplied || a.name.localeCompare(b.name, undefined, { numeric: true });
        });
    }

    it("for name/date/kind sort, both directions, on a mixed folder", () => {
      const map = indexNodes([
        node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
        node({ id: "f1", parentId: ROOT_ID, name: "Beta", type: "folder", modifiedAt: 10 }),
        node({ id: "f2", parentId: ROOT_ID, name: "Alpha", type: "folder", modifiedAt: 30 }),
        node({ id: "a", parentId: ROOT_ID, name: "a.txt", type: "file", mimeType: "text/plain", modifiedAt: 5 }),
        node({ id: "b", parentId: ROOT_ID, name: "b.png", type: "file", mimeType: "image/png", modifiedAt: 20 }),
        node({ id: "c", parentId: ROOT_ID, name: "c.md", type: "file", mimeType: "text/markdown", modifiedAt: 20 }),
      ]);
      for (const key of ["name", "date", "kind"] as const) {
        for (const dir of ["asc", "desc"] as const) {
          const sort = { key, dir };
          expect(childrenOf(map, ROOT_ID, sort).map(n => n.id)).toEqual(
            naiveChildrenOf(map, ROOT_ID, sort).map(n => n.id),
          );
        }
      }
    });

    it("returns an empty array for a folder with no children", () => {
      expect(childrenOf(api().nodes, "child")).toEqual([]);
    });
  });

  it("childIdsByParent caches its index per `nodes` identity, invalidating when the object changes", () => {
    const nodes = api().nodes;
    expect(childIdsByParent(nodes)).toBe(childIdsByParent(nodes));
    const other = { ...nodes };
    expect(childIdsByParent(other)).not.toBe(childIdsByParent(nodes));
  });

  // T7: childrenOf's own sorted result is cached per (nodes, parentId, sort)
  // identity, not just the parent-id index it's built from — repeat callers
  // for the same folder/sort (Desktop.tsx, siblingNav.ts, the Terminal
  // shell, FilesApp) share one array instead of each re-sorting.
  describe("childrenOf caches its sorted result per (nodes, parentId, sort) (T7)", () => {
    it("returns the same array instance for repeat calls with the same nodes/folder/sort", () => {
      const nodes = api().nodes;
      expect(childrenOf(nodes, DOCUMENTS_ID)).toBe(childrenOf(nodes, DOCUMENTS_ID));
    });

    it("invalidates when `nodes` identity changes", () => {
      const nodes = api().nodes;
      const first = childrenOf(nodes, DOCUMENTS_ID);
      const other = { ...nodes };
      expect(childrenOf(other, DOCUMENTS_ID)).not.toBe(first);
      // ...but is still equal in content, since nothing actually changed.
      expect(childrenOf(other, DOCUMENTS_ID).map(n => n.id)).toEqual(first.map(n => n.id));
    });

    it("caches per folder id — a different folder under the same `nodes` gets its own entry", () => {
      const nodes = api().nodes;
      expect(childrenOf(nodes, DOCUMENTS_ID)).not.toBe(childrenOf(nodes, "reports"));
    });

    it("caches per sort spec — a different sort under the same `nodes`/folder gets its own entry", () => {
      const nodes = api().nodes;
      const asc = childrenOf(nodes, DOCUMENTS_ID, { key: "name", dir: "asc" });
      const desc = childrenOf(nodes, DOCUMENTS_ID, { key: "name", dir: "desc" });
      expect(asc).not.toBe(desc);
    });
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

describe("setFileBlob (review-backlog #11)", () => {
  beforeEach(async () => {
    await blobStore.delete(await blobStore.listHashes());
  });

  it("writes the blob, clears inline content, and points contentRef at it", async () => {
    const before = get("note").modifiedAt;
    await api().setFileBlob("note", new Blob(["blob bytes"], { type: "text/plain" }));

    const node = get("note");
    expect(node.content).toBeUndefined();
    expect(node.contentRef).toMatchObject({ size: 10, mimeType: "text/plain" });
    expect(node.modifiedAt).toBeGreaterThanOrEqual(before);
    const stored = await blobStore.get(node.contentRef!.hash);
    expect(await stored?.text()).toBe("blob bytes");
  });

  it("falls back to the node's existing mime type when the blob has none", async () => {
    await api().setFileBlob("note", new Blob(["bytes"]));
    expect(get("note").contentRef?.mimeType).toBe("text/markdown");
  });

  it("sweeps the previous blob once no node references it any more", async () => {
    await api().setFileBlob("note", new Blob(["first"]));
    const firstHash = get("note").contentRef!.hash;
    expect(await blobStore.has(firstHash)).toBe(true);

    await api().setFileBlob("note", new Blob(["second, replacing the first"]));
    expect(await blobStore.has(firstHash)).toBe(false);
  });

  it("is a no-op for a missing id or a folder", async () => {
    await api().setFileBlob("does-not-exist", new Blob(["x"]));
    await api().setFileBlob(DOCUMENTS_ID, new Blob(["x"]));
    expect(get(DOCUMENTS_ID).type).toBe("folder");
  });
});

describe("setLabel (U14 color labels)", () => {
  it("sets a valid label", () => {
    api().setLabel("note", "red");
    expect(get("note").label).toBe("red");
  });

  it("clears a label when given undefined", () => {
    api().setLabel("note", "red");
    api().setLabel("note", undefined);
    expect(get("note").label).toBeUndefined();
  });

  it("rejects an unknown label id, leaving the node unlabeled", () => {
    api().setLabel("note", "chartreuse");
    expect(get("note").label).toBeUndefined();
  });

  it("does not bump modifiedAt — a label is metadata, not a content change", () => {
    const before = get("note").modifiedAt;
    api().setLabel("note", "blue");
    expect(get("note").modifiedAt).toBe(before);
  });

  it("no-ops on a missing node", () => {
    expect(() => api().setLabel("does-not-exist", "red")).not.toThrow();
  });
});

describe("childrenOf sorted by size", () => {
  function sizeOrder(parentId: string, dir: "asc" | "desc" = "asc"): string[] {
    return childrenOf(api().nodes, parentId, { key: "size", dir }).map(n => n.name);
  }

  it("orders files by their byte length", () => {
    const folder = api().createFolder(HOME_ID, "Sized");
    api().createFile(folder.id, "small.txt", "a");
    api().createFile(folder.id, "big.txt", "a".repeat(500));
    api().createFile(folder.id, "medium.txt", "a".repeat(50));
    expect(sizeOrder(folder.id)).toEqual(["small.txt", "medium.txt", "big.txt"]);
    expect(sizeOrder(folder.id, "desc")).toEqual(["big.txt", "medium.txt", "small.txt"]);
  });

  it("orders folders by their rolled-up subtree size, not as zero", () => {
    const root = api().createFolder(HOME_ID, "Roots");
    const light = api().createFolder(root.id, "Light");
    const heavy = api().createFolder(root.id, "Heavy");
    api().createFile(light.id, "a.txt", "x".repeat(10));
    api().createFile(heavy.id, "b.txt", "x".repeat(900));
    expect(sizeOrder(root.id)).toEqual(["Light", "Heavy"]);
    expect(sizeOrder(root.id, "desc")).toEqual(["Heavy", "Light"]);
  });

  it("keeps folders ahead of files regardless of size or direction", () => {
    const folder = api().createFolder(HOME_ID, "Mixed");
    api().createFolder(folder.id, "Empty");
    api().createFile(folder.id, "huge.txt", "x".repeat(5000));
    expect(sizeOrder(folder.id)).toEqual(["Empty", "huge.txt"]);
    expect(sizeOrder(folder.id, "desc")).toEqual(["Empty", "huge.txt"]);
  });

  it("breaks size ties by name ascending, like every other key", () => {
    const folder = api().createFolder(HOME_ID, "Ties");
    api().createFile(folder.id, "b.txt", "xx");
    api().createFile(folder.id, "a.txt", "xx");
    expect(sizeOrder(folder.id)).toEqual(["a.txt", "b.txt"]);
    expect(sizeOrder(folder.id, "desc")).toEqual(["a.txt", "b.txt"]);
  });
});

describe("cachedFolderSizes", () => {
  it("returns the same map instance within one nodes commit", () => {
    const nodes = api().nodes;
    expect(cachedFolderSizes(nodes)).toBe(cachedFolderSizes(nodes));
  });

  it("recomputes after a commit replaces the node map", () => {
    const before = cachedFolderSizes(api().nodes);
    api().createFile(HOME_ID, "new.txt", "hello");
    expect(cachedFolderSizes(api().nodes)).not.toBe(before);
  });

  it("agrees with what the size sort uses for a folder", () => {
    const folder = api().createFolder(HOME_ID, "Rollup");
    api().createFile(folder.id, "a.txt", "x".repeat(42));
    expect(cachedFolderSizes(api().nodes).get(folder.id)).toBe(42);
  });
});

describe("setIcon (custom node icons)", () => {
  it("sets a glyph and a tint together", () => {
    api().setIcon("note", "star", "blue");
    expect(get("note").iconGlyph).toBe("star");
    expect(get("note").iconTint).toBe("blue");
  });

  it("allows a glyph with no tint, and a tint with no glyph", () => {
    api().setIcon("note", "rocket", undefined);
    expect(get("note").iconGlyph).toBe("rocket");
    expect(get("note").iconTint).toBeUndefined();

    api().setIcon("note", undefined, "green");
    expect(get("note").iconGlyph).toBeUndefined();
    expect(get("note").iconTint).toBe("green");
  });

  it("clears both when given undefined twice — the picker's Reset", () => {
    api().setIcon("note", "star", "blue");
    api().setIcon("note", undefined, undefined);
    expect(get("note").iconGlyph).toBeUndefined();
    expect(get("note").iconTint).toBeUndefined();
  });

  it("rejects the whole call on an unknown glyph, rather than applying half of it", () => {
    api().setIcon("note", "spaceship", "blue");
    expect(get("note").iconGlyph).toBeUndefined();
    expect(get("note").iconTint).toBeUndefined();
  });

  it("rejects the whole call on an unknown tint", () => {
    api().setIcon("note", "star", "chartreuse");
    expect(get("note").iconGlyph).toBeUndefined();
    expect(get("note").iconTint).toBeUndefined();
  });

  it("does not bump modifiedAt — an icon is metadata, not a content change", () => {
    const before = get("note").modifiedAt;
    api().setIcon("note", "star", "blue");
    expect(get("note").modifiedAt).toBe(before);
  });

  it("no-ops on a missing node", () => {
    expect(() => api().setIcon("does-not-exist", "star", "blue")).not.toThrow();
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

describe("duplicate", () => {
  it("copies a file into another folder, leaving the original in place", () => {
    const copy = api().duplicate("note", "reports");
    expect(copy).not.toBeNull();
    expect(copy!.parentId).toBe("reports");
    expect(copy!.content).toBe("hi");
    expect(get("note").parentId).toBe(DOCUMENTS_ID);
  });

  it("dedupes the name when pasted back into its own folder", () => {
    const copy = api().duplicate("note", DOCUMENTS_ID);
    expect(copy!.name).toBe("note 2.md");
    expect(get("note").name).toBe("note.md");
  });

  it("deep-copies a folder's whole subtree with fresh ids", () => {
    const copy = api().duplicate("reports", HOME_ID);
    expect(copy!.name).toBe("Reports");
    const copiedChildren = childrenOf(api().nodes, copy!.id).map(n => n.name);
    expect(copiedChildren.sort()).toEqual(["Child", "deep.txt"]);
    const copiedChild = childrenOf(api().nodes, copy!.id).find(n => n.name === "Child")!;
    expect(copiedChild.id).not.toBe("child");
  });

  it("preserves a blob-backed file's contentRef (bytes are shared, not duplicated)", () => {
    useFsStore.setState({
      nodes: {
        ...api().nodes,
        blobbed: node({
          id: "blobbed",
          parentId: DOCUMENTS_ID,
          name: "photo.png",
          type: "file",
          contentRef: { hash: "h1", size: 10 },
        }),
      },
    });
    const copy = api().duplicate("blobbed", "reports");
    expect(copy!.contentRef).toEqual({ hash: "h1", size: 10 });
  });

  it("rejects copying a folder into its own descendant", () => {
    expect(api().duplicate("reports", "child")).toBeNull();
  });

  it("rejects copying into a non-folder", () => {
    expect(api().duplicate("reports", "note")).toBeNull();
  });

  it("rejects copying a folder into itself", () => {
    expect(api().duplicate("reports", "reports")).toBeNull();
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

describe("subtree collection at depth", () => {
  /** A single chain n0 → n1 → … under Documents. */
  function chain(depth: number): FsNode[] {
    const list: FsNode[] = [];
    for (let i = 0; i < depth; i++) {
      list.push(node({
        id: `chain-${i}`,
        parentId: i === 0 ? DOCUMENTS_ID : `chain-${i - 1}`,
        name: `level-${i}`,
        type: "folder",
      }));
    }
    return list;
  }

  it("deletes a deep subtree without exhausting the stack or going quadratic", () => {
    seed();
    const depth = 8000;
    useFsStore.setState({
      nodes: { ...useFsStore.getState().nodes, ...indexNodes(chain(depth)) },
    });

    api().deleteForever("chain-0");

    const remaining = Object.keys(api().nodes).filter(id => id.startsWith("chain-"));
    expect(remaining).toEqual([]);
    expect(api().nodes[DOCUMENTS_ID]).toBeDefined();
  });

  it("terminates on a corrupt parent cycle instead of hanging", () => {
    seed();
    // Unreachable normally, but a walk trusting the tree shape would hang.
    useFsStore.setState({
      nodes: {
        ...useFsStore.getState().nodes,
        reports: { ...useFsStore.getState().nodes.reports, parentId: "child" },
      },
    });

    expect(() => api().deleteForever("reports")).not.toThrow();
    expect(api().nodes.reports).toBeUndefined();
    expect(api().nodes.child).toBeUndefined();
  });
});

// review-backlog.md §17: a storage write failure used to be console-only —
// the in-memory store kept the change and the UI showed it as saved while
// the bytes never reached disk. logPersistError now also raises a
// danger-tone notification so the user finds out.
describe("logPersistError", () => {
  beforeEach(() => {
    useNotificationStore.setState({ items: [], toastIds: [], centerOpen: false });
  });

  it("gives actionable copy for a quota-exceeded failure", () => {
    logPersistError(new DOMException("quota", "QuotaExceededError"));

    const [notification] = useNotificationStore.getState().items;
    expect(notification).toMatchObject({ tone: "danger", title: "Storage is full" });
    expect(notification.body).toMatch(/trash|large files/i);
  });

  it("gives a generic message for any other failure", () => {
    logPersistError(new Error("network blip"));

    const [notification] = useNotificationStore.getState().items;
    expect(notification).toMatchObject({ tone: "danger" });
    expect(notification.title).not.toBe("Storage is full");
  });
});

describe("replaceAll (export/import's wipe-then-restore)", () => {
  beforeEach(async () => {
    await blobStore.delete(await blobStore.listHashes());
  });

  it("replaces the whole node set, dropping everything not in the new tree", async () => {
    // seed()'s "note"/"deep"/"reports"/"child" nodes should all be gone
    // after a replace that doesn't mention them.
    const next: FsNode[] = [
      node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
      node({ id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder" }),
      node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
      node({ id: "fresh", parentId: HOME_ID, name: "fresh.txt", type: "file", content: "new disk" }),
    ];
    await api().replaceAll(next, []);

    expect(Object.keys(api().nodes).sort()).toEqual([HOME_ID, ROOT_ID, TRASH_ID, "fresh"].sort());
    expect(get("fresh")?.content).toBe("new disk");
    expect(get("note")).toBeUndefined();
    expect(get("reports")).toBeUndefined();
  });

  it("writes the given blobs and drops blobs the new tree no longer references", async () => {
    // Old disk has a blob-backed file...
    await blobStore.put("old-hash", new Blob(["old bytes"]));
    useFsStore.setState({
      nodes: indexNodes([
        ...Object.values(api().nodes),
        node({ id: "old-blob-file", parentId: DOCUMENTS_ID, name: "old.bin", type: "file", contentRef: { hash: "old-hash", size: 9 } }),
      ]),
    });

    const bytes = new TextEncoder().encode("new blob bytes");
    const next: FsNode[] = [
      node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
      node({ id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder" }),
      node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
      node({ id: "new-blob-file", parentId: HOME_ID, name: "new.bin", type: "file", contentRef: { hash: "new-hash", size: bytes.byteLength } }),
    ];
    await api().replaceAll(next, [{ hash: "new-hash", bytes, mimeType: "application/octet-stream" }]);

    expect(await blobStore.has("new-hash")).toBe(true);
    expect(await blobStore.has("old-hash")).toBe(false);
    const stored = await blobStore.get("new-hash");
    expect(await stored?.text()).toBe("new blob bytes");
  });
});
