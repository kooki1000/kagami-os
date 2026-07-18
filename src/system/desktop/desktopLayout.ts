import { MENU_BAR_HEIGHT } from "@/system/windows/windowStore";

export const DESKTOP_CELL_W = 92;
export const DESKTOP_CELL_H = 96;
export const DESKTOP_MARGIN_X = 16;
export const DESKTOP_MARGIN_TOP = MENU_BAR_HEIGHT + 16;

/**
 * Deterministic default slot for a Desktop icon with no explicit stored
 * position (B7), based purely on its rank among the folder's children —
 * column-major, top-to-bottom then wrapping to the next column. Only a
 * user-dragged icon ever needs a stored position; this keeps every other
 * icon's layout stable and gap-free as siblings come and go.
 */
export function autoPosition(index: number, viewportHeight: number): { x: number; y: number } {
  const rows = Math.max(1, Math.floor((viewportHeight - DESKTOP_MARGIN_TOP - 24) / DESKTOP_CELL_H));
  const col = Math.floor(index / rows);
  const row = index % rows;
  return { x: DESKTOP_MARGIN_X + col * DESKTOP_CELL_W, y: DESKTOP_MARGIN_TOP + row * DESKTOP_CELL_H };
}
