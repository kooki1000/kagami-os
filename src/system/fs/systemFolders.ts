import type { NodeMap } from "./fsStore";
import type { FsNode } from "./types";
import { APPS_ID, ROOT_ID } from "./types";

/**
 * Backfills the `Apps` system folder (step 17/D8) onto a tree that was
 * seeded before it existed — `createSeedNodes()` only runs for a genuinely
 * empty store, so an already-initialized install would otherwise never gain
 * it. Idempotent, same shape as `migrateInlineBlobs`: returns the node to
 * add when missing, or `null` when a re-run finds it already there.
 */
export function ensureAppsFolder(nodes: NodeMap, now: number): FsNode | null {
  if (nodes[APPS_ID])
    return null;
  return {
    id: APPS_ID,
    parentId: ROOT_ID,
    name: "Apps",
    type: "folder",
    createdAt: now,
    modifiedAt: now,
  };
}
