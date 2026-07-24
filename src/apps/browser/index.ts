import type { AppManifest } from "@/system/apps/types";
import { Globe } from "lucide-react";
import { lazy } from "react";

export const browserApp: AppManifest = {
  id: "browser",
  name: "Browser",
  icon: Globe,
  tileGradient: ["#4bb8e0", "#2e8fb5"],
  defaultSize: { width: 900, height: 640 },
  minSize: { width: 480, height: 360 },
  component: lazy(() => import("./BrowserApp")),
  // Without this, the dock (which only lists pinned or currently-running
  // apps — see Dock.tsx) never shows an icon for Browser, and there is no
  // other launcher UI (⌘K only searches files/folders) — so it would be
  // unreachable from the desktop entirely, native-only or not.
  pinned: true,
  menus: [
    {
      title: "File",
      items: [
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
  ],
};
