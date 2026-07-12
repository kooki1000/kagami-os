import type { AppManifest } from "@/system/apps/types";
import { FolderClosed } from "lucide-react";
import { lazy } from "react";

export const filesApp: AppManifest = {
  id: "files",
  name: "Files",
  icon: FolderClosed,
  tileGradient: ["#17a89a", "#0c7f74"],
  defaultSize: { width: 760, height: 500 },
  minSize: { width: 520, height: 340 },
  component: lazy(() => import("./FilesApp")),
  pinned: true,
  menus: [
    {
      title: "File",
      items: [
        { label: "New Window", command: "app.newWindow", shortcut: "⌘N" },
        { label: "New Folder", appCommand: "files.newFolder", shortcut: "⇧⌘N", dividerAfter: true },
        { label: "Upload Files…", appCommand: "files.uploadFiles" },
        { label: "Upload Folder…", appCommand: "files.uploadFolder", dividerAfter: true },
        { label: "Close Window", command: "window.close", shortcut: "⌘W" },
      ],
    },
    {
      title: "Edit",
      items: [
        { label: "Cut", appCommand: "files.cut", shortcut: "⌘X" },
        { label: "Copy", appCommand: "files.copy", shortcut: "⌘C" },
        { label: "Paste", appCommand: "files.paste", shortcut: "⌘V", dividerAfter: true },
        { label: "Select All", appCommand: "files.selectAll", shortcut: "⌘A" },
      ],
    },
    {
      title: "View",
      items: [
        { label: "As Icons", appCommand: "files.viewGrid" },
        { label: "As List", appCommand: "files.viewList", dividerAfter: true },
        { label: "Sort by Name", appCommand: "files.sortName" },
        { label: "Sort by Date Added", appCommand: "files.sortDate" },
        { label: "Sort by Kind", appCommand: "files.sortKind" },
        { label: "Reverse Sort Order", appCommand: "files.sortReverse" },
      ],
    },
    {
      title: "Go",
      items: [
        { label: "Home", appCommand: "files.goHome" },
        { label: "Documents", appCommand: "files.goDocuments" },
        { label: "Pictures", appCommand: "files.goPictures", dividerAfter: true },
        { label: "Trash", appCommand: "files.goTrash" },
      ],
    },
  ],
};
