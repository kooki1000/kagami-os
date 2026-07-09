export type FsNodeType = "file" | "folder";

export interface FsNode {
  id: string;
  /** `null` only for the root node. */
  parentId: string | null;
  name: string;
  type: FsNodeType;
  mimeType?: string;
  /** Text content, or a data URL for images. */
  content?: string;
  createdAt: number;
  modifiedAt: number;
  /** Original parent id, present while the node sits in the trash. */
  trashedFrom?: string;
}

/** Well-known node ids; seeded folders that always exist. */
export const ROOT_ID = "root";
export const HOME_ID = "home";
export const DESKTOP_ID = "desktop";
export const DOCUMENTS_ID = "documents";
export const DOWNLOADS_ID = "downloads";
export const PICTURES_ID = "pictures";
export const TRASH_ID = "trash";

export const SYSTEM_IDS: ReadonlySet<string> = new Set([
  ROOT_ID,
  HOME_ID,
  DESKTOP_ID,
  DOCUMENTS_ID,
  DOWNLOADS_ID,
  PICTURES_ID,
  TRASH_ID,
]);

/**
 * Persistence seam. The file system store talks only to this interface;
 * the MVP backend is IndexedDB, a server backend swaps in here later.
 */
export interface StorageAdapter {
  /** All persisted nodes, or `null` when the store is empty (first run). */
  loadAll: () => Promise<FsNode[] | null>;
  putMany: (nodes: FsNode[]) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
}

/**
 * App-facing async file system API (what Terminal & co. program against).
 * UI code may instead subscribe to the reactive store for live updates —
 * both views are backed by the same state.
 */
export interface FileSystemProvider {
  readDir: (id: string) => Promise<FsNode[]>;
  readFile: (id: string) => Promise<FsNode>;
  writeFile: (parentId: string, name: string, content: string, mimeType?: string) => Promise<FsNode>;
  mkdir: (parentId: string, name: string) => Promise<FsNode>;
  move: (id: string, newParentId: string) => Promise<void>;
  rename: (id: string, newName: string) => Promise<void>;
  /** Moves to trash (or deletes permanently when already trashed). */
  delete: (id: string) => Promise<void>;
  stat: (id: string) => Promise<FsNode | null>;
}
