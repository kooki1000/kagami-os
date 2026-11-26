import { useDockStore } from "@/system/dock/dockStore";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { useWindowStore } from "@/system/windows/windowStore";
import { useAppGrantsStore } from "./appGrantsStore";
import { resolveInstalledAppBundles } from "./installedApps";
import { unregisterInstalledApp } from "./registry";

/**
 * Step 17 (D8.6) — removes an installed third-party app and everything the
 * shell kept on its behalf: open windows, the `/Apps/<id>` folder (bundle
 * and manifest, gone for good — `/Apps` is shell-owned, so there's nothing
 * to restore from Trash), the registry entry, the recorded grant, and every
 * per-app preference that could still name the id (dock pin, startup
 * launch, remembered window size, file-type defaults).
 *
 * Windows close first so no frame is left holding a capability whose grant
 * is about to vanish. The grant is cleared last-but-one, after the bundle:
 * a crash in between leaves an app that boots with no capabilities, never
 * one with grants and no bundle.
 *
 * Resolves to `false` if no installed bundle has that id — which is also
 * how a built-in id is refused, since built-ins never live in `/Apps`.
 */
export async function uninstallApp(appId: string): Promise<boolean> {
  const fs = useFsStore.getState();
  const bundles = await resolveInstalledAppBundles(fs.nodes, blobStore);
  const bundle = bundles.find(b => b.manifest.id === appId);
  if (!bundle)
    return false;

  useWindowStore.getState().closeApp(appId);
  unregisterInstalledApp(appId);
  fs.deleteForever(bundle.folderId);
  useAppGrantsStore.getState().clearGrant(appId);

  useDockStore.getState().unpin(appId);
  const settings = useSettingsStore.getState();
  settings.setStartupAppEnabled(appId, false);
  settings.clearDefaultWindowSize(appId);
  for (const [mime, id] of Object.entries(settings.fileAssociations)) {
    if (id === appId)
      settings.clearFileAssociation(mime);
  }
  return true;
}
