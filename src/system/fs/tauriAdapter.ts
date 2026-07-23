import type { FsNode, StorageAdapter } from "./types";
import { createDirEnsurer, createWriteQueue, DISK_DIR, readJsonFile, writeJsonFile } from "./tauriShared";

const NODES_FILE = `${DISK_DIR}/nodes.json`;

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
 */
export function createTauriAdapter(): StorageAdapter {
  const enqueue = createWriteQueue();
  const ensureDiskDir = createDirEnsurer(DISK_DIR);

  async function readNodes(): Promise<FsNode[]> {
    await ensureDiskDir();
    return readJsonFile<FsNode[]>(NODES_FILE, []);
  }

  async function writeNodes(nodes: FsNode[]): Promise<void> {
    await ensureDiskDir();
    await writeJsonFile(NODES_FILE, nodes);
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
