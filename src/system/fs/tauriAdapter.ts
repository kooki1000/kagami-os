import type { FsNode, StorageAdapter } from "./types";
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

// Both files live under $APPDATA/disk — the "real, isolated file system"
// pitch (DIRECTION.md §3.1): a real folder on the host machine, sandboxed to
// Kagami by the OS via the app's bundle identifier, that other apps' file
// pickers don't wander into.
const DISK_DIR = "disk";
const NODES_FILE = `${DISK_DIR}/nodes.json`;

async function ensureDiskDir(): Promise<void> {
  if (!(await exists(DISK_DIR, { baseDir: BaseDirectory.AppData })))
    await mkdir(DISK_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

/**
 * Merge a batch of node updates into the existing set, by id. Pure and
 * unit-tested directly; the IPC-calling shell below is exercised manually
 * via `pnpm tauri dev` for this first pass (Playwright can't drive a Tauri
 * window yet — `tauri-driver` is deferred to N5).
 */
export function mergeNodes(existing: FsNode[], updates: FsNode[]): FsNode[] {
  const byId = new Map(existing.map(n => [n.id, n]));
  for (const node of updates)
    byId.set(node.id, node);
  return [...byId.values()];
}

/** The `removeMany` counterpart to {@link mergeNodes} — also pure. */
export function removeNodes(existing: FsNode[], ids: string[]): FsNode[] {
  const idSet = new Set(ids);
  return existing.filter(n => !idSet.has(n.id));
}

/**
 * StorageAdapter backed by a single JSON file under the Tauri app's
 * `$APPDATA/disk` folder (N3). Whole-file read-modify-write on every write —
 * fine at this scale, mirrors treating the whole IDB object store as the
 * source of truth, just as one file instead of a key/value store.
 *
 * Writes are serialized through one promise chain so overlapping
 * `putMany`/`removeMany` calls (fsStore commits fire-and-forget) can't race
 * each other's read-modify-write and clobber one another.
 */
export function createTauriAdapter(): StorageAdapter {
  let writeQueue = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(task);
    writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function readNodes(): Promise<FsNode[]> {
    await ensureDiskDir();
    if (!(await exists(NODES_FILE, { baseDir: BaseDirectory.AppData })))
      return [];
    const text = await readTextFile(NODES_FILE, { baseDir: BaseDirectory.AppData });
    return JSON.parse(text) as FsNode[];
  }

  async function writeNodes(nodes: FsNode[]): Promise<void> {
    await ensureDiskDir();
    await writeTextFile(NODES_FILE, JSON.stringify(nodes), { baseDir: BaseDirectory.AppData });
  }

  return {
    async loadAll() {
      const nodes = await enqueue(readNodes);
      return nodes.length > 0 ? nodes : null;
    },

    async putMany(updates) {
      if (updates.length === 0)
        return;
      await enqueue(async () => writeNodes(mergeNodes(await readNodes(), updates)));
    },

    async removeMany(ids) {
      if (ids.length === 0)
        return;
      await enqueue(async () => writeNodes(removeNodes(await readNodes(), ids)));
    },
  };
}
