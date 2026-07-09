import type { FsNode, StorageAdapter } from "./types";

const DB_NAME = "kagami-fs";
const DB_VERSION = 1;
const STORE = "nodes";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** No-op adapter for environments without IndexedDB (SSR, private mode, tests). */
function createMemoryAdapter(): StorageAdapter {
  return {
    async loadAll() {
      return null;
    },
    async putMany() {},
    async removeMany() {},
  };
}

/**
 * StorageAdapter backed by raw IndexedDB. (The `idb` convenience library
 * is currently uninstallable under the workspace's minimumReleaseAge
 * policy; this file is the only place it would slot in.)
 *
 * Degrades to an in-memory no-op when IndexedDB isn't available, so the OS
 * still boots (just without persistence) instead of crashing.
 */
export function createIdbAdapter(): StorageAdapter {
  if (typeof indexedDB === "undefined")
    return createMemoryAdapter();

  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDatabase());

  return {
    async loadAll() {
      const tx = (await db()).transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      await done(tx);
      const nodes = request.result as FsNode[];
      return nodes.length > 0 ? nodes : null;
    },

    async putMany(nodes: FsNode[]) {
      if (nodes.length === 0)
        return;
      const tx = (await db()).transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const node of nodes)
        store.put(node);
      await done(tx);
    },

    async removeMany(ids: string[]) {
      if (ids.length === 0)
        return;
      const tx = (await db()).transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const id of ids)
        store.delete(id);
      await done(tx);
    },
  };
}
