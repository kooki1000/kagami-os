import { useEffect, useState } from "react";

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
