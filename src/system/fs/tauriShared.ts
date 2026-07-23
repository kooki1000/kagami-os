import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

/**
 * Root folder for all native persistence — the "real, isolated file system"
 * pitch (DIRECTION.md §3.1): a real folder on the host machine, sandboxed to
 * Kagami by the OS via the app's bundle identifier, that other apps' file
 * pickers don't wander into. Shared by `tauriAdapter.ts` (nodes.json) and
 * `tauriBlobStore.ts` (blobs/).
 */
export const DISK_DIR = "disk";

/**
 * Serializes async tasks onto one promise chain, so overlapping writes to
 * the same file (fsStore commits fire-and-forget) can't race each other's
 * read-modify-write and clobber one another.
 */
export function createWriteQueue() {
  let queue = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
}

/**
 * Ensures `dir` exists under `$APPDATA`, memoized so only one `mkdir` IPC
 * call is ever made per store instance (`recursive: true` already no-ops if
 * the directory exists — this just avoids repeating the round-trip).
 */
export function createDirEnsurer(dir: string): () => Promise<void> {
  let ensured: Promise<void> | null = null;
  return () => (ensured ??= mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true }));
}

/** Reads a JSON file under `$APPDATA`, or `fallback` if it doesn't exist yet. */
export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  if (!(await exists(path, { baseDir: BaseDirectory.AppData })))
    return fallback;
  const text = await readTextFile(path, { baseDir: BaseDirectory.AppData });
  return JSON.parse(text) as T;
}

/** Writes a JSON file under `$APPDATA`. */
export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeTextFile(path, JSON.stringify(value), { baseDir: BaseDirectory.AppData });
}
