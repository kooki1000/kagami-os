import type { AppManifest } from "@/system/apps/types";
import { Paintbrush } from "lucide-react";
import { lazy } from "react";

/**
 * D7 (step 16b) — a freehand scratch canvas. Each window is a fresh blank
 * drawing (no file payload, no opening existing images); Save exports the
 * canvas as a real PNG into the VFS's Pictures folder via `createBlobFile`.
 */
export const paintApp: AppManifest = {
  id: "paint",
  name: "Paint",
  icon: Paintbrush,
  tileGradient: ["#e0654b", "#c94a30"],
  defaultSize: { width: 640, height: 480 },
  minSize: { width: 420, height: 340 },
  component: lazy(() => import("./PaintApp")),
  pinned: true,
  menus: [
    {
      title: "File",
      items: [
        { label: "New", appCommand: "paint.new", shortcut: "⌘N", dividerAfter: true },
        { label: "Save to Pictures", appCommand: "paint.save", shortcut: "⌘S", dividerAfter: true },
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
  ],
};
