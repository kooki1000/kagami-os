/**
 * Replicates CSS Grid's `auto-fill` track-count algorithm — the number of
 * `minTilePx`-or-wider tracks (separated by `gapPx`) that fit in
 * `containerWidthPx`, minimum 1 — so virtualized rows (which can't measure a
 * rendered `<div>` up front) still line up with the grid's real column count.
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
