import type { FsNode } from "./types";
import { create } from "zustand";
import { nameStem } from "@/lib/format";
import { notify } from "@/system/notifications/notificationStore";
import { isTauri } from "../platform";
import { sweepUnreferencedBlobs } from "./blobGc";
import { hashBlob } from "./blobHash";
import { migrateInlineBlobs } from "./blobMigration";
import { blobStore } from "./blobStore";
import { createIdbAdapter } from "./idbAdapter";
import { isValidNodeIcon } from "./nodeIcons";
import { isValidNodeLabel } from "./nodeLabels";
import { createSeedNodes } from "./seed";
import { ensureAppsFolder } from "./systemFolders";
import { createTauriAdapter } from "./tauriAdapter";
import { DOCUMENTS_ID, SYSTEM_IDS, TRASH_ID } from "./types";

const adapter = isTauri() ? createTauriAdapter() : createIdbAdapter();

/**
 * Every persistence call below is fire-and-forget, so a write failure had
 * nowhere to surface but the console (review-backlog.md §17) — notify the
 * user too, with actionable copy for quota exhaustion. Exported for direct
 * unit testing.
 */
export function logPersistError(error: unknown): void {
  console.error("[kagami-fs] persistence failed:", error);
  const quotaExceeded = error instanceof DOMException && error.name === "QuotaExceededError";
  notify({
    title: quotaExceeded ? "Storage is full" : "Couldn't save your changes",
    body: quotaExceeded
      ? "Empty the Trash or remove large files, then try again."
      : "Your change may not survive a reload. Try again in a moment.",
    tone: "danger",
  });
}

/* ---------- pure tree helpers (exported for apps and tests) ---------- */

export type NodeMap = Record<string, FsNode>;

export type SortKey = "name" | "date" | "kind" | "size";
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
// Exported so other name-sorting call sites (e.g. searchNodes.ts) share it
// too, rather than each spinning up their own.
export const collator = new Intl.Collator(undefined, { numeric: true });

function byName(a: FsNode, b: FsNode): number {
  return collator.compare(a.name, b.name);
}

/**
 * Compare two same-type siblings on the sort key alone (no tie-break).
 * Kind sorts by mime type — the store stays app-agnostic; the Files kind
 * labels are a presentation concern.
 *
 * `sizeOf` is supplied only for the "size" key, so the folder-rollup pass it
 * needs is never computed for the three keys that don't.
 */
function byKey(a: FsNode, b: FsNode, key: SortKey, sizeOf?: (node: FsNode) => number): number {
  switch (key) {
    case "date":
      return a.modifiedAt - b.modifiedAt;
    case "kind":
      return collator.compare(a.mimeType ?? "", b.mimeType ?? "");
    case "size":
      // Folders compare on their rolled-up subtree size — the same number the
      // Size column and Get Info print — so sorting by size doesn't silently
      // treat every folder as zero.
      return (sizeOf?.(a) ?? 0) - (sizeOf?.(b) ?? 0);
    case "name":
      return byName(a, b);
  }
}

// T7: `childrenOf`'s own map/sort result, cached per `(nodes, parentId,
// sort)` identity — not just the parent-id index above. Several call sites
// (Desktop.tsx, siblingNav.ts, the Terminal shell, FilesApp's own render)
// call `childrenOf` for the same folder/sort within a single `nodes`
// commit, each of which would otherwise re-map-and-sort independently even
// though `useMemo` at any *one* call site can't help the others share the
// work. Keyed the same way as `childIdsByParentCache` (a `WeakMap` on
// `nodes` identity, which every commit replaces wholesale), so it
// self-invalidates for free and can never serve a stale entry.
const childrenOfCache = new WeakMap<NodeMap, Map<string, FsNode[]>>();

function childrenOfCacheKey(parentId: string, sort: SortSpec): string {
  return `${parentId}|${sort.key}|${sort.dir}`;
}

/**
 * One folder's children. Folders always precede files (the desktop
 * convention); `sort` orders within each group. Direction applies to the
 * key only — ties always resolve by name ascending, so reversing the order
 * doesn't scramble same-key items.
 *
 * T7: looks the folder's child ids up in {@link childIdsByParent}'s index
 * instead of scanning every node in the map — a full-map `Object.values`
 * scan cost the same whether the folder held 5 items or 5,000. The index
 * itself is cached per `nodes` identity (see there); this function's own
 * sorted result is additionally cached per `(nodes, parentId, sort)` (see
 * `childrenOfCache` above), so repeat callers for the same folder/sort
 * within one `nodes` commit share one sort instead of each re-deriving it.
 */
export function childrenOf(
  nodes: NodeMap,
  parentId: string,
  sort: SortSpec = DEFAULT_SORT,
): FsNode[] {
  let perNodes = childrenOfCache.get(nodes);
  if (!perNodes) {
    perNodes = new Map();
    childrenOfCache.set(nodes, perNodes);
  }
  const key = childrenOfCacheKey(parentId, sort);
  const cached = perNodes.get(key);
  if (cached)
    return cached;

  const ids = childIdsByParent(nodes).get(parentId) ?? [];
  // Only the "size" key pays for the rollup pass, and `cachedFolderSizes`
  // makes it once per `nodes` commit however many folders are being sorted.
  const sizes = sort.key === "size" ? cachedFolderSizes(nodes) : undefined;
  const sizeOf = sizes
    ? (node: FsNode) => (node.type === "folder" ? (sizes.get(node.id) ?? 0) : fileBytes(node))
    : undefined;
  const result = ids
    .map(id => nodes[id])
    .filter((n): n is FsNode => !!n)
    .sort((a, b) => {
      if (a.type !== b.type)
        return a.type === "folder" ? -1 : 1;
      const primary = byKey(a, b, sort.key, sizeOf);
      return (sort.dir === "desc" ? -primary : primary) || byName(a, b);
    });
  perNodes.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Node sizes (B8)
//
// Store-level, not app-level: `childrenOf`'s "size" sort needs them, and
// keeping one implementation stops the sorted order and the size the Files
// app prints from ever disagreeing. `fileMeta.ts` re-exports these for the
// app's existing call sites.
// ---------------------------------------------------------------------------

const byteLength = new TextEncoder();

/** A file's size in bytes: `contentRef.size` (already bytes, B1) or the inline string's UTF-8 byte length. Folders have no bytes of their own — see {@link folderSizes}. */
export function fileBytes(node: FsNode): number {
  if (node.contentRef)
    return node.contentRef.size;
  return node.content ? byteLength.encode(node.content).length : 0;
}

/**
 * Every folder's size (B8) — the recursive byte sum of its children — in one
 * linear pass over the whole node map, instead of each folder re-scanning
 * `nodes` and recursing individually (the old `O(k · n)` `nodeSize` visibly
 * stuttered the marquee and filter input at a few thousand nodes). Same
 * traversal shape as `fsStore.ts`'s `collectSubtrees`: a shared
 * `globallySeen` set means every node is visited once in total, which also
 * makes a corrupt `parentId` cycle terminate instead of overflowing the
 * stack.
 */
export function folderSizes(nodes: NodeMap): Map<string, number> {
  const childIds = childIdsByParent(nodes);
  const sizes = new Map<string, number>();
  const globallySeen = new Set<string>();

  for (const node of Object.values(nodes)) {
    if (node.type !== "folder" || globallySeen.has(node.id))
      continue;

    // Iterative post-order: push each folder onto `toVisit`, record it into
    // `finished` on first pop, and push its unvisited folder children.
    // Reversing `finished` puts every child before its parent, so the
    // summing pass below can trust a child's size is already in `sizes`.
    const toVisit = [node.id];
    globallySeen.add(node.id);
    const finished: string[] = [];
    while (toVisit.length > 0) {
      const id = toVisit.pop()!;
      finished.push(id);
      for (const childId of childIds.get(id) ?? []) {
        if (globallySeen.has(childId))
          continue;
        const child = nodes[childId];
        if (child?.type === "folder") {
          globallySeen.add(childId);
          toVisit.push(childId);
        }
      }
    }
    finished.reverse();

    for (const id of finished) {
      let total = 0;
      for (const childId of childIds.get(id) ?? []) {
        const child = nodes[childId];
        if (!child)
          continue;
        total += child.type === "folder" ? (sizes.get(childId) ?? 0) : fileBytes(child);
      }
      sizes.set(id, total);
    }
  }

  return sizes;
}

/**
 * Size in bytes (B8) for one node — files are O(1); folders delegate to
 * {@link folderSizes}' single linear pass (still far cheaper than the old
 * per-call recursion even uncached, since it's one pass over `nodes`
 * regardless of which folder is asked for). Fine for a one-off lookup like
 * the Get Info panel; a view rendering many rows should compute
 * `folderSizes(nodes)` once (`useMemo`) and read the map directly instead of
 * calling this per row.
 */
export function nodeSize(nodes: NodeMap, node: FsNode): number {
  if (node.type === "folder")
    return folderSizes(nodes).get(node.id) ?? 0;
  return fileBytes(node);
}

/**
 * `folderSizes`' result, cached per `nodes` identity — the same WeakMap idiom
 * as `childrenOfCache` above, and for the same reason: a "sort by size"
 * listing, the status bar's selection total and Get Info would each otherwise
 * kick off their own full pass within a single commit.
 */
const folderSizesCache = new WeakMap<NodeMap, Map<string, number>>();

/** {@link folderSizes}, memoized for the lifetime of a `nodes` commit. */
export function cachedFolderSizes(nodes: NodeMap): Map<string, number> {
  let cached = folderSizesCache.get(nodes);
  if (!cached) {
    cached = folderSizes(nodes);
    folderSizesCache.set(nodes, cached);
  }
  return cached;
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

// T7: every commit replaces `nodes` with a fresh object (see `commit`/
// `removeIds` below), so a `WeakMap` keyed on that identity is a correct,
// self-invalidating cache — the same `nodes` reference always yields the
// same index, and a stale entry can never outlive the map it was built from.
const childIdsByParentCache = new WeakMap<NodeMap, Map<string, string[]>>();

/** parentId → child ids, built in one pass over the map. Cached per `nodes` identity — see above. */
export function childIdsByParent(nodes: NodeMap): Map<string, string[]> {
  const cached = childIdsByParentCache.get(nodes);
  if (cached)
    return cached;

  const index = new Map<string, string[]>();
  for (const node of Object.values(nodes)) {
    if (node.parentId === null)
      continue;
    const siblings = index.get(node.parentId);
    if (siblings)
      siblings.push(node.id);
    else index.set(node.parentId, [node.id]);
  }
  childIdsByParentCache.set(nodes, index);
  return index;
}

/**
 * `rootIds` and everything beneath them, de-duplicated. Indexing children once
 * keeps this linear rather than quadratic; iterating (with `seen`) means deep
 * trees and corrupt parent cycles terminate instead of overflowing the stack.
 * Callers use the result as a removal set, so ordering isn't contractual.
 */
function collectSubtrees(nodes: NodeMap, rootIds: string[]): string[] {
  const index = childIdsByParent(nodes);
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [...rootIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id))
      continue;
    seen.add(id);
    ids.push(id);
    const children = index.get(id);
    if (children)
      stack.push(...children);
  }
  return ids;
}

/**
 * `desired`, or `desired 2`, `desired 3`, … if siblings collide.
 *
 * `childIds` is an optional pre-resolved `childIdsByParent(nodes)` index —
 * pass it when the caller already has one (e.g. `duplicate`'s recursive
 * clone) so this looks siblings up in `O(children)` instead of re-scanning
 * every node in the tree via `Object.values(nodes)` per call.
 */
export function uniqueChildName(
  nodes: NodeMap,
  parentId: string,
  desired: string,
  excludeId?: string,
  childIds?: Map<string, string[]>,
): string {
  const siblingNodes = childIds
    ? (childIds.get(parentId) ?? []).map(id => nodes[id]).filter((n): n is FsNode => !!n)
    : Object.values(nodes).filter(n => n.parentId === parentId);
  const siblings = new Set(
    siblingNodes
      .filter(n => n.id !== excludeId)
      .map(n => n.name.toLowerCase()),
  );
  if (!siblings.has(desired.toLowerCase()))
    return desired;
  const stem = nameStem(desired);
  const ext = desired.slice(stem.length);
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
  const expired = childrenOf(nodes, TRASH_ID).filter(n => n.modifiedAt <= cutoff);
  return collectSubtrees(nodes, expired.map(n => n.id));
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
  /**
   * Replace a file's bytes with blob-backed content — the mirror of
   * `updateFileContent` for content that belongs in the blob store rather
   * than inline (review-backlog #11: `provider.writeFile` used to store
   * whatever size it was given inline, breaking the ≤`BLOB_INLINE_THRESHOLD`
   * contract on overwrite). Same blob-before-node ordering as
   * `createBlobFile`: the bytes are durably written (skipping the put if an
   * identical blob already exists) before the node is committed, so a
   * failure here can only leave an orphan blob, never a dangling reference.
   * `content` and `contentRef` are mutually exclusive, so this always clears
   * any prior inline `content`. A no-op if `id` isn't a file.
   */
  setFileBlob: (id: string, blob: Blob) => Promise<void>;
  /**
   * Bump `modifiedAt` only — Terminal `touch`. Not `updateFileContent`, which
   * would clear a blob-backed file's `contentRef` and drop its bytes.
   */
  touchFile: (id: string) => void;
  rename: (id: string, name: string) => void;
  /** Set (or, with `undefined`, clear) a node's color label (U14). No-op on an invalid label id or a missing node. */
  setLabel: (id: string, label: string | undefined) => void;
  /**
   * Set (or, with both `undefined`, clear) a node's custom icon. Glyph and
   * tint are set together so the picker's "Reset" is one commit rather than
   * two, but either may be `undefined` on its own — a tinted default glyph
   * and an untinted custom glyph are both valid.
   */
  setIcon: (id: string, iconGlyph: string | undefined, iconTint: string | undefined) => void;
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
  /**
   * Wipe the whole disk and seed it from `nodes`/`blobs` instead — the
   * import half of full-disk export/import. Narrowly scoped to that one
   * job (not a general bulk-write API): blobs are written before the node
   * set that references them (same blob-before-node ordering as
   * `createBlobFile`), then every previously-persisted node is removed and
   * `nodes` takes its place, then any blob the old disk referenced that the
   * new tree doesn't gets swept.
   */
  replaceAll: (nodes: FsNode[], blobs: { hash: string; bytes: Uint8Array; mimeType?: string }[]) => Promise<void>;
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

        // Step 17 (D8): backfill the Apps system folder onto a tree that was
        // seeded before it existed. Same idle isolation as the migration
        // above — a failure here never blocks boot.
        try {
          const appsFolder = ensureAppsFolder(nodes, Date.now());
          if (appsFolder) {
            nodes[appsFolder.id] = appsFolder;
            await adapter.putMany([appsFolder]);
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
      // `content` and `contentRef` are mutually exclusive (see FsNode): readers
      // prefer the ref, so keeping it would serve pre-edit bytes forever.
      const releasedRef = node.contentRef !== undefined;
      commit([{ ...node, content, contentRef: undefined, modifiedAt: Date.now() }]);
      if (releasedRef)
        sweepUnreferencedBlobs(get().nodes, blobStore).catch(logPersistError);
    },

    async setFileBlob(id, blob) {
      const node = get().nodes[id];
      if (!node || node.type !== "file")
        return;
      const hash = await hashBlob(blob);
      if (!(await blobStore.has(hash)))
        await blobStore.put(hash, blob);
      // A previous ref may now be unreferenced (a same-hash overwrite is a
      // no-op here, mirroring `createBlobFile`'s skip-if-present write).
      const releasedRef = node.contentRef !== undefined && node.contentRef.hash !== hash;
      commit([{
        ...node,
        content: undefined,
        contentRef: { hash, size: blob.size, mimeType: blob.type || node.mimeType },
        modifiedAt: Date.now(),
      }]);
      if (releasedRef)
        sweepUnreferencedBlobs(get().nodes, blobStore).catch(logPersistError);
    },

    touchFile(id) {
      const node = get().nodes[id];
      if (!node || node.type !== "file")
        return;
      commit([{ ...node, modifiedAt: Date.now() }]);
    },

    rename(id, name) {
      const node = get().nodes[id];
      const trimmed = name.trim();
      if (!node || !isValidNodeName(trimmed) || isSystemNode(id) || trimmed === node.name)
        return;
      const unique = uniqueChildName(get().nodes, node.parentId ?? "", trimmed, id);
      commit([{ ...node, name: unique, modifiedAt: Date.now() }]);
    },

    setLabel(id, label) {
      const node = get().nodes[id];
      if (!node || (label !== undefined && !isValidNodeLabel(label)))
        return;
      if ((node.label ?? undefined) === label)
        return;
      // A label is metadata, not content — unlike rename/move, this
      // deliberately leaves `modifiedAt` untouched so labeling a file
      // doesn't reorder a "date modified" sort.
      commit([{ ...node, label }]);
    },

    setIcon(id, iconGlyph, iconTint) {
      const node = get().nodes[id];
      if (!node)
        return;
      // Reject the whole call on bad input rather than silently dropping half
      // of it — same guard shape as `setLabel`'s.
      if (iconGlyph !== undefined && !isValidNodeIcon(iconGlyph))
        return;
      if (iconTint !== undefined && !isValidNodeLabel(iconTint))
        return;
      if ((node.iconGlyph ?? undefined) === iconGlyph && (node.iconTint ?? undefined) === iconTint)
        return;
      // Appearance is metadata, not content: like `setLabel`, this leaves
      // `modifiedAt` alone so restyling an icon doesn't reorder a
      // "date modified" sort.
      commit([{ ...node, iconGlyph, iconTint }]);
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
      // Index children once rather than re-filtering the whole map per
      // folder in the subtree (what childrenOf does) — cloning order doesn't
      // need childrenOf's display sort, so the plain id index is enough.
      const childIds = childIdsByParent(nodes);
      const newNodes: FsNode[] = [];
      function clone(node: FsNode, parentId: string): FsNode {
        const copy: FsNode = {
          ...node,
          id: crypto.randomUUID(),
          parentId,
          name: uniqueChildName(nodes, parentId, node.name, undefined, childIds),
          createdAt: now,
          modifiedAt: now,
          trashedFrom: undefined,
        };
        newNodes.push(copy);
        if (node.type === "folder") {
          for (const childId of childIds.get(node.id) ?? [])
            clone(nodes[childId], copy.id);
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
      const ids = collectSubtrees(nodes, childrenOf(nodes, TRASH_ID).map(n => n.id));
      removeIds(ids);
    },

    deleteForever(id) {
      const { nodes } = get();
      if (!nodes[id] || isSystemNode(id))
        return;
      removeIds(collectSubtrees(nodes, [id]));
    },

    purgeExpiredTrash(maxAgeMs = TRASH_MAX_AGE_MS) {
      const ids = expiredTrashIds(get().nodes, maxAgeMs);
      if (ids.length)
        removeIds(ids);
      return ids.length;
    },

    async replaceAll(nodes, blobs) {
      const oldIds = Object.keys(get().nodes);
      await Promise.all(blobs.map(async ({ hash, bytes, mimeType }) => {
        if (!(await blobStore.has(hash)))
          await blobStore.put(hash, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType }));
      }));
      const nextNodes = indexNodes(nodes);
      await adapter.removeMany(oldIds).catch(logPersistError);
      await adapter.putMany(nodes).catch(logPersistError);
      set({ nodes: nextNodes });
      await sweepUnreferencedBlobs(nextNodes, blobStore).catch(logPersistError);
    },
  };
});

/**
 * Runs `callback` once the fs store has finished booting, with the live node
 * ids at that moment — the shape every persisted store's stale-id GC needs
 * (`viewPrefsStore`'s favourites/recents, `notesPrefsStore`'s pins, …).
 * `init()` is memoized, so this just joins whatever boot is already
 * underway rather than kicking off a second one.
 */
export function onFsReady(callback: (liveIds: Set<string>) => void): void {
  void useFsStore.getState().init().then(() => {
    callback(new Set(Object.keys(useFsStore.getState().nodes)));
  });
}

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
