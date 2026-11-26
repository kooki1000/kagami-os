# Blob storage (B1)

**Status:** shipped in Phase 10. This note started as the design for review
and now describes what was built, including the choices that were open at
the time.

## Why it exists

`FsNode.content` used to hold every file's bytes as a string: data URLs for
images, raw text for documents. All of it rode through `loadAll` into memory
and sat in every Zustand snapshot, which capped practical file size and
blocked real uploads, downloads, media and PDF.

## Shape

Bytes live in a content-addressed blob store. A node holds a reference:

```ts
interface FsNode {
  content?: string; // small text only, ≤ BLOB_INLINE_THRESHOLD (64 KB)
  contentRef?: {
    hash: string; // SHA-256 hex of the bytes, the blob's identity
    size: number;
    mimeType?: string;
  };
}
```

A node has at most one of `content` and `contentRef`. Text under 64 KB stays
inline, so Notes and the Terminal keep their simple string path. Everything
else, binaries and large text alike, becomes a `contentRef`. An edit that
crosses the threshold moves the content across in either direction
(`fsStore.setFileBlob`, the mirror of `updateFileContent`).

## The `BlobStore` seam

It sits beside `StorageAdapter` rather than inside it, so the byte store can
change on its own. That's what let the native disk store land without
touching node persistence.

```ts
interface BlobStore {
  has: (hash: string) => Promise<boolean>;
  get: (hash: string) => Promise<Blob | null>;
  put: (hash: string, blob: Blob) => Promise<void>;
  delete: (hashes: string[]) => Promise<void>;
  listHashes: () => Promise<string[]>;
}
```

- **Web:** `idbBlobStore.ts`, a `blobs` object store keyed by `hash` holding
  `Blob` values (chosen over `ArrayBuffer` as simpler and well supported on
  all three engines).
- **Native:** `tauriBlobStore.ts`, one file per blob under `$APPDATA/disk`.
- Both degrade to in-memory when their backing store is unavailable.

Hashing is `crypto.subtle.digest("SHA-256", bytes)` in `blobHash.ts`.
Writing hashes first and skips the `put` when `has(hash)` is already true,
so ten copies of a photo are one blob and re-uploading a file is instant.

## Reading bytes

Components that render bytes call `useBlobUrl(ref)`, which creates an object
URL and revokes it on unmount or hash change. Viewer, Files thumbnails, the
Player, Documents and the editors all go through it or through
`blobStore.get`. Terminal `cat` prints a size and type notice for a
`contentRef` instead of dumping bytes.

## Garbage collection

Blobs are shared, so deleting a node can't delete its blob directly.
`unreferencedBlobs(nodes, blobHashes)` is a pure function returning the
hashes no live node points at. The node deletion commits first, then the
sweep runs; it's triggered by Empty Trash and permanent delete, plus an idle
sweep after boot. `blobIntegrity.test.ts` checks that a blob whose node
commit hasn't landed yet is never collected.

If version history (`ROADMAP.md` B16) lands, old version hashes have to
count as references here.

## Migration

A one-time pass in `fsStore.init`, guarded by the IndexedDB schema version:
any node whose `content` was a data URL over the threshold was decoded,
hashed, stored, and rewritten to a `contentRef`. The node was only rewritten
after its blob was durably stored. Seeded SVG artwork stayed inline, since
it's small text.
