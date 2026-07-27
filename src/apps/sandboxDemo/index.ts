import type { AppManifest } from "@/system/apps/types";
import { ShieldCheck } from "lucide-react";
import { lazy } from "react";

/**
 * Dev-only (flag `app_sandbox`, see `system/flags.ts`): a hand-authored
 * demo app that runs inside the step-16a capability sandbox, proving the
 * bridge against a real consumer — an allowed fs.read, a denied fs.read,
 * an allowed notification, and direct storage/cookie/network escape
 * attempts that should all fail. Stands in for 16b's real PDF viewer.
 * Only registered when the flag is on; never shipped/pinned in a
 * production build.
 */
export const sandboxDemoApp: AppManifest = {
  id: "sandboxDemo",
  name: "Sandbox Demo",
  icon: ShieldCheck,
  tileGradient: ["#4fb3a9", "#2c7d74"],
  defaultSize: { width: 420, height: 480 },
  minSize: { width: 320, height: 360 },
  component: lazy(() => import("./SandboxDemoApp")),
  // Pinned for the same reason as devCrashApp: a dock tile to click
  // without first launching it some other way.
  pinned: true,
};
