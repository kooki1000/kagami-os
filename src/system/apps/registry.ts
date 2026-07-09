import type { AppManifest } from "./types";
import { filesApp } from "@/apps/files";
import { notesApp } from "@/apps/notes";
import { settingsApp } from "@/apps/settings";
import { terminalApp } from "@/apps/terminal";
import { viewerApp } from "@/apps/viewer";
import { welcomeApp } from "@/apps/welcome";

/**
 * Every app the shell knows about. Adding an app = adding a manifest
 * here; the dock, menu bar, and window manager pick it up generically.
 */
export const apps: AppManifest[] = [
  filesApp,
  notesApp,
  viewerApp,
  terminalApp,
  welcomeApp,
  settingsApp,
];

const byId = new Map(apps.map(app => [app.id, app]));

export function getApp(id: string): AppManifest | undefined {
  return byId.get(id);
}
