import type { AppManifest } from "@/system/apps/types";
import { Sparkles } from "lucide-react";
import { lazy } from "react";

export const welcomeApp: AppManifest = {
  id: "welcome",
  name: "Welcome",
  icon: Sparkles,
  tileGradient: ["#f2765b", "#d8543a"],
  defaultSize: { width: 560, height: 460 },
  minSize: { width: 420, height: 320 },
  component: lazy(() => import("./WelcomeApp")),
  pinned: true,
  menus: [
    {
      title: "File",
      items: [
        { label: "New Window", command: "app.newWindow", shortcut: "⌘N" },
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
    {
      title: "Window",
      items: [
        { label: "Minimize", command: "window.minimize", shortcut: "⌘M" },
        { label: "Zoom", command: "window.zoom" },
      ],
    },
  ],
};
