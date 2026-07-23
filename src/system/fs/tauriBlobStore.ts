import type { BlobStore } from "./types";
import { BaseDirectory, exists, mkdir, readDir, readFile, readTextFile, remove, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";

// A sibling of tauriAdapter.ts's `disk` folder, mirroring the IDB backend's
// split into two databases (`kagami-fs`/`kagami-blobs`): metadata and bytes
// are independent, so introducing one never needs a migration of the other.
const DISK_DIR = "disk";
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

async function ensureBlobsDir(): Promise<void> {
  if (!(await exists(BLOBS_DIR, { baseDir: BaseDirectory.AppData })))
    await mkdir(BLOBS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

async function readMeta(): Promise<MimeByHash> {
  if (!(await exists(META_FILE, { baseDir: BaseDirectory.AppData })))
    return {};
  const text = await readTextFile(META_FILE, { baseDir: BaseDirectory.AppData });
  return JSON.parse(text) as MimeByHash;
}

async function writeMeta(meta: MimeByHash): Promise<void> {
  await ensureBlobsDir();
  await writeTextFile(META_FILE, JSON.stringify(meta), { baseDir: BaseDirectory.AppData });
}

/**
 * BlobStore backed by one file per hash under `$APPDATA/disk/blobs` (N3).
 * Meta-map writes are serialized through one promise chain, same shape as
 * `tauriAdapter.ts`'s write queue and for the same reason.
 */
export function createTauriBlobStore(): BlobStore {
  let writeQueue = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(task);
    writeQueue = result.then(() => undefined, () => undefined);
    return result;
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
        readMeta(),
      ]);
      return new Blob([bytes], { type: meta[hash] ?? "" });
    },

    async put(hash, blob) {
      await ensureBlobsDir();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeFile(blobPath(hash), bytes, { baseDir: BaseDirectory.AppData });
      await enqueue(async () => writeMeta(setMimeType(await readMeta(), hash, blob.type)));
    },

    async delete(hashes) {
      if (hashes.length === 0)
        return;
      for (const hash of hashes) {
        if (await hasBlob(hash))
          await remove(blobPath(hash), { baseDir: BaseDirectory.AppData });
      }
      await enqueue(async () => writeMeta(removeMimeTypes(await readMeta(), hashes)));
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
