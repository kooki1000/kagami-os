import type { AppManifest } from "@/system/apps/types";
import { PlayCircle } from "lucide-react";
import { lazy } from "react";

export const playerApp: AppManifest = {
  id: "player",
  name: "Player",
  icon: PlayCircle,
  tileGradient: ["#4f92e0", "#3568b0"],
  defaultSize: { width: 560, height: 420 },
  minSize: { width: 380, height: 280 },
  component: lazy(() => import("./PlayerApp")),
  pinned: true,
  menus: [
    {
      title: "File",
      items: [
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
    {
      title: "Playback",
      items: [
        { label: "Previous Track", appCommand: "player.previous", shortcut: "⌘[" },
        { label: "Next Track", appCommand: "player.next", shortcut: "⌘]" },
      ],
    },
  ],
};
