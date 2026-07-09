import type { AppManifest } from "@/system/apps/types";
import { NotebookPen } from "lucide-react";
import { lazy } from "react";

export const notesApp: AppManifest = {
  id: "notes",
  name: "Notes",
  icon: NotebookPen,
  tileGradient: ["#f2a24b", "#e8763b"],
  defaultSize: { width: 720, height: 480 },
  minSize: { width: 480, height: 320 },
  component: lazy(() => import("./NotesApp")),
  singleInstance: true,
  pinned: true,
  menus: [
    {
      title: "File",
      items: [
        { label: "New Note", appCommand: "notes.new", shortcut: "⌘N", dividerAfter: true },
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
  ],
};
