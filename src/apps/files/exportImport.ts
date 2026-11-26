import type { DesktopStateSnapshot } from "@/system/backup/desktopState";
import type { FsStore, NodeMap } from "@/system/fs/fsStore";
import type { BlobStore, FsNode } from "@/system/fs/types";
import { applyDesktopState, collectDesktopState, DESKTOP_STATE_ENTRY, parseDesktopState } from "@/system/backup/desktopState";
import { sha256Hex } from "@/system/fs/blobHash";
import { isSystemNode, pathOf } from "@/system/fs/fsStore";
import { BLOB_INLINE_THRESHOLD, ROOT_ID } from "@/system/fs/types";
import { buildZipEntries, triggerDownload, zipInWorker } from "./download";
import { runWorkerJob } from "./workerJob";

/**
 * Zip entry holding export metadata that raw file bytes at a path can't
 * carry: mime types, timestamps, and which paths must keep their
 * well-known id across a wipe-then-restore (Home, Trash, Desktop, ... —
 * the sidebar, Desktop icons, and `SYSTEM_IDS` guards all key off these).
 * A leading dot keeps it out of the way of a real top-level item that
 * happens to share a name — astronomically unlikely, not defended against.
 */
export const MANIFEST_ENTRY = ".kagami-export-manifest.json";

/**
 * v2 (B13) adds each node's id, so a restore reproduces the ids the
 * persisted stores (desktop layout, favourites, pins, wallpaper) refer to,
 * and a sibling `DESKTOP_STATE_ENTRY` with those stores' own state. v1
 * archives are still accepted: they import as a disk with fresh ids and no
 * desktop state.
 */
export const EXPORT_MANIFEST_VERSION = 2;

export interface ExportManifest {
  version: number;
  /** Zip-relative path (no leading slash) -> metadata, one entry per file in the archive. */
  files: Record<string, { id?: string; mimeType?: string; createdAt: number; modifiedAt: number }>;
  /** Zip-relative path -> well-known node id, for system folders only. */
  systemFolders: Record<string, string>;
  /** Zip-relative path -> node id, for every other folder (v2). */
  folderIds?: Record<string, string>;
}

/** A node's path, zip-entry-shaped: root dropped, names joined with "/". */
function relativePath(nodes: NodeMap, id: string): string {
  return pathOf(nodes, id).slice(1).map(n => n.name).join("/");
}

/**
 * The metadata half of an export — everything `buildZipEntries`'s
 * bytes-only output can't carry. Pure, so it's unit-testable without a zip
 * or a blob store.
 */
export function buildExportManifest(nodes: NodeMap): ExportManifest {
  const files: ExportManifest["files"] = {};
  const systemFolders: ExportManifest["systemFolders"] = {};
  const folderIds: Record<string, string> = {};
  for (const node of Object.values(nodes)) {
    if (node.id === ROOT_ID)
      continue;
    const path = relativePath(nodes, node.id);
    if (node.type === "file")
      files[path] = { id: node.id, mimeType: node.mimeType, createdAt: node.createdAt, modifiedAt: node.modifiedAt };
    else if (isSystemNode(node.id))
      systemFolders[path] = node.id;
    else
      folderIds[path] = node.id;
  }
  return { version: EXPORT_MANIFEST_VERSION, files, systemFolders, folderIds };
}

/**
 * Everything a full-disk export needs, zip-entry shaped and ready for
 * `zipWorker.ts`. `buildZipEntries` rooted at the true VFS root already
 * walks Trash too (it hangs directly off root, same as Home) — no
 * special-casing needed there, just the root id instead of one folder.
 */
export async function buildExportEntries(nodes: NodeMap, store: BlobStore, desktopState?: DesktopStateSnapshot): Promise<Record<string, Uint8Array>> {
  const entries = await buildZipEntries(ROOT_ID, nodes, store, "");
  entries[MANIFEST_ENTRY] = new TextEncoder().encode(JSON.stringify(buildExportManifest(nodes)));
  if (desktopState)
    entries[DESKTOP_STATE_ENTRY] = new TextEncoder().encode(JSON.stringify(desktopState));
  return entries;
}

/** Thrown when the picked zip isn't a Kagami export archive (or an incompatible version of one). */
export class InvalidArchiveError extends Error {}

export interface ImportBlob {
  hash: string;
  bytes: Uint8Array;
  mimeType?: string;
}

export interface ImportPlan {
  /** Full replacement node set, including the root and every system folder. */
  nodes: FsNode[];
  /** Deduped by hash — content-addressed the same way a fresh upload would be. */
  blobs: ImportBlob[];
  /** The archive's persisted-store snapshot (v2), if it has a readable one. */
  desktopState: DesktopStateSnapshot | null;
}

function splitPath(path: string): { parentPath: string; name: string } {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? { parentPath: "", name: path } : { parentPath: path.slice(0, idx), name: path.slice(idx + 1) };
}

/**
 * Every folder path implied by `filePaths` (their parent chains) plus
 * `explicitFolderPaths` (empty-folder markers and the system-folder safety
 * net below), deduped and ordered parent-before-child so callers can create
 * them in one pass without a topological sort.
 */
function collectFolderPaths(filePaths: string[], explicitFolderPaths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  function add(path: string): void {
    if (path === "" || seen.has(path))
      return;
    add(splitPath(path).parentPath);
    seen.add(path);
    out.push(path);
  }
  for (const filePath of filePaths)
    add(splitPath(filePath).parentPath);
  for (const folderPath of explicitFolderPaths)
    add(folderPath);
  return out;
}

/**
 * Reconstruct a full-disk replacement — folders, files, and the blobs they
 * reference — from an unzipped export archive, for `useFsStore.replaceAll`.
 * Pure aside from hashing (Web Crypto, no I/O). Mirrors the upload path's
 * inline-vs-blob split and hashing, so a round-tripped disk lands in the
 * same storage shape and dedupes the same way a fresh upload would.
 * `makeId` defaults to `crypto.randomUUID`; tests can pass a deterministic one.
 */
export async function planImport(
  entries: Record<string, Uint8Array>,
  makeId: () => string = () => crypto.randomUUID(),
): Promise<ImportPlan> {
  const manifestBytes = entries[MANIFEST_ENTRY];
  if (!manifestBytes)
    throw new InvalidArchiveError("This file isn't a Kagami disk export.");

  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  }
  catch {
    throw new InvalidArchiveError("This file isn't a Kagami disk export.");
  }
  if (manifest.version !== 1 && manifest.version !== EXPORT_MANIFEST_VERSION)
    throw new InvalidArchiveError("This export was made by an incompatible version of Kagami.");

  const filePaths = Object.keys(manifest.files);
  const explicitFolderPaths = Object.keys(entries)
    .filter(key => key !== MANIFEST_ENTRY && key.endsWith("/"))
    .map(key => key.slice(0, -1));
  const folderPaths = collectFolderPaths(filePaths, [
    ...explicitFolderPaths,
    ...Object.keys(manifest.systemFolders),
  ]);

  // Ids an archive declares are untrusted input: keep one only if it's a
  // plain token, isn't the root or a well-known folder's id (those come from
  // `systemFolders`), and nothing else has claimed it. Anything else gets a
  // fresh id, so a hostile archive can't alias or shadow a system node.
  const claimed = new Set<string>(Object.values(manifest.systemFolders));
  function idFor(declared: unknown): string {
    if (typeof declared === "string" && /^[\w-]{1,64}$/.test(declared) && declared !== ROOT_ID && !isSystemNode(declared) && !claimed.has(declared)) {
      claimed.add(declared);
      return declared;
    }
    return makeId();
  }

  const now = Date.now();
  const idByPath = new Map<string, string>([["", ROOT_ID]]);
  const nodes: FsNode[] = [
    { id: ROOT_ID, parentId: null, name: "Kagami", type: "folder", createdAt: now, modifiedAt: now },
  ];

  for (const path of folderPaths) {
    const { parentPath, name } = splitPath(path);
    const id = manifest.systemFolders[path] ?? idFor(manifest.folderIds?.[path]);
    idByPath.set(path, id);
    nodes.push({
      id,
      parentId: idByPath.get(parentPath) ?? ROOT_ID,
      name,
      type: "folder",
      createdAt: now,
      modifiedAt: now,
    });
  }

  interface FileMeta { id: string; bytes: Uint8Array; parentId: string; name: string; mimeType?: string; createdAt: number; modifiedAt: number }
  const metaByPath = new Map<string, FileMeta>();
  const binaryPaths: string[] = [];
  for (const path of filePaths) {
    const bytes = entries[path];
    if (!bytes)
      throw new InvalidArchiveError(`Missing bytes for "${path}" in the archive.`);
    const { id, mimeType, createdAt, modifiedAt } = manifest.files[path];
    const { parentPath, name } = splitPath(path);
    metaByPath.set(path, { id: idFor(id), bytes, parentId: idByPath.get(parentPath) ?? ROOT_ID, name, mimeType, createdAt, modifiedAt });
    if (!(mimeType?.startsWith("text/") && bytes.byteLength <= BLOB_INLINE_THRESHOLD))
      binaryPaths.push(path);
  }

  // Every hash is an independent Web Crypto call — run them concurrently
  // instead of one file at a time.
  const hashes = await Promise.all(binaryPaths.map(path => sha256Hex(metaByPath.get(path)!.bytes)));
  const hashByPath = new Map(binaryPaths.map((path, i) => [path, hashes[i]]));

  const blobsByHash = new Map<string, ImportBlob>();
  for (const path of filePaths) {
    const { id, bytes, parentId, name, mimeType, createdAt, modifiedAt } = metaByPath.get(path)!;
    const hash = hashByPath.get(path);

    if (hash === undefined) {
      nodes.push({ id, parentId, name, type: "file", mimeType, content: new TextDecoder().decode(bytes), createdAt, modifiedAt });
      continue;
    }

    if (!blobsByHash.has(hash))
      blobsByHash.set(hash, { hash, bytes, mimeType });
    nodes.push({ id, parentId, name, type: "file", mimeType, contentRef: { hash, size: bytes.byteLength, mimeType }, createdAt, modifiedAt });
  }

  return { nodes, blobs: [...blobsByHash.values()], desktopState: parseDesktopState(entries[DESKTOP_STATE_ENTRY]) };
}

/** `kagami-disk-2026-07-25.zip` — sortable, collision-unlikely default filename. */
function exportFilename(now = new Date()): string {
  return `kagami-disk-${now.toISOString().slice(0, 10)}.zip`;
}

/**
 * Unzip `bytes` off the main thread, mirroring `download.ts`'s
 * `zipInWorker`. Not unit-testable under Vitest's Node environment (no real
 * Worker) — covered by `planImport`'s tests plus in-browser verification.
 * Exported for reuse by `system/apps/installBundle.ts` (step 17, D8.5) —
 * unzipping an app bundle is the same generic operation as unzipping a disk
 * export, and `importZipWorker.ts` is already fully generic, so this avoids
 * a second `new Worker(new URL(...))` call site for the same worker module.
 */
export function unzipInWorker(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const worker = new Worker(new URL("./importZipWorker.ts", import.meta.url), { type: "module" });
  return runWorkerJob(worker, bytes, "Unzip worker failed");
}

/**
 * Full-disk export (PR 3): zip the whole VFS tree (fs tree + blob bytes
 * only — no settings/theme/dock/localStorage state, per the approved
 * scope) off the main thread and trigger a "Save As" for the archive.
 */
export async function exportDisk(nodes: NodeMap, store: BlobStore): Promise<void> {
  const entries = await buildExportEntries(nodes, store, collectDesktopState());
  const zipped = await zipInWorker(entries);
  triggerDownload(new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" }), exportFilename());
}

/**
 * Full-disk import (PR 3): unzip `file` off the main thread, reconstruct
 * the disk it describes, and replace the whole current disk with it
 * (wipe-then-restore, not a merge — matches the byte-identical round-trip
 * this feature exists for). Returns the plan so the caller can report
 * counts.
 */
export async function importDisk(file: File, fs: Pick<FsStore, "replaceAll">): Promise<ImportPlan> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const unzipped = await unzipInWorker(bytes);
  const plan = await planImport(unzipped);
  await fs.replaceAll(plan.nodes, plan.blobs);
  // After the disk, so the stores' node ids already resolve; before anything
  // re-renders from them.
  if (plan.desktopState)
    await applyDesktopState(plan.desktopState);
  return plan;
}
