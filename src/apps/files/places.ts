/**
 * U14 "Recents" — a synthetic sidebar place, not a real `FsNode`. Sits
 * outside the VFS tree entirely: `cwd === RECENTS_ID` means "show
 * `viewPrefsStore`'s `recentIds`, most-recent first" instead of a real
 * folder's children. Kept in its own module (rather than `fsStore.ts`)
 * since it's a Files-UI-only concept, not part of the file system model.
 */
export const RECENTS_ID = "__recents__";

/** Places that aren't real folders — gates folder-only affordances (New Folder, upload, drop-to-move) the same way `inTrash` already does. */
export function isVirtualPlace(id: string): boolean {
  return id === RECENTS_ID;
}
