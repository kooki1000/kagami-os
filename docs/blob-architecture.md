# Blob storage architecture (B1) — design note

**Status:** design for review · opens Phase 10 (File-system maturity → v0.8)
**Gate:** this reshapes `FsNode` and both storage adapters and touches ~5
consumers, so it gets a page of thought before code (roadmap §10.5). Nothing
here ships until the shape below is agreed.

## Problem

`FsNode.content` holds file bytes as strings — data URLs for images, raw text
for documents. Every byte therefore rides through `loadAll` into memory, sits
in every Zustand snapshot, and (once sync lands in Phase 13) would travel in
every op. This caps practical file size at "toy" and blocks real uploads (B2),
download (B3), and media/PDF (D5/D6).

**Exit criterion (roadmap Phase 10):** `loadAll` no longer contains file bytes
— nodes are metadata.

## Shape

Bytes move out of the node record into a **content-addressed blob store**.
Nodes keep only a reference.

```ts
interface FsNode {
  // content?: string  — STAYS, but only for small text (≤ 64 KB): Notes
  //                      documents, Terminal `echo >`/`cat`. Keeps their
  //                      simple string path (and their sync ops) unchanged.
  contentRef?: {
    hash: string; // sha-256 hex of the bytes — the blob's identity
    size: number; // byte length, for "Get Info" (B8) and quota (A7)
    mimeType?: string;
  };
}
```

A node has **at most one** of `content` / `contentRef`. The **threshold is
64 KB**: text under it stays inline; everything else (all binaries, large
text) becomes a `contentRef`.

## Storage layer

A new seam, parallel to `StorageAdapter`, so the byte store can evolve
independently (IndexedDB today; S3 presigned URLs server-side in Phase 13):

```ts
interface BlobStore {
  has: (hash: string) => Promise<boolean>;
  get: (hash: string) => Promise<Blob | null>;
  put: (hash: string, blob: Blob) => Promise<void>;
  delete: (hashes: string[]) => Promise<void>;
  listHashes: () => Promise<string[]>; // for GC
}
```

- IndexedDB backing: a new `blobs` object store, `keyPath: "hash"`, value a
  `Blob` (Safari IDB Blob support is fine on our target matrix). This is an
  **IDB schema version bump** with an explicit migration (see below) and an
  upgrade-in-place E2E fixture (roadmap §9).
- Hashing: `crypto.subtle.digest("SHA-256", bytes)` → hex.

## Content addressing → free dedupe + "instant upload"

Writing bytes: hash first; if `has(hash)` is already true, **skip the write**
and just point the node at it. Ten copies of a photo = one blob; re-uploading
an existing file is instant. Server-side this becomes the `HEAD /blobs/:hash`
existence check from Appendix A.3.

## Read path

Consumers that render bytes resolve a blob URL from the ref:

```text
useBlobUrl(ref) → createObjectURL(blob), revoked on unmount
```

- **Viewer** and **Files thumbnails**: `node.content` → blob URL from
  `contentRef.hash`.
- **Terminal `cat`**: a `contentRef` prints a size/type notice (it already
  special-cases images) instead of dumping bytes.
- Small-text consumers (Notes editor, `cat` on a text file) keep reading
  `node.content` unchanged.

## Garbage collection (refcounting)

Blobs are shared, so deleting a node must not blindly delete its blob. GC is a
**pure function**, unit-tested independent of storage:

```text
unreferencedBlobs(nodes, blobHashes) → hashes with no live contentRef
```

Ordering: apply the node deletion first, then sweep. Triggered by
`emptyTrash` / `deleteForever`, plus an idle-time sweep. (T6 already notes the
trash-only guard lives at call sites — revisit when third-party apps get fs
access.)

## Migration (one-time, in `fsStore.init`)

Guarded by the IDB schema version so it runs exactly once:

1. For each node whose `content` is a data URL **larger than the threshold**:
   decode → hash → `blobs.put` → rewrite the node to a `contentRef`, clear
   `content`.
2. Small text stays inline.
3. Seeded SVG artwork: **kept inline** — it's `image/svg+xml` text well under
   64 KB, so it stays a `content` string (no blob, no `<img>` change needed
   beyond what already works). Revisit only if seed art grows.

Ship with an old-schema snapshot committed as a test fixture and an
upgrade-in-place E2E scenario.

## Consumers to update

`Viewer`, Files thumbnail rendering (`isImageNode` path), `openFile`, the
seed data, and Terminal `cat`. Everything else addresses nodes by metadata
and is untouched.

## Suggested sub-PR sequence

Each step is independently reviewable and leaves the app working:

1. **`BlobStore` seam + IDB `blobs` store + schema bump** — no behavior change
   yet; unit tests for the adapter.
2. **`contentRef` type + write path** — `createFile` routes `> threshold` to a
   blob; add the `useBlobUrl` read hook. Behind a feature flag if needed.
3. **Migration + fixture** — one-time data-URL → blob pass.
4. **Switch consumers** — Viewer, Files thumbnails, `openFile`, Terminal.
5. **GC / refcount sweep** — pure function + wire into trash flows.

B2 (upload from host OS) then builds directly on steps 1–2.

## Open decisions (confirm before step 1)

1. **Blob value type in IDB:** `Blob` (recommended — simplest, well-supported)
   vs `ArrayBuffer`.
2. **Threshold value:** 64 KB proposed. Balances keeping Notes/Terminal on the
   inline path against payload bloat.
3. **`BlobStore` as a separate seam** (recommended) vs extending
   `StorageAdapter`. Separate keeps the S3 swap (Phase 13) isolated.
4. **Seed SVGs inline** (recommended) vs migrated to blobs.

## Risk

This is user-data-shaped (R2). Mitigations: the migration is idempotent and
version-guarded; content addressing means a botched write is detectable (hash
mismatch); the old IDB data is only rewritten after the blob is durably
stored; and the upgrade-in-place fixture is a merge gate.
