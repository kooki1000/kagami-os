import type { NodeMap } from "../fs/fsStore";
import type { FsNode } from "../fs/types";
import { collator, isDescendantOf, pathOf } from "../fs/fsStore";
import { TRASH_ID } from "../fs/types";

export interface SearchResult {
  node: FsNode;
  /** Ancestor path label for disambiguation, e.g. "Documents/Projects". */
  path: string;
}

const DEFAULT_LIMIT = 20;

function pathLabel(nodes: NodeMap, node: FsNode): string {
  if (!node.parentId)
    return "";
  return pathOf(nodes, node.parentId).slice(1).map(n => n.name).join("/");
}

function isTrashed(nodes: NodeMap, node: FsNode): boolean {
  return node.parentId === TRASH_ID || isDescendantOf(nodes, node.id, TRASH_ID);
}

/**
 * Case-insensitive substring match over every node's name, excluding
 * anything in the Trash. Prefix matches rank above interior matches; ties
 * break alphabetically. Capped at `limit` results.
 */
export function searchNodes(nodes: NodeMap, query: string, limit = DEFAULT_LIMIT): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q)
    return [];

  // Lowercase each matched name once here rather than in the sort
  // comparator below, which would otherwise recompute it on every
  // comparison across the O(n log n) sort.
  const matches: { node: FsNode; lower: string }[] = [];
  for (const node of Object.values(nodes)) {
    const lower = node.name.toLowerCase();
    if (!lower.includes(q))
      continue;
    if (isTrashed(nodes, node))
      continue;
    matches.push({ node, lower });
  }

  matches.sort((a, b) => {
    const aPrefix = a.lower.startsWith(q);
    const bPrefix = b.lower.startsWith(q);
    if (aPrefix !== bPrefix)
      return aPrefix ? -1 : 1;
    return collator.compare(a.node.name, b.node.name);
  });

  return matches.slice(0, limit).map(({ node }) => ({ node, path: pathLabel(nodes, node) }));
}
