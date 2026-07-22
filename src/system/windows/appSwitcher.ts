import type { OsWindow } from "./windowStore";

/**
 * Unique running app ids, most-recently-focused first — like a real
 * Alt-Tab list. Ranked by each app's most-recent (highest) zIndex across
 * all its windows; since focusing a window always bumps it to the top of
 * `nextZ`, the currently focused window's app sorts first without needing
 * `focusedId` as a separate input.
 */
export function orderedRunningApps(windows: OsWindow[]): string[] {
  const maxZByApp = new Map<string, number>();
  for (const w of windows) {
    const current = maxZByApp.get(w.appId);
    if (current === undefined || w.zIndex > current)
      maxZByApp.set(w.appId, w.zIndex);
  }
  return [...maxZByApp.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([appId]) => appId);
}
