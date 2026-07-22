import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function getPreference(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

/**
 * Live-tracks the OS "reduce motion" preference. Deliberately re-reads
 * matchMedia() fresh on each mount (not cached once at module scope, the way
 * themeStore does for dark-mode) — Playwright's emulateMedia() applies
 * asynchronously relative to module evaluation on WebKit specifically, so a
 * singleton created at import time can capture a stale reading under test.
 * By the time this component first renders, well after the whole bundle has
 * loaded and evaluated, the race has settled; a real end-user's OS-level
 * preference never changes between module load and first render anyway, so
 * this costs nothing outside of tests.
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
