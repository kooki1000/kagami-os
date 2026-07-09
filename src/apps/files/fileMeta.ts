import type { LucideIcon } from "lucide-react";
import type { FsNode } from "@/system/fs/types";
import { File, FileText, Folder, Image } from "lucide-react";

export function isImageNode(node: FsNode): boolean {
  return node.type === "file" && (node.mimeType?.startsWith("image/") ?? false);
}

export function nodeIcon(node: FsNode): LucideIcon {
  if (node.type === "folder")
    return Folder;
  if (isImageNode(node))
    return Image;
  if (node.mimeType?.startsWith("text/"))
    return FileText;
  return File;
}

const KIND_LABELS: Record<string, string> = {
  "text/markdown": "Markdown",
  "text/plain": "Plain Text",
  "image/svg+xml": "SVG Image",
  "image/png": "PNG Image",
  "image/jpeg": "JPEG Image",
};

export function nodeKind(node: FsNode): string {
  if (node.type === "folder")
    return "Folder";
  return KIND_LABELS[node.mimeType ?? ""] ?? "Document";
}
