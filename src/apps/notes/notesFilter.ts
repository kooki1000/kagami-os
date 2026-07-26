import type { NodeMap } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import { childIdsByParent, collator } from "@/system/fs/fsStore";
import { TRASH_ID } from "@/system/fs/types";

export type NotesSortKey = "name" | "date";
export interface NotesSortSpec {
  key: NotesSortKey;
  dir: "asc" | "desc";
}

/** Newest-first — matches the sidebar's pre-U11 ordering. */
export const DEFAULT_NOTES_SORT: NotesSortSpec = { key: "date", dir: "desc" };

export type NotesScopeMode = "folder" | "subtree";

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
 * Every text file under `folderId` (U11): `"folder"` scopes to direct
 * children only, `"subtree"` includes every descendant folder too. Trash
 * (and anything inside it) is always excluded, same as the pre-U11 "every
 * text doc on the drive" listing did.
 */
export function scopedDocs(nodes: NodeMap, folderId: string, mode: NotesScopeMode): FsNode[] {
  const childIds = childIdsByParent(nodes);
  const trashIds = descendantIds(childIds, TRASH_ID);
  const subtreeIds = mode === "subtree" ? descendantIds(childIds, folderId) : null;
  return Object.values(nodes).filter((n) => {
    if (n.type !== "file" || !(n.mimeType?.startsWith("text/") ?? false))
      return false;
    if (trashIds.has(n.id))
      return false;
    return mode === "folder" ? n.parentId === folderId : subtreeIds!.has(n.id);
  });
}

/** Case-insensitive substring filter on name — mirrors Files' filter input. */
export function filterDocs(docs: FsNode[], query: string): FsNode[] {
  const q = query.trim().toLowerCase();
  return q ? docs.filter(d => d.name.toLowerCase().includes(q)) : docs;
}

export function sortDocs(docs: FsNode[], sort: NotesSortSpec): FsNode[] {
  return [...docs].sort((a, b) => {
    const primary = sort.key === "name" ? collator.compare(a.name, b.name) : a.modifiedAt - b.modifiedAt;
    return sort.dir === "desc" ? -primary : primary;
  });
}

/** Docs already in `pinnedIds` first (in list order), then everything else. */
export function splitPinned(docs: FsNode[], pinnedIds: ReadonlySet<string>): { pinned: FsNode[]; rest: FsNode[] } {
  const pinned: FsNode[] = [];
  const rest: FsNode[] = [];
  for (const doc of docs)
    (pinnedIds.has(doc.id) ? pinned : rest).push(doc);
  return { pinned, rest };
}

export interface FolderOption {
  id: string;
  name: string;
  depth: number;
}

/**
 * Flattened, depth-indented folder list rooted at `rootId` (inclusive),
 * children alphabetical, skipping the Trash subtree entirely — feeds the
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
