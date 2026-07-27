import type { AppManifest } from "@/system/apps/types";
import { NotebookPen } from "lucide-react";
import { lazy } from "react";
import { restoreFilePayload, serializeFilePayload } from "@/system/apps/filePayload";

export const notesApp: AppManifest = {
  id: "notes",
  name: "Notes",
  icon: NotebookPen,
  tileGradient: ["#f2a24b", "#e8763b"],
  defaultSize: { width: 760, height: 480 },
  minSize: { width: 480, height: 320 },
  component: lazy(() => import("./NotesApp")),
  singleInstance: true,
  pinned: true,
  serializePayload: serializeFilePayload,
  restorePayload: restoreFilePayload,
  menus: [
    {
      title: "File",
      items: [
        { label: "New Note", appCommand: "notes.new", shortcut: "⌘N", dividerAfter: true },
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
    {
      title: "Edit",
      items: [
        { label: "Find…", appCommand: "notes.find", shortcut: "⌘F" },
        { label: "Find Next", appCommand: "notes.findNext", shortcut: "⌘G" },
        { label: "Find Previous", appCommand: "notes.findPrev", shortcut: "⇧⌘G", dividerAfter: true },
        { label: "Toggle Focus Mode", appCommand: "notes.focusMode", shortcut: "⇧⌘D" },
      ],
    },
    {
      title: "Format",
      items: [
        { label: "Bold", appCommand: "notes.bold", shortcut: "⌘B" },
        { label: "Italic", appCommand: "notes.italic", shortcut: "⌘I" },
        { label: "Underline", appCommand: "notes.underline", shortcut: "⌘U", dividerAfter: true },
        { label: "Heading", appCommand: "notes.heading", shortcut: "⇧⌘H" },
        { label: "Bulleted List", appCommand: "notes.bulletList", shortcut: "⇧⌘L" },
        { label: "Numbered List", appCommand: "notes.numberList", shortcut: "⇧⌘O", dividerAfter: true },
        { label: "Toggle Preview", appCommand: "notes.togglePreview", shortcut: "⇧⌘P" },
      ],
    },
  ],
};
