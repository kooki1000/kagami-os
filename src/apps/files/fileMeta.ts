import type { LucideIcon } from "lucide-react";
import type { NodeMap } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import { File, FileText, Film, Folder, Image, Music } from "lucide-react";
import { childIdsByParent } from "@/system/fs/fsStore";

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

/** A file's size in bytes: `contentRef.size` (already bytes, B1) or the inline string's UTF-8 byte length. Folders have no bytes of their own — see {@link folderSizes}. */
export function fileBytes(node: FsNode): number {
  if (node.contentRef)
    return node.contentRef.size;
  return node.content ? byteLength.encode(node.content).length : 0;
}

/**
 * Every folder's size (B8) — the recursive byte sum of its children — in one
 * linear pass over the whole node map, instead of each folder re-scanning
 * `nodes` and recursing individually (the old `O(k · n)` `nodeSize` visibly
 * stuttered the marquee and filter input at a few thousand nodes). Same
 * traversal shape as `fsStore.ts`'s `collectSubtrees`: a shared
 * `globallySeen` set means every node is visited once in total, which also
 * makes a corrupt `parentId` cycle terminate instead of overflowing the
 * stack.
 */
export function folderSizes(nodes: NodeMap): Map<string, number> {
  const childIds = childIdsByParent(nodes);
  const sizes = new Map<string, number>();
  const globallySeen = new Set<string>();

  for (const node of Object.values(nodes)) {
    if (node.type !== "folder" || globallySeen.has(node.id))
      continue;

    // Iterative post-order: push each folder onto `toVisit`, record it into
    // `finished` on first pop, and push its unvisited folder children.
    // Reversing `finished` puts every child before its parent, so the
    // summing pass below can trust a child's size is already in `sizes`.
    const toVisit = [node.id];
    globallySeen.add(node.id);
    const finished: string[] = [];
    while (toVisit.length > 0) {
      const id = toVisit.pop()!;
      finished.push(id);
      for (const childId of childIds.get(id) ?? []) {
        if (globallySeen.has(childId))
          continue;
        const child = nodes[childId];
        if (child?.type === "folder") {
          globallySeen.add(childId);
          toVisit.push(childId);
        }
      }
    }
    finished.reverse();

    for (const id of finished) {
      let total = 0;
      for (const childId of childIds.get(id) ?? []) {
        const child = nodes[childId];
        if (!child)
          continue;
        total += child.type === "folder" ? (sizes.get(childId) ?? 0) : fileBytes(child);
      }
      sizes.set(id, total);
    }
  }

  return sizes;
}

/**
 * Size in bytes (B8) for one node — files are O(1); folders delegate to
 * {@link folderSizes}' single linear pass (still far cheaper than the old
 * per-call recursion even uncached, since it's one pass over `nodes`
 * regardless of which folder is asked for). Fine for a one-off lookup like
 * the Get Info panel; a view rendering many rows should compute
 * `folderSizes(nodes)` once (`useMemo`) and read the map directly instead of
 * calling this per row.
 */
export function nodeSize(nodes: NodeMap, node: FsNode): number {
  if (node.type === "folder")
    return folderSizes(nodes).get(node.id) ?? 0;
  return fileBytes(node);
}
