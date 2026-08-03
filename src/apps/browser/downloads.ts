import type { FsNode } from "@/system/fs/types";

/**
 * Moving a finished download into the VFS (U17).
 *
 * The OS webview writes downloads to a real filesystem path, which is not
 * where this system's files live — a download that landed in `~/Downloads`
 * would be invisible to Files, Notes and everything else. The Rust side stages
 * the bytes (see `browser.rs`), and this reads them across into the VFS's own
 * Downloads folder, deleting the staged copy as it goes.
 */

/**
 * Extension → mime type for the formats a browser download plausibly produces.
 * Downloads arrive as a filename and bytes with no type attached (unlike an
 * upload, where `File.type` is filled in by the browser), and a node with no
 * mime type can't be routed by "Open with" at all.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  // documents
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  // images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  // audio and video
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  // archives
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
};

/** The generic "some bytes" type, for anything the table above doesn't name. */
export const FALLBACK_MIME_TYPE = "application/octet-stream";

export function mimeTypeForFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1)
    return FALLBACK_MIME_TYPE;
  return MIME_BY_EXTENSION[filename.slice(dot + 1).toLowerCase()] ?? FALLBACK_MIME_TYPE;
}

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
