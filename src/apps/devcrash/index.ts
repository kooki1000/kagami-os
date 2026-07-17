import type { AppManifest } from "@/system/apps/types";
import { Bug } from "lucide-react";
import { lazy } from "react";

/**
 * Dev-only crash trigger (flag `e2e_crash`, see `system/flags.ts`) — throws
 * during its first render so an E2E test can exercise the per-window
 * `WindowErrorBoundary` crash card. Only registered in `registry.ts` when
 * the flag is on; never shipped/pinned in a production build.
 */
export const devCrashApp: AppManifest = {
  id: "devcrash",
  name: "Crash Test",
  icon: Bug,
  tileGradient: ["#e05a5a", "#a3302f"],
  defaultSize: { width: 360, height: 240 },
  minSize: { width: 280, height: 180 },
  component: lazy(() => import("./DevCrashApp")),
  // Pinned so the dock tile exists to click without first launching it some
  // other way — the dock only lists pinned or currently-running apps.
  pinned: true,
};
