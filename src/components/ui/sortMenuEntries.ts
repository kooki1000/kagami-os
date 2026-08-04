import type { ContextMenuEntry } from "./ContextMenu";

/** The bit of sort state a "Sort By" menu needs to render its checkmarks. */
export interface SortMenuSpec<K extends string> {
  key: K;
  dir: "asc" | "desc";
}

/**
 * Build a "Sort By" context menu: one checkmarked entry per key in `labels`
 * (insertion order), plus a "Reverse order" toggle at the end — the exact
 * shape Files' and Notes' sort-by menus both need, so neither hand-rolls its
 * own checkmark prefix or entry list.
 */
export function buildSortMenuEntries<K extends string>(
  sort: SortMenuSpec<K>,
  labels: Record<K, string>,
  applySort: (key: K) => void,
  toggleSortDir: () => void,
): ContextMenuEntry[] {
  const check = (on: boolean) => (on ? "✓  " : "  ");
  const keys = Object.keys(labels) as K[];
  return [
    ...keys.map((key, i) => ({
      label: `${check(sort.key === key)}${labels[key]}`,
      run: () => applySort(key),
      dividerAfter: i === keys.length - 1,
    })),
    { label: `${check(sort.dir === "desc")}Reverse order`, run: toggleSortDir },
  ];
}
