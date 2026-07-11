export type FsNodeType = "file" | "folder";

/**
 * Reference to a file's bytes in the {@link BlobStore} (B1). Present instead
 * of inline `content` for binaries and large text; the bytes are addressed
 * by their SHA-256 `hash`.
 */
export interface ContentRef {
  hash: string;
  size: number;
  mimeType?: string;
}

export interface FsNode {
  id: string;
  /** `null` only for the root node. */
  parentId: string | null;
  name: string;
  type: FsNodeType;
  mimeType?: string;
  /**
   * Inline text content, kept only for small text (≤ {@link BLOB_INLINE_THRESHOLD}).
   * Larger text and all binaries live in the blob store via `contentRef`.
   * A node has at most one of `content` / `contentRef`.
   */
  content?: string;
  /** Reference to blob-stored bytes; mutually exclusive with `content`. */
  contentRef?: ContentRef;
  createdAt: number;
  modifiedAt: number;
  /** Original parent id, present while the node sits in the trash. */
  trashedFrom?: string;
}

/**
 * Size boundary between inline `content` and blob storage: text at or under
 * this stays a string (Notes, Terminal, sync ops keep their simple path);
 * everything larger, and all binaries, go to the blob store.
 */
export const BLOB_INLINE_THRESHOLD = 64 * 1024;

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
 * Binary content seam (B1). File bytes live here, content-addressed by a
 * SHA-256 hash, separate from the metadata nodes — so `loadAll` stays small
 * and identical bytes are stored once. The MVP backend is IndexedDB; a
 * server (S3 presigned URLs) swaps in here later. See
 * `docs/blob-architecture.md`.
 */
export interface BlobStore {
  /** Is a blob with this hash already stored? (Enables skip-if-present writes.) */
  has: (hash: string) => Promise<boolean>;
  get: (hash: string) => Promise<Blob | null>;
  put: (hash: string, blob: Blob) => Promise<void>;
  delete: (hashes: string[]) => Promise<void>;
  /** Every stored hash — the input to the GC refcount sweep. */
  listHashes: () => Promise<string[]>;
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
