import { useWindowStore } from "../windows/windowStore";
import { getApp } from "./registry";

export interface LaunchOptions {
  /** App-defined launch data (e.g. which file to open). */
  payload?: unknown;
  /** Window title override (defaults to the app name). */
  title?: string;
}

/** Bridge from an app manifest to the window store. */
export function launchApp(appId: string, options: LaunchOptions = {}): string | null {
  const app = getApp(appId);
  if (!app)
    return null;
  return useWindowStore.getState().openWindow(app.id, {
    title: options.title ?? app.name,
    size: app.defaultSize,
    minSize: app.minSize,
    singleInstance: app.singleInstance,
    payload: options.payload,
  });
}
