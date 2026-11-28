import type { AppManifest } from "./types";
import { browserApp } from "@/apps/browser";
import { calculatorApp } from "@/apps/calculator";
import { clockApp } from "@/apps/clock";
import { codeApp } from "@/apps/code";
import { devCrashApp } from "@/apps/devcrash";
import { documentsApp } from "@/apps/documents";
import { filesApp } from "@/apps/files";
import { notesApp } from "@/apps/notes";
import { paintApp } from "@/apps/paint";
import { playerApp } from "@/apps/player";
import { sandboxDemoApp } from "@/apps/sandboxDemo";
import { settingsApp } from "@/apps/settings";
import { terminalApp } from "@/apps/terminal";
import { viewerApp } from "@/apps/viewer";
import { welcomeApp } from "@/apps/welcome";
import { isFlagEnabled } from "@/system/flags";

/**
 * Every app the shell knows about. Adding an app = adding a manifest
 * here; the dock, menu bar, and window manager pick it up generically.
 */
export const apps: AppManifest[] = [
  filesApp,
  notesApp,
  codeApp,
  viewerApp,
  documentsApp,
  calculatorApp,
  clockApp,
  paintApp,
  playerApp,
  terminalApp,
  welcomeApp,
  settingsApp,
  // Always registered, even on the web build — native-only features present
  // a clean "available in the desktop app" state rather than vanishing
  // (DIRECTION.md §4); BrowserApp itself branches on isTauri().
  browserApp,
  // Dev-only crash trigger for E2E coverage of the per-window error
  // boundary; excluded from the array entirely unless the `e2e_crash` flag
  // is on, so a default build's `apps` is byte-for-byte what it was before.
  ...(isFlagEnabled("e2e_crash") ? [devCrashApp] : []),
  // Dev-only capability-sandbox demo (step 16a), same exclusion pattern.
  ...(isFlagEnabled("app_sandbox") ? [sandboxDemoApp] : []),
];

const byId = new Map(apps.map(app => [app.id, app]));

export function getApp(id: string): AppManifest | undefined {
  return byId.get(id);
}

/**
 * Ids the built-in suite owns. An installed bundle may never take one:
 * `byId` is last-write-wins, so a bundle whose manifest says `"id": "notes"`
 * would otherwise silently replace Notes everywhere the shell looks an app
 * up, and uninstalling it would then delete the built-in's entry.
 */
const builtInIds: ReadonlySet<string> = new Set([...apps.map(app => app.id), "devcrash", "sandboxDemo"]);

export function isBuiltInAppId(id: string): boolean {
  return builtInIds.has(id);
}

const installed = new Map<string, AppManifest>();

// Installed apps arrive after first paint (the scan waits on the VFS), so
// anything drawn from the registry — the dock's pinned tiles — has to hear
// about it. `version` is the snapshot `useSyncExternalStore` compares.
const listeners = new Set<() => void>();
let version = 0;

function registryChanged(): void {
  version += 1;
  listeners.forEach(listener => listener());
}

export function subscribeToRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever an installed app is registered or removed. */
export function getRegistryVersion(): number {
  return version;
}

/**
 * Step 17 (D8.4): adds installed third-party apps to the lookup `getApp`
 * resolves against, called once at boot after the VFS is ready and the
 * `/Apps` scan (`installedApps.ts`) resolves — gated behind the
 * `third_party_apps` flag by that call site, not here. Deliberately doesn't
 * touch the exported `apps` array: every consumer except Settings' two
 * startup-config lists only ever does a by-id lookup (`getApp`), so this is
 * enough for an installed app to appear in the dock once launched or
 * pinned. Settings' startup list reads `getInstalledApps()` as well.
 *
 * A manifest whose id collides with a built-in is ignored.
 */
export function registerInstalledApps(list: readonly AppManifest[]): void {
  for (const app of list) {
    if (builtInIds.has(app.id))
      continue;
    byId.set(app.id, app);
    installed.set(app.id, app);
  }
  registryChanged();
}

/** D8.6: the inverse of `registerInstalledApps`. Never touches a built-in. */
export function unregisterInstalledApp(id: string): void {
  if (!installed.delete(id))
    return;
  byId.delete(id);
  registryChanged();
}

/** Installed third-party apps, in registration order. */
export function getInstalledApps(): AppManifest[] {
  return [...installed.values()];
}
