import type { NodeMap } from "../fs/fsStore";
import type { FsNode } from "../fs/types";
import { isDescendantOf, pathOf } from "../fs/fsStore";
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

  const matches: FsNode[] = [];
  for (const node of Object.values(nodes)) {
    if (!node.name.toLowerCase().includes(q))
      continue;
    if (isTrashed(nodes, node))
      continue;
    matches.push(node);
  }

  matches.sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(q);
    const bPrefix = b.name.toLowerCase().startsWith(q);
    if (aPrefix !== bPrefix)
      return aPrefix ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return matches.slice(0, limit).map(node => ({ node, path: pathLabel(nodes, node) }));
}
