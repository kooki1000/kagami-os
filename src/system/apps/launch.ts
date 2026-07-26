import { useSettingsStore } from "../settings/settingsStore";
import { useWindowStore } from "../windows/windowStore";
import { getApp } from "./registry";

export interface LaunchOptions {
  /** App-defined launch data (e.g. which file to open). */
  payload?: unknown;
  /** Window title override (defaults to the app name). */
  title?: string;
}

/**
 * Bridge from an app manifest to the window store. Sizing: a per-app
 * "Remember this size" override (U9's `settingsStore.defaultWindowSize`,
 * set via the app menu's "Remember Window Size" command) wins over the
 * manifest's own `defaultSize` — there's no per-call size override in
 * `LaunchOptions` today, so this is the one place "no explicit size was
 * requested" can mean.
 */
export function launchApp(appId: string, options: LaunchOptions = {}): string | null {
  const app = getApp(appId);
  if (!app)
    return null;
  const rememberedSize = useSettingsStore.getState().defaultWindowSize[appId];
  return useWindowStore.getState().openWindow(app.id, {
    title: options.title ?? app.name,
    size: rememberedSize ?? app.defaultSize,
    minSize: app.minSize,
    singleInstance: app.singleInstance,
    payload: options.payload,
  });
}
