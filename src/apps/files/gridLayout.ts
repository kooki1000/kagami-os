/**
 * U14 grid virtualization: `FilesView`'s icon grid uses
 * `grid-cols-[repeat(auto-fill,minmax(minTilePx, 1fr))]`. Virtualizing rows
 * (via `@tanstack/react-virtual`) means the row-slicing code needs to know
 * the column *count* up front, rather than reading it back off a rendered
 * `<div>` the way the pre-virtualization `columnCount()` in `FilesApp.tsx`
 * did — under virtualization, most rows aren't rendered yet to measure.
 *
 * This replicates CSS Grid's `auto-fill` track-count algorithm directly:
 * the number of `minTilePx`-or-wider tracks (separated by `gapPx`) that fit
 * in `containerWidthPx`, minimum 1. Every virtual row shares the exact same
 * `grid-cols-[...]` class as the reference implementation, so as long as
 * this returns the same count CSS itself would compute, each row's tracks
 * line up with every other row's — the row above and below don't need to
 * agree on anything except how many items each holds.
 */
export function gridColumnCount(containerWidthPx: number, minTilePx = 120, gapPx = 12): number {
  if (containerWidthPx <= 0)
    return 1;
  const columns = Math.floor((containerWidthPx + gapPx) / (minTilePx + gapPx));
  return Math.max(1, columns);
}

/** Split a flat item list into fixed-size rows of `columns` items (last row may be shorter). */
export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  if (columns <= 1)
    return items.map(item => [item]);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns)
    rows.push(items.slice(i, i + columns));
  return rows;
}
