import { MENU_BAR_HEIGHT } from "@/system/windows/windowStore";

/** Desktop icon size (U8) — `DESKTOP_CELL_W/H` below are the "medium" (pre-U8 default) values; `cellSizeFor` scales them. */
export type DesktopIconSize = "small" | "medium" | "large";

export const DESKTOP_CELL_W = 92;
export const DESKTOP_CELL_H = 96;
export const DESKTOP_MARGIN_X = 16;
export const DESKTOP_MARGIN_TOP = MENU_BAR_HEIGHT + 16;

export interface CellSize {
  w: number;
  h: number;
}

const MEDIUM_CELL: CellSize = { w: DESKTOP_CELL_W, h: DESKTOP_CELL_H };

/**
 * Icon cell dimensions for a given size preference (U8). "medium" is exactly
 * the pre-U8 fixed `DESKTOP_CELL_W`/`DESKTOP_CELL_H`, so leaving the setting
 * untouched reproduces today's layout unchanged; small/large scale from it
 * by roughly the same ratio the glyph itself shrinks/grows by in Desktop.tsx
 * (size-12 → size-9/size-16).
 */
export function cellSizeFor(iconSize: DesktopIconSize): CellSize {
  switch (iconSize) {
    case "small":
      return { w: 72, h: 76 };
    case "large":
      return { w: 116, h: 122 };
    case "medium":
    default:
      return MEDIUM_CELL;
  }
}

/**
 * Deterministic default slot for a Desktop icon with no explicit stored
 * position (B7), based purely on its rank among the folder's children —
 * column-major, top-to-bottom then wrapping to the next column. Only a
 * user-dragged icon ever needs a stored position; this keeps every other
 * icon's layout stable and gap-free as siblings come and go. `cell`
 * defaults to the medium size so every pre-U8 call site (and its tests)
 * keeps behaving identically without passing one.
 */
export function autoPosition(index: number, viewportHeight: number, cell: CellSize = MEDIUM_CELL): { x: number; y: number } {
  const rows = Math.max(1, Math.floor((viewportHeight - DESKTOP_MARGIN_TOP - 24) / cell.h));
  const col = Math.floor(index / rows);
  const row = index % rows;
  return { x: DESKTOP_MARGIN_X + col * cell.w, y: DESKTOP_MARGIN_TOP + row * cell.h };
}

/**
 * Keep an icon's whole cell on screen, below the menu bar. Applied on drag and
 * on read-back: positions persist, so a corner drop on a large display would
 * otherwise be permanently off-screen on a smaller one. Lower bounds win on a
 * viewport too small for both, so the range never inverts. `cell` defaults to
 * the medium size, same reasoning as `autoPosition`.
 */
export function clampIconPosition(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  cell: CellSize = MEDIUM_CELL,
): { x: number; y: number } {
  const maxX = Math.max(DESKTOP_MARGIN_X, viewport.width - cell.w - DESKTOP_MARGIN_X);
  const maxY = Math.max(DESKTOP_MARGIN_TOP, viewport.height - cell.h);
  return {
    x: Math.min(Math.max(point.x, DESKTOP_MARGIN_X), maxX),
    y: Math.min(Math.max(point.y, DESKTOP_MARGIN_TOP), maxY),
  };
}

/**
 * Snaps a freely-dragged point to the nearest grid cell (U8's `gridSnap`) —
 * rounds to the nearest column/row from the same origin `autoPosition` uses,
 * so a snapped icon always lines up with the auto-arrange grid too.
 */
export function snapToGridPoint(point: { x: number; y: number }, cell: CellSize = MEDIUM_CELL): { x: number; y: number } {
  const col = Math.max(0, Math.round((point.x - DESKTOP_MARGIN_X) / cell.w));
  const row = Math.max(0, Math.round((point.y - DESKTOP_MARGIN_TOP) / cell.h));
  return { x: DESKTOP_MARGIN_X + col * cell.w, y: DESKTOP_MARGIN_TOP + row * cell.h };
}
