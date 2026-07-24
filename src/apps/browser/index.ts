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
  menus: [
    {
      title: "File",
      items: [
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
  ],
};
