import type { ContextMenuEntry } from "./ContextMenu";

/** The bit of sort state a "Sort By" menu needs to render its checkmarks. */
export interface SortMenuSpec<K extends string> {
  key: K;
  dir: "asc" | "desc";
}

/**
 * Picking a sort key: re-picking the active one flips direction, a new one
 * starts at `defaultDir`. Passing `sort.key` is therefore also how "Reverse
 * order" is expressed. Shared because all three sidebars need the same
 * behavior, and the one that hand-rolled it silently did nothing when the
 * active key was re-picked.
 */
export function nextSort<K extends string>(
  sort: SortMenuSpec<K>,
  key: K,
  defaultDir: "asc" | "desc" = "asc",
): SortMenuSpec<K> {
  return key === sort.key
    ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
    : { key, dir: defaultDir };
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
