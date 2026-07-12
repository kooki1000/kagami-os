import type { NodeMap } from "@/system/fs/fsStore";
import type { BlobStore, FsNode } from "@/system/fs/types";
import { dataUrlToBlob } from "@/system/fs/blobMigration";
import { childrenOf } from "@/system/fs/fsStore";

/**
 * Resolve a file node's actual bytes, whichever of B1's three content paths
 * it's on: blob-backed, an inline data URL (small seed images), or inline
 * plain text. Pure aside from the blob-store read.
 */
export async function resolveFileBytes(node: FsNode, store: BlobStore): Promise<Uint8Array> {
  if (node.contentRef) {
    const blob = await store.get(node.contentRef.hash);
    if (!blob)
      throw new Error(`"${node.name}" is missing from storage.`);
    return new Uint8Array(await blob.arrayBuffer());
  }
  const content = node.content ?? "";
  if (content.startsWith("data:")) {
    const blob = dataUrlToBlob(content);
    if (!blob)
      throw new Error(`"${node.name}" couldn't be decoded.`);
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new TextEncoder().encode(content);
}

/**
 * Flatten a folder's full contents into `{ relativePath: bytes }`, ready to
 * hand to a zip encoder. Empty subfolders get a trailing-slash entry with no
 * bytes so the archive preserves them (fflate's directory-entry convention).
 * Pure aside from blob reads.
 */
export async function buildZipEntries(
  folderId: string,
  nodes: NodeMap,
  store: BlobStore,
  prefix = "",
): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  const children = childrenOf(nodes, folderId);
  if (children.length === 0 && prefix) {
    out[`${prefix}/`] = new Uint8Array(0);
    return out;
  }
  for (const child of children) {
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.type === "folder")
      Object.assign(out, await buildZipEntries(child.id, nodes, store, path));
    else
      out[path] = await resolveFileBytes(child, store);
  }
  return out;
}

/** Trigger a browser "Save As" for `blob` via a throwaway anchor click. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to pick up the click before freeing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Zip `entries` off the main thread (roadmap: "Zip via a Web Worker to keep
 * the shell responsive"). Not unit-testable under Vitest's Node environment
 * (no real Worker) — covered by `buildZipEntries`'s tests plus in-browser
 * verification instead.
 */
function zipInWorker(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./zipWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ ok: true; data: Uint8Array } | { ok: false; error: string }>) => {
      worker.terminate();
      if (e.data.ok)
        resolve(e.data.data);
      else
        reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Zip worker failed"));
    };
    worker.postMessage(entries);
  });
}

/** Download a single file node to the host OS. */
export async function downloadFile(node: FsNode, store: BlobStore): Promise<void> {
  const bytes = await resolveFileBytes(node, store);
  // Both Uint8Arrays here are always freshly allocated (TextEncoder.encode
  // or `new Uint8Array(arrayBuffer)`), so they're always plain-ArrayBuffer-
  // backed; the cast just satisfies BlobPart's stricter typed generic.
  triggerDownload(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: node.mimeType || "application/octet-stream" }),
    node.name,
  );
}

/** Download a folder's contents as a zip, built client-side in a Worker. */
export async function downloadFolder(folder: FsNode, nodes: NodeMap, store: BlobStore): Promise<void> {
  const entries = await buildZipEntries(folder.id, nodes, store);
  const zipped = await zipInWorker(entries);
  triggerDownload(new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" }), `${folder.name}.zip`);
}
