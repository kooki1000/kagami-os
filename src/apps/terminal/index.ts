import type { AppManifest } from "@/system/apps/types";
import { SquareTerminal } from "lucide-react";
import { lazy } from "react";

export const terminalApp: AppManifest = {
  id: "terminal",
  name: "Terminal",
  icon: SquareTerminal,
  tileGradient: ["#3b3931", "#201e1a"],
  defaultSize: { width: 620, height: 420 },
  minSize: { width: 380, height: 240 },
  component: lazy(() => import("./TerminalApp")),
  pinned: true,
  menus: [
    {
      title: "File",
      items: [
        { label: "New Window", command: "app.newWindow", shortcut: "⌘N" },
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
  ],
};
