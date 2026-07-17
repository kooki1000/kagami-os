import type { BlobStore } from "./types";

// A separate database from the nodes adapter (`kagami-fs`): blobs are large
// and content-addressed, and keeping them apart means introducing them needs
// no schema-version bump or migration on the existing nodes store. Writes go
// blob-first, so a mid-write failure leaves at most an orphan blob (GC-able),
// never a node pointing at missing bytes.
const DB_NAME = "kagami-blobs";
const DB_VERSION = 1;
const STORE = "blobs";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // Out-of-line keys: the hash is the key, the Blob is the value.
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

/** What's actually stored per hash — see `put`/`get` below for why. */
interface StoredBlob {
  buffer: ArrayBuffer;
  type: string;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** In-memory blob store for environments without IndexedDB (SSR, private mode, tests). */
export function createMemoryBlobStore(): BlobStore {
  const blobs = new Map<string, Blob>();
  return {
    async has(hash) {
      return blobs.has(hash);
    },
    async get(hash) {
      return blobs.get(hash) ?? null;
    },
    async put(hash, blob) {
      blobs.set(hash, blob);
    },
    async delete(hashes) {
      for (const hash of hashes)
        blobs.delete(hash);
    },
    async listHashes() {
      return [...blobs.keys()];
    },
  };
}

/**
 * BlobStore backed by raw IndexedDB (the `idb` library is blocked by the
 * workspace's minimumReleaseAge policy). Content-addressed by hash, so
 * `put`-ing an existing hash is an idempotent overwrite with identical bytes.
 * Degrades to an in-memory store when IndexedDB is unavailable, so the OS
 * still boots — just without blob persistence this session.
 */
export function createIdbBlobStore(): BlobStore {
  if (typeof indexedDB === "undefined")
    return createMemoryBlobStore();

  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDatabase());

  return {
    async has(hash) {
      const tx = (await db()).transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getKey(hash);
      await done(tx);
      return request.result !== undefined;
    },

    async get(hash) {
      const tx = (await db()).transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(hash);
      await done(tx);
      const stored = request.result as StoredBlob | undefined;
      return stored ? new Blob([stored.buffer], { type: stored.type }) : null;
    },

    async put(hash, blob) {
      // Store the raw bytes + mime type rather than the Blob object itself:
      // some IndexedDB implementations (WebKit's among them) fail to
      // structured-clone a Blob into an object store ("Error preparing
      // Blob/File data to be stored in object store"), silently losing the
      // write. An ArrayBuffer has no such issue anywhere, and a Blob
      // reconstructed from it on read is behaviorally identical.
      const stored: StoredBlob = { buffer: await blob.arrayBuffer(), type: blob.type };
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(stored, hash);
      await done(tx);
    },

    async delete(hashes) {
      if (hashes.length === 0)
        return;
      const tx = (await db()).transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const hash of hashes)
        store.delete(hash);
      await done(tx);
    },

    async listHashes() {
      const tx = (await db()).transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAllKeys();
      await done(tx);
      return request.result as string[];
    },
  };
}
