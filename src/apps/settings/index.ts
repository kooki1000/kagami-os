import type { AppManifest } from "@/system/apps/types";
import { Settings } from "lucide-react";
import { lazy } from "react";

export const settingsApp: AppManifest = {
  id: "settings",
  name: "Settings",
  icon: Settings,
  tileGradient: ["#8f8a80", "#6d685f"],
  defaultSize: { width: 600, height: 470 },
  minSize: { width: 520, height: 400 },
  component: lazy(() => import("./SettingsApp")),
  singleInstance: true,
  pinned: true,
  dockZone: "system",
  menus: [
    {
      title: "File",
      items: [{ label: "Close Window", command: "window.close", shortcut: "⌘W" }],
    },
  ],
};
