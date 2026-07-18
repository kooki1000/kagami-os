import type { LucideIcon } from "lucide-react";
import type { NodeMap } from "@/system/fs/fsStore";
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

const byteLength = new TextEncoder();

/**
 * Size in bytes (B8), computed on demand rather than stored on the node —
 * cheaper than keeping every ancestor folder's size in sync on every write,
 * and `childrenOf`-style scans are already the store's baseline cost (T7).
 * Files: `contentRef.size` (already bytes, B1) or the inline string's UTF-8
 * byte length. Folders: the recursive sum of their children.
 */
export function nodeSize(nodes: NodeMap, node: FsNode): number {
  if (node.type === "folder") {
    return Object.values(nodes)
      .filter(n => n.parentId === node.id)
      .reduce((sum, child) => sum + nodeSize(nodes, child), 0);
  }
  if (node.contentRef)
    return node.contentRef.size;
  return node.content ? byteLength.encode(node.content).length : 0;
}
