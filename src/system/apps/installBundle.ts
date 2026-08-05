import type { AppBundleManifest } from "./manifestSchema";
import { unzipInWorker } from "@/apps/files/exportImport";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { fileSystem } from "@/system/fs/provider";
import { APPS_ID } from "@/system/fs/types";
import { setGrantedCapabilities } from "./appGrantsStore";
import { buildInstalledAppManifest } from "./installedAppManifest";
import { resolveInstalledAppBundles } from "./installedApps";
import { parseAppManifest } from "./manifestSchema";
import { registerInstalledApps } from "./registry";

export class InvalidBundleError extends Error {}

/** A parsed, schema-valid bundle, not yet installed — what the consent screen shows. */
export interface ParsedBundle {
  manifest: AppBundleManifest;
  entryBytes: Uint8Array;
}

/**
 * Pure(ish) half of parsing: given an already-unzipped archive's entries,
 * find and validate `manifest.json`, then the file its `entry` field names.
 * Split out from `parseBundleZip` for the same reason `exportImport.ts`
 * splits `planImport` from `importDisk` — this half is unit-testable under
 * Vitest's Node environment, the unzip-a-real-File half isn't.
 */
export function resolveBundleFromEntries(entries: Record<string, Uint8Array>): ParsedBundle {
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes)
    throw new InvalidBundleError("This bundle has no manifest.json.");

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(manifestBytes));
  }
  catch {
    throw new InvalidBundleError("manifest.json isn't valid JSON.");
  }
  const manifest = parseAppManifest(raw);
  if (!manifest)
    throw new InvalidBundleError("manifest.json is missing required fields, or has an invalid shape.");

  const entryBytes = entries[manifest.entry];
  if (!entryBytes)
    throw new InvalidBundleError(`This bundle's manifest names an entry file ("${manifest.entry}") that isn't in the archive.`);

  return { manifest, entryBytes };
}

/** Unzips `file` off the main thread and validates its contents. Not unit-tested — see `resolveBundleFromEntries`. */
export async function parseBundleZip(file: File): Promise<ParsedBundle> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = await unzipInWorker(bytes);
  }
  catch {
    throw new InvalidBundleError("This file isn't a valid zip archive.");
  }
  return resolveBundleFromEntries(entries);
}

/**
 * Writes an already-parsed, user-approved bundle into `/Apps`, records
 * exactly what was approved (`appGrantsStore` — separate from the
 * manifest's own `capabilities` wishlist), and registers it with the live
 * registry so it's launchable with no reload. The caller (the consent
 * dialog) is the only gate: this function trusts that showing `manifest` to
 * the user and calling this *is* the approval, same as `notifications.notify`
 * trusts the shell's own `notify()` call is legitimate.
 *
 * Refuses a manifest id that's already installed rather than overwriting —
 * an update/reinstall flow is a real design question of its own (does it
 * re-prompt for consent if capabilities changed? what happens to the old
 * data directory?) and isn't implied by "make install work."
 */
export async function commitInstall({ manifest, entryBytes }: ParsedBundle): Promise<void> {
  const nodes = useFsStore.getState().nodes;
  const existing = await resolveInstalledAppBundles(nodes, blobStore);
  if (existing.some(bundle => bundle.manifest.id === manifest.id))
    throw new InvalidBundleError(`"${manifest.name}" is already installed.`);

  const folder = await fileSystem.mkdir(APPS_ID, manifest.id);
  // Re-serialize the *parsed* manifest, not the raw uploaded bytes — strips
  // anything parseAppManifest didn't recognize, so what's on disk always
  // matches what the consent screen actually showed.
  await fileSystem.writeFile(folder.id, "manifest.json", JSON.stringify(manifest));
  const entryNode = await fileSystem.writeFile(folder.id, manifest.entry, new TextDecoder().decode(entryBytes), "text/javascript");

  setGrantedCapabilities(manifest.id, manifest.capabilities);
  registerInstalledApps([buildInstalledAppManifest({ manifest, entryNodeId: entryNode.id })]);
}
