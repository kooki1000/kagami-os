import type { LucideIcon } from "lucide-react";
import type { NodeMap } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import { File, FileText, Film, Folder, Image, Music } from "lucide-react";

export function isImageNode(node: FsNode): boolean {
  return node.type === "file" && (node.mimeType?.startsWith("image/") ?? false);
}

export function isAudioNode(node: FsNode): boolean {
  return node.type === "file" && (node.mimeType?.startsWith("audio/") ?? false);
}

export function isVideoNode(node: FsNode): boolean {
  return node.type === "file" && (node.mimeType?.startsWith("video/") ?? false);
}

export function nodeIcon(node: FsNode): LucideIcon {
  if (node.type === "folder")
    return Folder;
  if (isImageNode(node))
    return Image;
  if (isVideoNode(node))
    return Film;
  if (isAudioNode(node))
    return Music;
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
  "audio/mpeg": "MP3 Audio",
  "audio/wav": "WAV Audio",
  "audio/ogg": "OGG Audio",
  "video/mp4": "MP4 Video",
  "video/webm": "WebM Video",
  "video/ogg": "OGG Video",
};

export function nodeKind(node: FsNode): string {
  if (node.type === "folder")
    return "Folder";
  const labeled = KIND_LABELS[node.mimeType ?? ""];
  if (labeled)
    return labeled;
  if (isVideoNode(node))
    return "Video";
  if (isAudioNode(node))
    return "Audio";
  return "Document";
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
