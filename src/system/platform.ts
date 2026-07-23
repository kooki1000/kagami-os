import { isTauri as detectTauri } from "@tauri-apps/api/core";

/**
 * Whether the app is running inside the native (Tauri) shell rather than a
 * plain browser tab. Runtime detection, not a build-time flag — a device's
 * runtime is a fact about its environment, not an opt-in feature.
 *
 * This is the single gate every native-only branch should route through
 * (`DIRECTION.md` §4) — never scatter ad-hoc environment checks elsewhere.
 */
export function isTauri(): boolean {
  return detectTauri();
}
