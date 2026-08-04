import type { FsNode } from "@/system/fs/types";
import { mimeTypeForFilename } from "@/system/fs/mimeTypes";

/**
 * Moving a finished download into the VFS (U17).
 *
 * The OS webview writes downloads to a real filesystem path, which is not
 * where this system's files live — a download that landed in `~/Downloads`
 * would be invisible to Files, Notes and everything else. The Rust side stages
 * the bytes (see `browser.rs`), and this reads them across into the VFS's own
 * Downloads folder, deleting the staged copy as it goes.
 *
 * Downloads arrive as a filename and bytes with no type attached (unlike an
 * upload, where `File.type` is filled in by the browser), and a node with no
 * mime type can't be routed by "Open with" at all — hence the name-based
 * lookup.
 */

export interface FinishedDownload {
  filename: string;
  /** Staging path on the real filesystem, consumed by `takeDownload`. */
  path: string;
}

/**
 * Dependencies as an argument rather than imports, so the move can be tested
 * without a Tauri host or a live fs store — the same seam `uploadEntries`
 * uses for the upload direction.
 */
export interface DownloadDeps {
  takeDownload: (path: string) => Promise<ArrayBuffer>;
  createBlobFile: (parentId: string, name: string, blob: Blob, mimeType?: string) => Promise<FsNode>;
}

/**
 * Reads a staged download into `parentId`. Always goes through the blob store
 * rather than inline content: download bytes are opaque, and assuming UTF-8
 * text would corrupt anything that isn't.
 */
export async function saveDownload(
  download: FinishedDownload,
  parentId: string,
  deps: DownloadDeps,
): Promise<FsNode> {
  const bytes = await deps.takeDownload(download.path);
  const mimeType = mimeTypeForFilename(download.filename);
  return deps.createBlobFile(parentId, download.filename, new Blob([bytes], { type: mimeType }), mimeType);
}
