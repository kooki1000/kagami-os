/**
 * Page-zoom steps for the Browser (U17). Pure, so the stepping logic is
 * testable without a webview — the value it produces is handed straight to
 * `Webview::set_zoom` on the Rust side.
 */

/**
 * The ladder zoom moves along, rather than a fixed multiplier: repeatedly
 * multiplying by 1.1 lands on values like 133.1%, and the reset step then
 * can't tell "roughly 100%" from exactly it.
 */
export const ZOOM_LEVELS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5] as const;

export const DEFAULT_ZOOM = 1;

const MIN_ZOOM = ZOOM_LEVELS[0];
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

/**
 * Snaps an arbitrary level onto the ladder and steps `direction` rungs along
 * it. Off-ladder input (a persisted value from an older ladder) snaps to the
 * nearest rung first, so stepping from it still lands somewhere sensible.
 */
export function stepZoom(level: number, direction: 1 | -1): number {
  const nearest = ZOOM_LEVELS.reduce((best, candidate) =>
    Math.abs(candidate - level) < Math.abs(best - level) ? candidate : best);
  const index = ZOOM_LEVELS.indexOf(nearest);
  return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index + direction))];
}

export function canZoomIn(level: number): boolean {
  return level < MAX_ZOOM;
}

export function canZoomOut(level: number): boolean {
  return level > MIN_ZOOM;
}

/** Keeps a stored or hand-edited level inside the ladder's range. */
export function clampZoom(level: number): number {
  if (!Number.isFinite(level))
    return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
}

/** "125%" — the label on the zoom chip. */
export function formatZoom(level: number): string {
  return `${Math.round(level * 100)}%`;
}
