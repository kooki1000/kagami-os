/**
 * Boilerplate shared by the two raw-IndexedDB backends in this directory
 * (`idbAdapter.ts` for nodes, `idbBlobStore.ts` for blobs) — each opens its
 * own database with its own store shape, but "open a database" and "await a
 * transaction's outcome" are identical either way.
 */

/** Open (creating/upgrading the schema via `onUpgrade` if needed) an IndexedDB database. */
export function openIdbDatabase(
  name: string,
  version: number,
  onUpgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => onUpgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

/** Resolves when `tx` completes; rejects on error/abort. */
export function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}
