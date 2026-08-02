import type { AppManifest } from "@/system/apps/types";
import { Clock as ClockIcon } from "lucide-react";
import { lazy } from "react";

/**
 * D7 (step 16b) — live clock + stopwatch + countdown timer. Entirely
 * ephemeral: no `serializePayload`/`restorePayload`, all state resets when
 * the window closes.
 */
export const clockApp: AppManifest = {
  id: "clock",
  name: "Clock",
  icon: ClockIcon,
  tileGradient: ["#7ba8d9", "#4f7fb8"],
  defaultSize: { width: 340, height: 380 },
  minSize: { width: 300, height: 340 },
  component: lazy(() => import("./ClockApp")),
  singleInstance: true,
  pinned: true,
};
