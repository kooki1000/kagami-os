/**
 * Pure page/zoom math for the Documents sandboxed frame
 * (`sandboxEntry.ts`). Split out from that file specifically so it's
 * unit-testable in Vitest's `node` environment — everything else in
 * `sandboxEntry.ts` is DOM/postMessage-bound and runs only inside the
 * sandboxed iframe, which isn't a reasonable thing to unit-test directly.
 */

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 4;
export const ZOOM_STEP = 1.2;
/** The scale `formatPageInfo` treats as "100%" — pdf.js's own default. */
export const BASE_SCALE = 1.5;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampPage(pageNumber: number, numPages: number): number {
  return clamp(pageNumber, 1, numPages);
}

export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

/** Scale that fits an unscaled page width into the available width. */
export function fitWidthScale(unscaledWidth: number, availableWidth: number): number {
  return clampScale(availableWidth / unscaledWidth);
}

export function formatPageInfo(pageNumber: number, numPages: number, scale: number): string {
  return `Page ${pageNumber} of ${numPages} · ${Math.round((scale / BASE_SCALE) * 100)}%`;
}
