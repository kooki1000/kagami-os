import type { FsNode } from "./types";
import { create } from "zustand";
import { sweepUnreferencedBlobs } from "./blobGc";
import { hashBlob } from "./blobHash";
import { migrateInlineBlobs } from "./blobMigration";
import { blobStore } from "./blobStore";
import { createIdbAdapter } from "./idbAdapter";
import { createSeedNodes } from "./seed";
import { DOCUMENTS_ID, SYSTEM_IDS, TRASH_ID } from "./types";

const adapter = createIdbAdapter();

function logPersistError(error: unknown): void {
  console.error("[kagami-fs] persistence failed:", error);
}

/* ---------- pure tree helpers (exported for apps and tests) ---------- */

export type NodeMap = Record<string, FsNode>;

export type SortKey = "name" | "date" | "kind";
export type SortDir = "asc" | "desc";
export interface SortSpec {
  key: SortKey;
  dir: SortDir;
}

/** Folders-first, name ascending — matches how listings looked pre-sort. */
export const DEFAULT_SORT: SortSpec = { key: "name", dir: "asc" };

// One shared collator, reused across every comparison. `String.localeCompare`
// spins up a fresh collator per call, which dominated `childrenOf` at scale
// (~147 ms vs ~3.5 ms for the numeric-only date sort on 10k nodes — see
// docs/perf-baseline.md). Reusing it keeps identical ordering, far cheaper.
const collator = new Intl.Collator(undefined, { numeric: true });

function byName(a: FsNode, b: FsNode): number {
  return collator.compare(a.name, b.name);
}

/**
 * Compare two same-type siblings on the sort key alone (no tie-break).
 * Kind sorts by mime type — the store stays app-agnostic; the Files kind
 * labels are a presentation concern.
 */
function byKey(a: FsNode, b: FsNode, key: SortKey): number {
  switch (key) {
    case "date":
      return a.modifiedAt - b.modifiedAt;
    case "kind":
      return collator.compare(a.mimeType ?? "", b.mimeType ?? "");
    case "name":
      return byName(a, b);
  }
}

/**
 * One folder's children. Folders always precede files (the desktop
 * convention); `sort` orders within each group. Direction applies to the
 * key only — ties always resolve by name ascending, so reversing the order
 * doesn't scramble same-key items.
 */
export function childrenOf(
  nodes: NodeMap,
  parentId: string,
  sort: SortSpec = DEFAULT_SORT,
): FsNode[] {
  return Object.values(nodes)
    .filter(n => n.parentId === parentId)
    .sort((a, b) => {
      if (a.type !== b.type)
        return a.type === "folder" ? -1 : 1;
      const primary = byKey(a, b, sort.key);
      return (sort.dir === "desc" ? -primary : primary) || byName(a, b);
    });
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

/** Default horizon for auto-emptying the Trash: 30 days. */
export const TRASH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ids of trashed items (and their subtrees) trashed longer ago than
 * `maxAgeMs`. `modifiedAt` is stamped when a node is moved to Trash, so it
 * doubles as the trashed-at time. Pure — unit-tested without the store.
 */
export function expiredTrashIds(
  nodes: NodeMap,
  maxAgeMs: number,
  now: number = Date.now(),
): string[] {
  const cutoff = now - maxAgeMs;
  return childrenOf(nodes, TRASH_ID)
    .filter(n => n.modifiedAt <= cutoff)
    .flatMap(n => subtreeIds(nodes, n.id));
}

/* ---------- store ---------- */

export interface FsStore {
  nodes: NodeMap;
  ready: boolean;
  init: () => Promise<void>;
  createFolder: (parentId: string, name?: string) => FsNode;
  createFile: (parentId: string, name: string, content: string, mimeType?: string) => FsNode;
  /**
   * Create a file whose bytes live in the blob store (B1) — the path uploads
   * (B2) and other binary producers use. Content-addressed, so identical
   * bytes are stored once. Async: the blob is durably written before the node
   * that references it is committed.
   */
  createBlobFile: (parentId: string, name: string, blob: Blob, mimeType?: string) => Promise<FsNode>;
  updateFileContent: (id: string, content: string) => void;
  rename: (id: string, name: string) => void;
  /** Returns false when the move is invalid (into itself, a descendant, or a non-folder). */
  move: (id: string, newParentId: string) => boolean;
  /**
   * Deep-copy a node (and, for a folder, its whole subtree) under
   * `targetParentId` — the paste half of B5's clipboard. Blob-backed files
   * keep their `contentRef` (content-addressed, so the copy shares bytes
   * with the original rather than duplicating them). Returns null when the
   * copy would be invalid (into itself or a descendant, or a non-folder
   * target) rather than creating a partial subtree.
   */
  duplicate: (id: string, targetParentId: string) => FsNode | null;
  moveToTrash: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  emptyTrash: () => void;
  deleteForever: (id: string) => void;
  /** Permanently remove trash items older than `maxAgeMs`; returns the count. */
  purgeExpiredTrash: (maxAgeMs?: number) => number;
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
    // GC: a removed node's blob (if any) may now be unreferenced. Sweeping
    // after every removal, rather than only on emptyTrash, also catches
    // purgeExpiredTrash's auto-empty and deleteForever on a single item.
    sweepUnreferencedBlobs(get().nodes, blobStore).catch(logPersistError);
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

        // B1 migration: move any oversized inline data-URL bytes into the
        // blob store. Idempotent, and isolated so a failure never blocks boot.
        try {
          const migrated = await migrateInlineBlobs(nodes, blobStore);
          if (migrated.length > 0) {
            for (const node of migrated)
              nodes[node.id] = node;
            await adapter.putMany(migrated);
          }
        }
        catch (error) {
          logPersistError(error);
        }

        set({ nodes, ready: true });

        // Idle-time GC: catches orphan blobs from edge cases the removeIds
        // sweep can't see (e.g. a blob write that completed just before a
        // crash interrupted the node commit that would have referenced it).
        // Fire-and-forget — never blocks boot.
        sweepUnreferencedBlobs(nodes, blobStore).catch(logPersistError);
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

    async createBlobFile(parentId, name, blob, mimeType = blob.type || undefined) {
      // Hash first, store the bytes (skipping the write when an identical
      // blob already exists), then commit the node — blob-before-node so a
      // failure can only leave an orphan blob, never a dangling reference.
      const hash = await hashBlob(blob);
      if (!(await blobStore.has(hash)))
        await blobStore.put(hash, blob);
      const now = Date.now();
      const node: FsNode = {
        id: crypto.randomUUID(),
        parentId,
        name: uniqueChildName(get().nodes, parentId, name),
        type: "file",
        mimeType,
        contentRef: { hash, size: blob.size, mimeType },
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

    duplicate(id, targetParentId) {
      const { nodes } = get();
      const source = nodes[id];
      const target = nodes[targetParentId];
      if (!source || !target || target.type !== "folder")
        return null;
      if (id === targetParentId || isDescendantOf(nodes, targetParentId, id))
        return null;

      const now = Date.now();
      const newNodes: FsNode[] = [];
      function clone(node: FsNode, parentId: string): FsNode {
        const copy: FsNode = {
          ...node,
          id: crypto.randomUUID(),
          parentId,
          name: uniqueChildName(nodes, parentId, node.name),
          createdAt: now,
          modifiedAt: now,
          trashedFrom: undefined,
        };
        newNodes.push(copy);
        if (node.type === "folder") {
          for (const child of childrenOf(nodes, node.id))
            clone(child, copy.id);
        }
        return copy;
      }
      const root = clone(source, targetParentId);
      commit(newNodes);
      return root;
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

    purgeExpiredTrash(maxAgeMs = TRASH_MAX_AGE_MS) {
      const ids = expiredTrashIds(get().nodes, maxAgeMs);
      if (ids.length)
        removeIds(ids);
      return ids.length;
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
