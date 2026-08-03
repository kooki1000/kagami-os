import type { LucideIcon } from "lucide-react";
import type { NodeMap } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import { Download, File, FileText, Film, Folder, House, Image, Monitor, Music, NotebookText, Trash2 } from "lucide-react";
import { childIdsByParent } from "@/system/fs/fsStore";
import { nodeIconById } from "@/system/fs/nodeIcons";
import { nodeLabelById } from "@/system/fs/nodeLabels";
import {
  DESKTOP_ID,
  DOCUMENTS_ID,
  DOWNLOADS_ID,
  HOME_ID,
  PICTURES_ID,
  TRASH_ID,
} from "@/system/fs/types";

export function isImageNode(node: FsNode): boolean {
  return node.type === "file" && (node.mimeType?.startsWith("image/") ?? false);
}

export function isAudioNode(node: FsNode): boolean {
  return node.type === "file" && (node.mimeType?.startsWith("audio/") ?? false);
}

export function isVideoNode(node: FsNode): boolean {
  return node.type === "file" && (node.mimeType?.startsWith("video/") ?? false);
}

/**
 * Default glyphs for the seeded system folders, so Home/Documents/Pictures &c.
 * are told apart in the content pane the way they always have been in the
 * sidebar — which drew its own bespoke icons while every folder here rendered
 * an identical `Folder`. A user-set `iconGlyph` still wins over these.
 */
const SYSTEM_FOLDER_ICONS: Record<string, LucideIcon> = {
  [HOME_ID]: House,
  [DESKTOP_ID]: Monitor,
  [DOCUMENTS_ID]: NotebookText,
  [DOWNLOADS_ID]: Download,
  [PICTURES_ID]: Image,
  [TRASH_ID]: Trash2,
};

/**
 * The glyph to draw for a node, most specific first: an explicit user choice,
 * then a system folder's own identity, then the mime-derived default.
 *
 * An `iconGlyph` naming a glyph this build no longer ships resolves to
 * `undefined` and falls through — a persisted node can never render nothing.
 */
export function nodeIcon(node: FsNode): LucideIcon {
  const chosen = nodeIconById(node.iconGlyph);
  if (chosen)
    return chosen;
  if (node.type === "folder")
    return SYSTEM_FOLDER_ICONS[node.id] ?? Folder;
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

/**
 * The CSS color for a node's glyph, or `undefined` to leave the caller's own
 * class (`text-accent` for folders, `text-ink-2` for files) in charge.
 */
export function nodeIconColor(node: FsNode): string | undefined {
  return nodeLabelById(node.iconTint)?.hex;
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
