/**
 * A curated set of icon glyphs a user can assign to any file or folder,
 * overriding the mime-derived default in `fileMeta.ts`.
 *
 * Deliberately a *fixed vocabulary*, the same shape as `nodeLabels.ts`: a
 * closed list keeps every icon on the Lucide stroke weight and optical size
 * the rest of the shell already uses, so a customized folder still reads as
 * part of the same system. It also means a persisted node can only ever name
 * a glyph the app actually ships — an id that disappears in a later release
 * falls back to the mime default rather than rendering nothing.
 *
 * Tints are not defined here: they reuse `nodeLabels.ts`'s seven swatches, so
 * the label dot and a tinted icon can never drift onto different palettes.
 */

import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Banknote,
  Bookmark,
  Briefcase,
  Camera,
  Cloud,
  Code,
  Coffee,
  Compass,
  Download,
  Film,
  FlaskConical,
  Folder,
  FolderOpen,
  Gamepad2,
  GraduationCap,
  Heart,
  House,
  Image,
  Music,
  NotebookText,
  Package,
  Palette,
  Plane,
  Rocket,
  Star,
  Terminal,
  Wrench,
} from "lucide-react";

export interface NodeIcon {
  id: string;
  /** Accessible name, used for the picker's option label and its tooltip. */
  name: string;
  icon: LucideIcon;
}

/**
 * Ordered roughly by how likely they are to be reached for — generic
 * containers first, then work/'"place" metaphors, then media and hobbies.
 * The picker renders them in this order.
 */
export const NODE_ICONS: NodeIcon[] = [
  { id: "folder", name: "Folder", icon: Folder },
  { id: "folder-open", name: "Open Folder", icon: FolderOpen },
  { id: "package", name: "Package", icon: Package },
  { id: "archive", name: "Archive", icon: Archive },
  { id: "star", name: "Star", icon: Star },
  { id: "heart", name: "Heart", icon: Heart },
  { id: "bookmark", name: "Bookmark", icon: Bookmark },
  { id: "house", name: "Home", icon: House },
  { id: "briefcase", name: "Work", icon: Briefcase },
  { id: "notebook", name: "Notes", icon: NotebookText },
  { id: "graduation-cap", name: "School", icon: GraduationCap },
  { id: "flask", name: "Experiments", icon: FlaskConical },
  { id: "code", name: "Code", icon: Code },
  { id: "terminal", name: "Terminal", icon: Terminal },
  { id: "wrench", name: "Tools", icon: Wrench },
  { id: "cloud", name: "Cloud", icon: Cloud },
  { id: "download", name: "Downloads", icon: Download },
  { id: "image", name: "Pictures", icon: Image },
  { id: "camera", name: "Photos", icon: Camera },
  { id: "film", name: "Video", icon: Film },
  { id: "music", name: "Music", icon: Music },
  { id: "palette", name: "Design", icon: Palette },
  { id: "gamepad", name: "Games", icon: Gamepad2 },
  { id: "rocket", name: "Projects", icon: Rocket },
  { id: "compass", name: "Travel", icon: Compass },
  { id: "plane", name: "Trips", icon: Plane },
  { id: "banknote", name: "Finance", icon: Banknote },
  { id: "coffee", name: "Personal", icon: Coffee },
];

const ICON_BY_ID: ReadonlyMap<string, NodeIcon> = new Map(NODE_ICONS.map(i => [i.id, i]));

/** Is `id` one of the shipped glyph ids? Guards `fsStore.setIcon` against bad input reaching persisted nodes. */
export function isValidNodeIcon(id: string): boolean {
  return ICON_BY_ID.has(id);
}

/** The glyph for an id, or `undefined` for an unset or no-longer-shipped one. */
export function nodeIconById(id: string | undefined): LucideIcon | undefined {
  return id ? ICON_BY_ID.get(id)?.icon : undefined;
}
