import type { FsNode } from "./types";
import { create } from "zustand";
import { createIdbAdapter } from "./idbAdapter";
import { createSeedNodes } from "./seed";
import { DOCUMENTS_ID, SYSTEM_IDS, TRASH_ID } from "./types";

const adapter = createIdbAdapter();

function logPersistError(error: unknown): void {
  console.error("[kagami-fs] persistence failed:", error);
}

/* ---------- pure tree helpers (exported for apps and tests) ---------- */

export type NodeMap = Record<string, FsNode>;

export function childrenOf(nodes: NodeMap, parentId: string): FsNode[] {
  return Object.values(nodes)
    .filter(n => n.parentId === parentId)
    .sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name, undefined, { numeric: true })
        : a.type === "folder" ? -1 : 1,
    );
}

/** Path from the root down to (and including) the node. */
export function pathOf(nodes: NodeMap, id: string): FsNode[] {
  const path: FsNode[] = [];
  let current: FsNode | undefined = nodes[id];
  while (current) {
    path.unshift(current);
    current = current.parentId ? nodes[current.parentId] : undefined;
  }
  return path;
}

export function isDescendantOf(nodes: NodeMap, id: string, ancestorId: string): boolean {
  let current = nodes[id];
  while (current?.parentId) {
    if (current.parentId === ancestorId)
      return true;
    current = nodes[current.parentId];
  }
  return false;
}

/** The node and everything beneath it. */
function subtreeIds(nodes: NodeMap, id: string): string[] {
  const ids = [id];
  for (const child of Object.values(nodes)) {
    if (child.parentId === id)
      ids.push(...subtreeIds(nodes, child.id));
  }
  return ids;
}

/** `desired`, or `desired 2`, `desired 3`, … if siblings collide. */
export function uniqueChildName(
  nodes: NodeMap,
  parentId: string,
  desired: string,
  excludeId?: string,
): string {
  const siblings = new Set(
    Object.values(nodes)
      .filter(n => n.parentId === parentId && n.id !== excludeId)
      .map(n => n.name.toLowerCase()),
  );
  if (!siblings.has(desired.toLowerCase()))
    return desired;
  const dot = desired.startsWith(".") ? -1 : desired.lastIndexOf(".");
  const stem = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${stem} ${i}${ext}`;
    if (!siblings.has(candidate.toLowerCase()))
      return candidate;
  }
}

export function isSystemNode(id: string): boolean {
  return SYSTEM_IDS.has(id);
}

/**
 * A name is addressable by the Terminal's path resolver only if it has no
 * `/` (which would read as a path separator) — reject those, plus blanks.
 * `rename` enforces this; UIs should pre-check to show a friendly toast.
 */
export function isValidNodeName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !trimmed.includes("/");
}

/* ---------- store ---------- */

export interface FsStore {
  nodes: NodeMap;
  ready: boolean;
  init: () => Promise<void>;
  createFolder: (parentId: string, name?: string) => FsNode;
  createFile: (parentId: string, name: string, content: string, mimeType?: string) => FsNode;
  updateFileContent: (id: string, content: string) => void;
  rename: (id: string, name: string) => void;
  /** Returns false when the move is invalid (into itself, a descendant, or a non-folder). */
  move: (id: string, newParentId: string) => boolean;
  moveToTrash: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  emptyTrash: () => void;
  deleteForever: (id: string) => void;
}

let initPromise: Promise<void> | null = null;

export const useFsStore = create<FsStore>()((set, get) => {
  /** Apply changed nodes to the map and persist them. */
  function commit(changed: FsNode[]): void {
    set((state) => {
      const nodes = { ...state.nodes };
      for (const node of changed)
        nodes[node.id] = node;
      return { nodes };
    });
    adapter.putMany(changed).catch(logPersistError);
  }

  function removeIds(ids: string[]): void {
    set((state) => {
      const nodes = { ...state.nodes };
      for (const id of ids)
        delete nodes[id];
      return { nodes };
    });
    adapter.removeMany(ids).catch(logPersistError);
  }

  return {
    nodes: {},
    ready: false,

    init() {
      initPromise ??= (async () => {
        let list: FsNode[] | null = null;
        try {
          list = await adapter.loadAll();
          if (!list) {
            list = createSeedNodes();
            await adapter.putMany(list);
          }
        }
        catch (error) {
          // Storage unavailable/corrupt: boot in-memory from the seed so the
          // OS still works this session rather than hanging on the spinner.
          logPersistError(error);
          list = createSeedNodes();
        }
        const nodes: NodeMap = {};
        for (const node of list)
          nodes[node.id] = node;
        set({ nodes, ready: true });
      })();
      return initPromise;
    },

    createFolder(parentId, name = "untitled folder") {
      const now = Date.now();
      const node: FsNode = {
        id: crypto.randomUUID(),
        parentId,
        name: uniqueChildName(get().nodes, parentId, name),
        type: "folder",
        createdAt: now,
        modifiedAt: now,
      };
      commit([node]);
      return node;
    },

    createFile(parentId, name, content, mimeType) {
      const now = Date.now();
      const node: FsNode = {
        id: crypto.randomUUID(),
        parentId,
        name: uniqueChildName(get().nodes, parentId, name),
        type: "file",
        mimeType,
        content,
        createdAt: now,
        modifiedAt: now,
      };
      commit([node]);
      return node;
    },

    updateFileContent(id, content) {
      const node = get().nodes[id];
      if (!node || node.type !== "file")
        return;
      commit([{ ...node, content, modifiedAt: Date.now() }]);
    },

    rename(id, name) {
      const node = get().nodes[id];
      const trimmed = name.trim();
      if (!node || !isValidNodeName(trimmed) || isSystemNode(id) || trimmed === node.name)
        return;
      const unique = uniqueChildName(get().nodes, node.parentId ?? "", trimmed, id);
      commit([{ ...node, name: unique, modifiedAt: Date.now() }]);
    },

    move(id, newParentId) {
      const { nodes } = get();
      const node = nodes[id];
      const target = nodes[newParentId];
      if (!node || !target || target.type !== "folder" || isSystemNode(id))
        return false;
      if (id === newParentId || node.parentId === newParentId)
        return false;
      if (isDescendantOf(nodes, newParentId, id))
        return false;
      if (newParentId === TRASH_ID) {
        get().moveToTrash(id);
        return true;
      }
      commit([{
        ...node,
        parentId: newParentId,
        name: uniqueChildName(nodes, newParentId, node.name, id),
        trashedFrom: undefined,
        modifiedAt: Date.now(),
      }]);
      return true;
    },

    moveToTrash(id) {
      const { nodes } = get();
      const node = nodes[id];
      if (!node || isSystemNode(id) || node.parentId === TRASH_ID)
        return;
      commit([{
        ...node,
        parentId: TRASH_ID,
        name: uniqueChildName(nodes, TRASH_ID, node.name, id),
        trashedFrom: node.parentId ?? undefined,
        modifiedAt: Date.now(),
      }]);
    },

    restoreFromTrash(id) {
      const { nodes } = get();
      const node = nodes[id];
      if (!node || node.parentId !== TRASH_ID)
        return;
      // Fall back to Documents when the original folder no longer exists
      // (or is itself sitting in the Trash — restoring into it would leave
      // the node stranded inside the Trash subtree).
      const from = node.trashedFrom;
      const home
        = from
          && nodes[from]
          && from !== TRASH_ID
          && !isDescendantOf(nodes, from, TRASH_ID)
          ? from
          : DOCUMENTS_ID;
      commit([{
        ...node,
        parentId: home,
        name: uniqueChildName(nodes, home, node.name, id),
        trashedFrom: undefined,
        modifiedAt: Date.now(),
      }]);
    },

    emptyTrash() {
      const { nodes } = get();
      const ids = childrenOf(nodes, TRASH_ID).flatMap(n => subtreeIds(nodes, n.id));
      removeIds(ids);
    },

    deleteForever(id) {
      const { nodes } = get();
      if (!nodes[id] || isSystemNode(id))
        return;
      removeIds(subtreeIds(nodes, id));
    },
  };
});

/** Test-only: clear state and the memoized init so `init()` runs fresh. */
export function __resetFsStoreForTest(): void {
  initPromise = null;
  useFsStore.setState({ nodes: {}, ready: false });
}

/** Build a `NodeMap` from a node list (handy for seeding tests). */
export function indexNodes(list: FsNode[]): NodeMap {
  const map: NodeMap = {};
  for (const node of list)
    map[node.id] = node;
  return map;
}
