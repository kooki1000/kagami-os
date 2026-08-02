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
  // Deliberately unpinned, unlike every other app: Welcome is a first-run
  // greeting, not something to reach for again — a permanent dock tile for a
  // tour you've already taken is clutter. It stays reachable from Settings ›
  // About › Replay Tour and the "About Kagami OS" menu item (`system.about`).
  // Existing installs are cleaned up by dockStore's v2 migration, since
  // `reconcilePinned` never removes a pin on its own.
  pinned: false,
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
