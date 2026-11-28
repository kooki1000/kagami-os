import type { MenuSection } from "@/system/apps/types";

/**
 * Step 17 (D8.12) — validates the menus a sandboxed frame asks the shell to
 * show for its window. Same stance as `manifestSchema.ts`: untrusted input in,
 * `null` out on anything malformed, and what comes back is rebuilt field by
 * field so nothing the schema didn't name survives.
 *
 * Items carry an `appCommand` string and nothing else that runs: a `command`
 * (a shell `CommandId`) is refused, so a frame can only ever send a string
 * back to itself.
 */

const MAX_SECTIONS = 8;
const MAX_ITEMS_PER_SECTION = 24;
const MAX_TITLE_LENGTH = 40;
const MAX_LABEL_LENGTH = 60;
const MAX_COMMAND_LENGTH = 64;
const MAX_BADGE_LENGTH = 4;

/** `⇧?⌘` plus one key, in the glyphs `system/shortcuts.ts` builds chords from. */
const CHORD_PATTERN = /^⇧?⌘[A-Z0-9[\]−+←→↑↓⏎⌫⌦]$/;

/**
 * Chords the shell keeps for itself. An app menu's shortcuts are matched
 * before the shell fallbacks, so without this a frame could bind ⌘W and make
 * its own window impossible to close from the keyboard.
 */
export const RESERVED_CHORDS: ReadonlySet<string> = new Set(["⌘W", "⌘M", "⌘Q", "⌘K"]);

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function parseItem(raw: unknown): MenuSection["items"][number] | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const item = raw as Record<string, unknown>;
  if (!isBoundedString(item.label, MAX_LABEL_LENGTH) || !isBoundedString(item.appCommand, MAX_COMMAND_LENGTH))
    return null;
  if (item.command !== undefined)
    return null;
  if (item.shortcut !== undefined && (typeof item.shortcut !== "string" || !CHORD_PATTERN.test(item.shortcut) || RESERVED_CHORDS.has(item.shortcut)))
    return null;
  if (item.disabled !== undefined && typeof item.disabled !== "boolean")
    return null;
  if (item.dividerAfter !== undefined && typeof item.dividerAfter !== "boolean")
    return null;
  return {
    label: item.label,
    appCommand: item.appCommand,
    shortcut: item.shortcut,
    disabled: item.disabled,
    dividerAfter: item.dividerAfter,
  };
}

function parseSection(raw: unknown): MenuSection | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const section = raw as Record<string, unknown>;
  if (!isBoundedString(section.title, MAX_TITLE_LENGTH) || !Array.isArray(section.items) || section.items.length > MAX_ITEMS_PER_SECTION)
    return null;
  const items = section.items.map(parseItem);
  if (items.includes(null))
    return null;
  return { title: section.title, items: items as MenuSection["items"] };
}

/** Validates a frame's `menus.set` payload. An empty list is valid: it clears the app's menus. */
export function parseMenuSections(raw: unknown): MenuSection[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SECTIONS)
    return null;
  const sections = raw.map(parseSection);
  return sections.includes(null) ? null : sections as MenuSection[];
}

/**
 * A dock badge is a few characters, `null` or `""` to clear. Capped well
 * below a notification's worth of text: it is drawn on a tile the user
 * trusts, so it can't carry a message.
 */
export function parseBadge(raw: unknown): string | null | undefined {
  if (raw === null || raw === "")
    return null;
  if (typeof raw === "number")
    return Number.isInteger(raw) && raw > 0 ? (raw > 99 ? "99+" : String(raw)) : undefined;
  if (typeof raw === "string" && raw.length <= MAX_BADGE_LENGTH && raw.trim() === raw)
    return raw;
  return undefined;
}
