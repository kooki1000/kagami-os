import type { AppManifest } from "@/system/apps/types";
import { Image } from "lucide-react";
import { lazy } from "react";
import { restoreFilePayload, serializeFilePayload } from "@/system/apps/filePayload";

export const viewerApp: AppManifest = {
  id: "viewer",
  name: "Viewer",
  icon: Image,
  tileGradient: ["#b06fe0", "#8a4fd0"],
  defaultSize: { width: 640, height: 480 },
  minSize: { width: 380, height: 300 },
  component: lazy(() => import("./ViewerApp")),
  pinned: true,
  serializePayload: serializeFilePayload,
  restorePayload: restoreFilePayload,
  menus: [
    {
      title: "File",
      items: [
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
    {
      title: "View",
      items: [
        { label: "Zoom In", appCommand: "viewer.zoomIn", shortcut: "⌘+" },
        { label: "Zoom Out", appCommand: "viewer.zoomOut", shortcut: "⌘−" },
        { label: "Zoom to Fit", appCommand: "viewer.fit", shortcut: "⌘0", dividerAfter: true },
        { label: "Rotate Left", appCommand: "viewer.rotateLeft", shortcut: "⌘L" },
        { label: "Rotate Right", appCommand: "viewer.rotateRight", shortcut: "⌘R", dividerAfter: true },
        { label: "Previous Image", appCommand: "viewer.previous", shortcut: "⌘[" },
        { label: "Next Image", appCommand: "viewer.next", shortcut: "⌘]" },
      ],
    },
  ],
};
