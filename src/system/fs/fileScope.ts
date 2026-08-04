import type { NodeMap } from "./fsStore";
import type { FsNode } from "./types";
import { childIdsByParent, collator, isDescendantOf } from "./fsStore";
import { TRASH_ID } from "./types";

/**
 * Listing a folder's files for an app's own sidebar — scope, filter, sort and
 * pinning.
 *
 * Written for Notes (U11) and generalized when the code editor (D4) grew the
 * same sidebar: the *logic* here is app-agnostic, and the one thing that isn't
 * — which files belong in the list at all — is the `accepts` predicate each
 * app supplies. Everything an app should own (its sort default, its prefs, its
 * context menu) deliberately stays out.
 */

export type FileScopeMode = "folder" | "subtree";

export type FileSortKey = "name" | "date";
export interface FileSortSpec {
  key: FileSortKey;
  dir: "asc" | "desc";
}

/** Every descendant id of `rootId` (not including `rootId` itself), walked via the shared `childIdsByParent` index. */
function descendantIds(childIds: Map<string, string[]>, rootId: string): Set<string> {
  const result = new Set<string>();
  const stack = [...(childIds.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id))
      continue;
    result.add(id);
    const children = childIds.get(id);
    if (children)
      stack.push(...children);
  }
  return result;
}

/**
 * Every file under `folderId` that `accepts` wants: `"folder"` scopes to
 * direct children only, `"subtree"` includes every descendant folder too.
 * Trash (and anything inside it) is always excluded — a sidebar is a place to
 * work, not a place to find deleted things.
 */
export function scopedFiles(
  nodes: NodeMap,
  folderId: string,
  mode: FileScopeMode,
  accepts: (node: FsNode) => boolean,
): FsNode[] {
  const childIds = childIdsByParent(nodes);
  // Walk down from the scope folder rather than scanning every node and
  // filtering — the same O(subtree) vs O(drive) change `childrenOf` made
  // under T7 (`docs/perf-baseline.md`).
  const candidateIds = mode === "folder"
    ? childIds.get(folderId) ?? []
    : descendantIds(childIds, folderId);
  // Nothing under Trash is listed. In "folder" mode every candidate is a
  // direct child, so the only question is whether the folder itself is in
  // there — no need to walk the whole Trash subtree to find out.
  if (mode === "folder" && isDescendantOf(nodes, folderId, TRASH_ID))
    return [];
  const trashIds = mode === "folder" ? null : descendantIds(childIds, TRASH_ID);

  const files: FsNode[] = [];
  for (const id of candidateIds) {
    if (trashIds?.has(id))
      continue;
    const node = nodes[id];
    if (node?.type === "file" && accepts(node))
      files.push(node);
  }
  return files;
}

/** Case-insensitive substring filter on name — mirrors Files' filter input. */
export function filterFiles(files: FsNode[], query: string): FsNode[] {
  const q = query.trim().toLowerCase();
  return q ? files.filter(d => d.name.toLowerCase().includes(q)) : files;
}

export function sortFiles(files: FsNode[], sort: FileSortSpec): FsNode[] {
  return [...files].sort((a, b) => {
    const primary = sort.key === "name" ? collator.compare(a.name, b.name) : a.modifiedAt - b.modifiedAt;
    return sort.dir === "desc" ? -primary : primary;
  });
}

/** Files already in `pinnedIds` first (in list order), then everything else. */
export function splitPinned(files: FsNode[], pinnedIds: ReadonlySet<string>): { pinned: FsNode[]; rest: FsNode[] } {
  const pinned: FsNode[] = [];
  const rest: FsNode[] = [];
  for (const file of files)
    (pinnedIds.has(file.id) ? pinned : rest).push(file);
  return { pinned, rest };
}

export interface FolderOption {
  id: string;
  name: string;
  depth: number;
}

/**
 * Flattened, depth-indented folder list rooted at `rootId` (inclusive),
 * children alphabetical, skipping the Trash subtree entirely — feeds a
 * sidebar's folder-scope switcher. `rootId` itself is skipped only if it
 * doesn't exist or isn't a folder.
 */
export function folderOptions(nodes: NodeMap, rootId: string): FolderOption[] {
  const root = nodes[rootId];
  if (!root || root.type !== "folder")
    return [];
  const childIds = childIdsByParent(nodes);
  const options: FolderOption[] = [];
  function walk(id: string, depth: number): void {
    if (id === TRASH_ID)
      return;
    const node = nodes[id];
    if (!node)
      return;
    options.push({ id, name: node.name, depth });
    const children = (childIds.get(id) ?? [])
      .filter(childId => nodes[childId]?.type === "folder")
      .sort((a, b) => collator.compare(nodes[a].name, nodes[b].name));
    for (const childId of children)
      walk(childId, depth + 1);
  }
  walk(rootId, 0);
  return options;
}
