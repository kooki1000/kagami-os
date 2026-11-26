import { isFlagEnabled } from "@/system/flags";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { buildInstalledAppManifest } from "./installedAppManifest";
import { resolveInstalledAppBundles } from "./installedApps";
import { getInstalledApps, registerInstalledApps, unregisterInstalledApp } from "./registry";

/**
 * Boot-time orchestration for step 17's dynamic registry: scan `/Apps`,
 * turn whatever validates into `AppManifest`s, and register them — a no-op
 * behind the `third_party_apps` flag, gated here rather than inside any of
 * the three pieces it calls, so each stays independently testable. Must run
 * after `useFsStore.getState().init()` resolves (the caller's job — see
 * `App.tsx`) and before anything that might `launchApp` an installed app's
 * id, e.g. session restore or `startupApps`.
 */
export async function loadInstalledApps(): Promise<void> {
  if (!isFlagEnabled("third_party_apps"))
    return;
  const bundles = await resolveInstalledAppBundles(useFsStore.getState().nodes, blobStore);
  registerInstalledApps(bundles.map(buildInstalledAppManifest));
}

/**
 * B13: after an import replaces the disk, what's installed is whatever the
 * restored `/Apps` holds, not what was registered a moment ago. Drops every
 * installed app from the registry and scans again.
 */
export async function reloadInstalledApps(): Promise<void> {
  for (const app of getInstalledApps())
    unregisterInstalledApp(app.id);
  await loadInstalledApps();
}
