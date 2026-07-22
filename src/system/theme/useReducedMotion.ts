import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const media = typeof window !== "undefined" ? window.matchMedia(QUERY) : null;

/** Live-tracks the OS "reduce motion" preference, mirroring themeStore's matchMedia pattern. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => media?.matches ?? false);

  useEffect(() => {
    if (!media)
      return;
    function onChange(): void {
      setReduced(media!.matches);
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
