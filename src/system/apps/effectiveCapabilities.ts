import type { Capability } from "@/system/sandbox/types";

/** The folder inside each installed app's bundle that the app owns outright. */
export const DATA_FOLDER_NAME = "data";

export interface ImplicitAccess {
  /** The app's private data folder; read and write, no consent prompt. */
  dataFolderId?: string | null;
  /** Files this window was handed (opened with, or picked); read-only. */
  fileIds?: readonly string[];
}

/**
 * What a window may do: the user's approved grants plus access the shell
 * gives every installed app without asking. Computed from state the shell
 * owns, never from anything the frame says, and never written back to
 * `appGrantsStore`, so Settings only ever lists what the user chose.
 */
export function effectiveCapabilities(granted: readonly Capability[], implicit: ImplicitAccess): Capability[] {
  const capabilities = [...granted];
  if (implicit.dataFolderId)
    capabilities.push(`fs.read:${implicit.dataFolderId}`, `fs.write:${implicit.dataFolderId}`);
  for (const id of implicit.fileIds ?? [])
    capabilities.push(`fs.read:${id}`);
  return capabilities;
}
