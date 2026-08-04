/**
 * Square icon-button class for a plain (non-toggling) app-toolbar action —
 * Paint's Undo/Clear/Save, Viewer's zoom/rotate/copy/wallpaper, Player's
 * transport controls. `rounded-[6px]`, not `rounded-btn` (7px), which the
 * design tokens reserve for bigger CTA-style buttons. `size` matches the
 * button to its toolbar's icon scale.
 *
 * Not for a pressed/selected toggle (Paint's brush-vs-eraser, Player's
 * shuffle/repeat) — those tint on an `active` flag and have their own,
 * slightly different hover rules, so they stay as separate local helpers.
 */
export function toolbarIconButtonClass(size: "size-6" | "size-7" = "size-6"): string {
  return `grid ${size} place-items-center rounded-[6px] text-ink-2 enabled:hover:bg-ph enabled:hover:text-ink disabled:opacity-35`;
}
