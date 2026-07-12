import type { NodeMap } from "./fsStore";
import type { BlobStore } from "./types";

/**
 * Blobs are shared (content-addressed dedupe), so deleting a node must never
 * blindly delete its blob — another node might reference the same hash.
 * This computes which stored hashes no live node points at. Pure — the
 * caller (a store action, a boot-time sweep) owns when to run it and what
 * to do with the result.
 */
export function unreferencedBlobs(nodes: NodeMap, blobHashes: string[]): string[] {
  const referenced = new Set<string>();
  for (const node of Object.values(nodes)) {
    if (node.contentRef)
      referenced.add(node.contentRef.hash);
  }
  return blobHashes.filter(hash => !referenced.has(hash));
}

/**
 * Delete every blob `nodes` no longer references. Called after any node
 * removal (`emptyTrash` / `deleteForever` / `purgeExpiredTrash` all funnel
 * through `fsStore`'s `removeIds`) and once at boot as an idle-time sweep,
 * catching orphans from edge cases like a blob write that completed just
 * before a crash interrupted the node commit that would have referenced it.
 * Returns the deleted hashes.
 */
export async function sweepUnreferencedBlobs(nodes: NodeMap, store: BlobStore): Promise<string[]> {
  const hashes = await store.listHashes();
  const dead = unreferencedBlobs(nodes, hashes);
  if (dead.length > 0)
    await store.delete(dead);
  return dead;
}
