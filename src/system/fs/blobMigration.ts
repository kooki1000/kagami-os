import type { NodeMap } from "./fsStore";
import type { BlobStore, FsNode } from "./types";
import { hashBlob } from "./blobHash";
import { BLOB_INLINE_THRESHOLD } from "./types";

/**
 * Decode a `data:` URL into a Blob. Handles both base64 (`;base64,`) and
 * percent-encoded (`,` / `;utf8,`) payloads. Returns `null` for anything it
 * can't parse — the caller then leaves the content inline rather than risk
 * losing it.
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    if (!dataUrl.startsWith("data:"))
      return null;
    const comma = dataUrl.indexOf(",");
    if (comma < 0)
      return null;
    const header = dataUrl.slice(5, comma);
    const payload = dataUrl.slice(comma + 1);
    const mime = header.replace(/;.*$/, "") || "application/octet-stream";
    const bytes = /;base64$/i.test(header)
      ? Uint8Array.from(atob(payload), char => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));
    return new Blob([bytes], { type: mime });
  }
  catch {
    return null;
  }
}

/**
 * One-time-shaped migration (B1): rewrite nodes whose inline `content` is a
 * data URL larger than `threshold` into blob references, moving the bytes
 * into `store`. Returns the changed nodes (bytes cleared, `contentRef` set)
 * for the caller to persist.
 *
 * Idempotent, so it needs no external "has run" flag: a migrated node has no
 * data-URL `content`, so a re-run skips it. Small data URLs (the seed SVGs)
 * and plain text stay inline. Base64 inflates ~33%, so gating on string
 * length never misses an over-threshold blob.
 */
export async function migrateInlineBlobs(
  nodes: NodeMap,
  store: BlobStore,
  threshold: number = BLOB_INLINE_THRESHOLD,
): Promise<FsNode[]> {
  const changed: FsNode[] = [];
  for (const node of Object.values(nodes)) {
    const content = node.content;
    if (content === undefined || !content.startsWith("data:") || content.length <= threshold)
      continue;
    const blob = dataUrlToBlob(content);
    if (!blob)
      continue;
    const hash = await hashBlob(blob);
    if (!(await store.has(hash)))
      await store.put(hash, blob);
    changed.push({
      ...node,
      content: undefined,
      contentRef: { hash, size: blob.size, mimeType: blob.type || node.mimeType },
    });
  }
  return changed;
}
