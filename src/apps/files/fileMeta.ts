import type { LucideIcon } from "lucide-react";
import type { FsNode } from "@/system/fs/types";
import { Download, File, FileText, Film, Folder, House, Image, Monitor, Music, NotebookText, Trash2 } from "lucide-react";
import { effectiveMimeType } from "@/system/fs/mimeTypes";
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

/**
 * These read the *resolved* type, not the stored one, so a file Files shows
 * and a file "Open with" routes can never disagree — an `app.ts` uploaded as
 * `video/mp2t` otherwise drew a film icon and read "Video" while opening in
 * the code editor. See `system/fs/mimeTypes.ts`.
 */
export function isImageNode(node: FsNode): boolean {
  return node.type === "file" && effectiveMimeType(node).startsWith("image/");
}

export function isAudioNode(node: FsNode): boolean {
  return node.type === "file" && effectiveMimeType(node).startsWith("audio/");
}

export function isVideoNode(node: FsNode): boolean {
  return node.type === "file" && effectiveMimeType(node).startsWith("video/");
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
  if (effectiveMimeType(node).startsWith("text/"))
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
  const mime = effectiveMimeType(node);
  const labeled = KIND_LABELS[mime];
  if (labeled)
    return labeled;
  if (isVideoNode(node))
    return "Video";
  if (isAudioNode(node))
    return "Audio";
  return "Document";
}

// Node sizes moved to the fs store, where `childrenOf`'s "size" sort needs
// them; re-exported here so the app's existing call sites are unaffected and
// there is still exactly one implementation.
export { fileBytes, folderSizes, nodeSize } from "@/system/fs/fsStore";
