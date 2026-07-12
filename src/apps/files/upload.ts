import type { FsStore, NodeMap } from "@/system/fs/fsStore";
import { childrenOf } from "@/system/fs/fsStore";
import { BLOB_INLINE_THRESHOLD } from "@/system/fs/types";

/** One file to import, with its folder path relative to the upload target. */
export interface UploadEntry {
  /** Folder names from the target down to (not including) the file. */
  path: string[];
  file: File;
}

/**
 * Distinct folder paths referenced by `entries`, parent-before-child and
 * de-duplicated. Pure — the orchestrator below turns each into a real
 * `createFolder` call (or reuses an existing folder of that name).
 */
export function uniqueFolderPaths(entries: UploadEntry[]): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const { path } of entries) {
    for (let depth = 1; depth <= path.length; depth++) {
      const prefix = path.slice(0, depth);
      const key = prefix.join("/");
      if (!seen.has(key)) {
        seen.add(key);
        result.push(prefix);
      }
    }
  }
  // Every prefix's own ancestors are pushed at a strictly lower depth (by
  // some entry that shares them), so sorting by depth alone guarantees
  // parent-before-child without needing a topological sort.
  result.sort((a, b) => a.length - b.length);
  return result;
}

/** `readEntries()` only returns a batch at a time; call it until it's empty. */
function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () => reader.readEntries((batch) => {
      if (batch.length === 0) {
        resolve(all);
        return;
      }
      all.push(...batch);
      next();
    }, reject);
    next();
  });
}

async function walkEntry(entry: FileSystemEntry, path: string[], out: UploadEntry[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ path, file });
  }
  else if (entry.isDirectory) {
    const children = await readEntries((entry as FileSystemDirectoryEntry).createReader());
    await Promise.all(children.map(child => walkEntry(child, [...path, entry.name], out)));
  }
}

/**
 * Flatten a drop's `DataTransfer` into upload entries, recursing into
 * dropped folders via the entries API. Falls back to the flat file list
 * when the browser doesn't support it (entries end up with an empty path).
 */
export async function entriesFromDataTransfer(dt: DataTransfer): Promise<UploadEntry[]> {
  const items = Array.from(dt.items);
  const roots = items
    .map(item => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => entry != null);
  if (roots.length === 0)
    return Array.from(dt.files).map(file => ({ path: [], file }));
  const out: UploadEntry[] = [];
  await Promise.all(roots.map(entry => walkEntry(entry, [], out)));
  return out;
}

/** Entries from a `<input type="file">` selection (`webkitdirectory` or not). */
export function entriesFromFileList(files: FileList): UploadEntry[] {
  return Array.from(files).map((file) => {
    // A directory-picker input stamps `webkitRelativePath`, e.g.
    // "MyPhotos/vacation/img1.jpg" — same shape drag-drop produces.
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const path = relative ? relative.split("/").slice(0, -1) : [];
    return { path, file };
  });
}

export interface UploadResult {
  fileCount: number;
  totalBytes: number;
  failed: number;
}

/**
 * Import `entries` into `targetParentId`: recreate their folder structure
 * (reusing same-named existing folders) and write each file. Uploads always
 * go through the blob store — bytes are opaque and shouldn't be assumed to
 * be UTF-8 text — except small `text/*` files, which stay inline so they're
 * immediately editable in Notes (matching B1's inline-threshold rule).
 * One bad file doesn't abort the rest.
 */
export async function uploadEntries(
  targetParentId: string,
  entries: UploadEntry[],
  fs: Pick<FsStore, "createFolder" | "createFile" | "createBlobFile">,
  getNodes: () => NodeMap,
): Promise<UploadResult> {
  const folderIds = new Map<string, string>([["", targetParentId]]);

  function resolveFolder(path: string[]): string {
    const key = path.join("/");
    const existing = folderIds.get(key);
    if (existing)
      return existing;
    const parentId = folderIds.get(path.slice(0, -1).join("/"))!;
    const name = path[path.length - 1];
    const reuse = childrenOf(getNodes(), parentId)
      .find(n => n.type === "folder" && n.name.toLowerCase() === name.toLowerCase());
    const id = reuse ? reuse.id : fs.createFolder(parentId, name).id;
    folderIds.set(key, id);
    return id;
  }

  for (const path of uniqueFolderPaths(entries))
    resolveFolder(path);

  let fileCount = 0;
  let totalBytes = 0;
  let failed = 0;
  await Promise.all(entries.map(async ({ path, file }) => {
    try {
      const parentId = resolveFolder(path);
      if (file.type.startsWith("text/") && file.size <= BLOB_INLINE_THRESHOLD)
        fs.createFile(parentId, file.name, await file.text(), file.type);
      else
        await fs.createBlobFile(parentId, file.name, file, file.type || undefined);
      fileCount++;
      totalBytes += file.size;
    }
    catch (error) {
      console.error(`[kagami-files] failed to upload "${file.name}":`, error);
      failed++;
    }
  }));

  return { fileCount, totalBytes, failed };
}
