import type { NodeMap } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import { childrenOf } from "@/system/fs/fsStore";

/**
 * Every other file in `node`'s folder that matches `filter`, in the same
 * order Files lists them. Shared by Player (D5) and Viewer (D2) for their
 * folder-scoped "Next/Previous" playlist/slideshow cursor.
 */
export function siblingsOf(
  nodes: NodeMap,
  node: FsNode | undefined,
  filter: (n: FsNode) => boolean,
): FsNode[] {
  if (!node)
    return [];
  return childrenOf(nodes, node.parentId ?? "").filter(filter);
}

/**
 * The id `delta` positions away from `currentId` within `siblings`,
 * wrapping around at either end. Null when there's nothing to step to.
 * `currentId` not being found in `siblings` (e.g. it was just trashed, or
 * there's no current id yet) falls back to the first entry regardless of
 * `delta`'s sign, rather than guessing an offset from an unknown position.
 */
export function stepSibling(
  siblings: FsNode[],
  currentId: string | null,
  delta: number,
): string | null {
  if (siblings.length === 0)
    return null;
  const idx = siblings.findIndex(n => n.id === currentId);
  const next = idx === -1 ? 0 : (idx + delta + siblings.length) % siblings.length;
  return siblings[next].id;
}
