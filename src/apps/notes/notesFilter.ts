import type { FileScopeMode, FileSortSpec } from "@/system/fs/fileScope";
import type { NodeMap } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import { scopedFiles } from "@/system/fs/fileScope";

/**
 * Notes' half of the sidebar listing: which files count as notes, and how they
 * are sorted by default. The scope/filter/sort/pin machinery itself lives in
 * `system/fs/fileScope.ts`, shared with the code editor (D4) — only the
 * predicate below is Notes-specific.
 */

export { filterFiles as filterDocs, folderOptions, sortFiles as sortDocs, splitPinned } from "@/system/fs/fileScope";

export type NotesSortKey = FileSortSpec["key"];
export type NotesSortSpec = FileSortSpec;
export type NotesScopeMode = FileScopeMode;

/** Newest-first — matches the sidebar's pre-U11 ordering. */
export const DEFAULT_NOTES_SORT: NotesSortSpec = { key: "date", dir: "desc" };

/**
 * A note is any `text/*` file. Deliberately the plain family prefix and not
 * `effectiveMimeType`: Notes lists what it can edit as prose, and the code
 * editor's own predicate is what claims `.ts`/`.json`/`.py`.
 */
export function isNoteDoc(node: FsNode): boolean {
  return node.mimeType?.startsWith("text/") ?? false;
}

/** Every text file under `folderId` (U11) — see `scopedFiles` for the scope semantics. */
export function scopedDocs(nodes: NodeMap, folderId: string, mode: NotesScopeMode): FsNode[] {
  return scopedFiles(nodes, folderId, mode, isNoteDoc);
}
