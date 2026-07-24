import type { BlobStore } from "./types";
import { BaseDirectory, exists, readDir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";
import { createWriteQueue } from "@/lib/asyncQueue";
import { createDirEnsurer, DISK_DIR, readJsonFile, writeJsonFile } from "./tauriShared";

// Mirrors the IDB backend's split into two databases (`kagami-fs`/
// `kagami-blobs`): metadata and bytes are independent, so introducing one
// never needs a migration of the other.
const BLOBS_DIR = `${DISK_DIR}/blobs`;
// Plain files have no type sidecar the way IndexedDB's stored `{buffer,
// type}` records do (see idbBlobStore.ts), so MIME types live in one small
// JSON map alongside the blob files rather than per-blob sidecar files.
const META_FILE = `${DISK_DIR}/blobs-meta.json`;

type MimeByHash = Record<string, string>;

function blobPath(hash: string): string {
  return `${BLOBS_DIR}/${hash}`;
}

/** Pure meta-map helpers — unit-tested directly (see `tauriAdapter.ts` for why). */
export function setMimeType(meta: MimeByHash, hash: string, mimeType: string): MimeByHash {
  return { ...meta, [hash]: mimeType };
}

export function removeMimeTypes(meta: MimeByHash, hashes: string[]): MimeByHash {
  const result = { ...meta };
  for (const hash of hashes)
    delete result[hash];
  return result;
}

/**
 * BlobStore backed by one file per hash under `$APPDATA/disk/blobs` (N3).
 * Meta-map writes are serialized through the same write-queue shape as
 * `tauriAdapter.ts`; the meta map is cached in memory after first load,
 * since this store is its only writer and so can't be made stale by reading
 * from the cache.
 */
export function createTauriBlobStore(): BlobStore {
  const enqueue = createWriteQueue();
  const ensureBlobsDir = createDirEnsurer(BLOBS_DIR);
  let metaCache: Promise<MimeByHash> | null = null;

  function loadMeta(): Promise<MimeByHash> {
    return (metaCache ??= readJsonFile<MimeByHash>(META_FILE, {}));
  }

  async function saveMeta(meta: MimeByHash): Promise<void> {
    await ensureBlobsDir();
    await writeJsonFile(META_FILE, meta);
    metaCache = Promise.resolve(meta);
  }

  async function hasBlob(hash: string): Promise<boolean> {
    return exists(blobPath(hash), { baseDir: BaseDirectory.AppData });
  }

  return {
    has: hasBlob,

    async get(hash) {
      if (!(await hasBlob(hash)))
        return null;
      const [bytes, meta] = await Promise.all([
        readFile(blobPath(hash), { baseDir: BaseDirectory.AppData }),
        loadMeta(),
      ]);
      return new Blob([bytes], { type: meta[hash] ?? "" });
    },

    async put(hash, blob) {
      await ensureBlobsDir();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeFile(blobPath(hash), bytes, { baseDir: BaseDirectory.AppData });
      await enqueue(async () => saveMeta(setMimeType(await loadMeta(), hash, blob.type)));
    },

    async delete(hashes) {
      if (hashes.length === 0)
        return;
      await Promise.all(hashes.map(async (hash) => {
        if (await hasBlob(hash))
          await remove(blobPath(hash), { baseDir: BaseDirectory.AppData });
      }));
      await enqueue(async () => saveMeta(removeMimeTypes(await loadMeta(), hashes)));
    },

    async listHashes() {
      // Authoritative from the directory listing — the meta map only backs
      // the mime-type lookup in `get`.
      if (!(await exists(BLOBS_DIR, { baseDir: BaseDirectory.AppData })))
        return [];
      const entries = await readDir(BLOBS_DIR, { baseDir: BaseDirectory.AppData });
      return entries.filter(e => e.isFile).map(e => e.name);
    },
  };
}
