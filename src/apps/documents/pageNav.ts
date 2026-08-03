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
  return `Page ${pageNumber} of ${numPages} · ${zoomPercent(scale)}%`;
}

/** The scale as a whole-number percentage, where `BASE_SCALE` is 100%. */
export function zoomPercent(scale: number): number {
  return Math.round((scale / BASE_SCALE) * 100);
}

/**
 * The one `appCommand` in this app that carries an argument: the toolbar's
 * page field needs "go to page N", where everything else is relative.
 *
 * `appCommand` is an opaque per-app string vocabulary (`system/appCommands.ts`
 * routes whatever the app defines), so encoding the argument in it needs no
 * protocol change — but it does need exactly one encoder and one decoder, or
 * the two ends drift. Both live here, next to the rest of the pure page math.
 */
export const GO_TO_PAGE_COMMAND = "documents.goToPage";

export function goToPageCommand(pageNumber: number): string {
  return `${GO_TO_PAGE_COMMAND}:${pageNumber}`;
}

/** The page number in a `documents.goToPage:<n>` command, or `null` for anything else. */
export function parseGoToPageCommand(command: string): number | null {
  const prefix = `${GO_TO_PAGE_COMMAND}:`;
  if (!command.startsWith(prefix))
    return null;
  const pageNumber = Number(command.slice(prefix.length));
  return Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null;
}
