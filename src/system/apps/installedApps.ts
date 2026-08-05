import type { AppBundleManifest } from "./manifestSchema";
import type { NodeMap } from "@/system/fs/fsStore";
import type { BlobStore } from "@/system/fs/types";
import { resolveFileBytes } from "@/apps/files/download";
import { childrenOf } from "@/system/fs/fsStore";
import { APPS_ID } from "@/system/fs/types";
import { parseAppManifest } from "./manifestSchema";

/** One installed bundle: its parsed manifest, plus the fs node id of its entry script. */
export interface InstalledAppBundle {
  manifest: AppBundleManifest;
  entryNodeId: string;
}

/**
 * Scans `/Apps` for installed third-party bundles: one subfolder per app,
 * each expected to hold a `manifest.json` and the file its `entry` field
 * names. A subfolder missing either file, whose `manifest.json` isn't valid
 * JSON, or whose parsed shape `parseAppManifest` rejects, is skipped rather
 * than thrown on — one malformed bundle must never block every other
 * installed app from appearing. Callers turn the result into `AppManifest`s
 * (`installedAppManifest.ts`) and register them (`registry.ts`).
 */
export async function resolveInstalledAppBundles(nodes: NodeMap, blobStore: BlobStore): Promise<InstalledAppBundle[]> {
  const bundles: InstalledAppBundle[] = [];
  const appsFolder = nodes[APPS_ID];
  if (!appsFolder || appsFolder.type !== "folder")
    return bundles;

  for (const folder of childrenOf(nodes, APPS_ID)) {
    if (folder.type !== "folder")
      continue;
    const siblings = childrenOf(nodes, folder.id);
    const manifestNode = siblings.find(n => n.type === "file" && n.name === "manifest.json");
    if (!manifestNode)
      continue;

    try {
      const bytes = await resolveFileBytes(manifestNode, blobStore);
      const manifest = parseAppManifest(JSON.parse(new TextDecoder().decode(bytes)));
      if (!manifest)
        continue;
      const entryNode = siblings.find(n => n.type === "file" && n.name === manifest.entry);
      if (!entryNode)
        continue;
      bundles.push({ manifest, entryNodeId: entryNode.id });
    }
    catch {
      // Malformed JSON, missing bytes, or a corrupt blob — skip this bundle.
    }
  }
  return bundles;
}
