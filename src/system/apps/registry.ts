import type { AppManifest } from "./types";
import { devCrashApp } from "@/apps/devcrash";
import { filesApp } from "@/apps/files";
import { notesApp } from "@/apps/notes";
import { playerApp } from "@/apps/player";
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
  viewerApp,
  playerApp,
  terminalApp,
  welcomeApp,
  settingsApp,
  // Dev-only crash trigger for E2E coverage of the per-window error
  // boundary; excluded from the array entirely unless the `e2e_crash` flag
  // is on, so a default build's `apps` is byte-for-byte what it was before.
  ...(isFlagEnabled("e2e_crash") ? [devCrashApp] : []),
];

const byId = new Map(apps.map(app => [app.id, app]));

export function getApp(id: string): AppManifest | undefined {
  return byId.get(id);
}
