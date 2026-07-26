import type { ReduceMotionPreference } from "@/system/settings/settingsStore";
import { useEffect, useState } from "react";
import { useSettingsStore } from "@/system/settings/settingsStore";

const QUERY = "(prefers-reduced-motion: reduce)";

function getPreference(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

/**
 * Live-tracks the OS "reduce motion" preference. Reads matchMedia() fresh
 * per mount rather than caching one instance at module scope (unlike
 * themeStore's dark-mode check) — Playwright's emulateMedia() can apply
 * after module evaluation on WebKit, so a module-scope singleton risks a
 * stale reading under test; free in production, since a real preference
 * never changes between module load and first render.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getPreference);

  useEffect(() => {
    if (typeof window === "undefined")
      return;
    const mql = window.matchMedia(QUERY);
    function onChange(): void {
      setReduced(mql.matches);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * U6: layers the settings-store's explicit `reduceMotion` override on top of
 * the OS query's `osReduced` reading — `"system"` defers to it, `"on"`/`"off"`
 * win regardless of what the OS reports. Pure and exported separately from
 * {@link useEffectiveReducedMotion} so the override logic itself is
 * unit-testable without a DOM/matchMedia (this repo's unit suites run in a
 * plain `node` environment, no jsdom).
 */
export function resolveEffectiveReducedMotion(
  override: ReduceMotionPreference,
  osReduced: boolean,
): boolean {
  if (override === "on")
    return true;
  if (override === "off")
    return false;
  return osReduced;
}

/** {@link useReducedMotion}'s OS reading, with the settings-store override (U6) layered on top. */
export function useEffectiveReducedMotion(): boolean {
  const override = useSettingsStore(s => s.reduceMotion);
  const osReduced = useReducedMotion();
  return resolveEffectiveReducedMotion(override, osReduced);
}
