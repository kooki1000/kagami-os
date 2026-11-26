# Performance baseline: fs store hot paths

A one-off measurement from Phase 9 (task P9.9) of the file-system store's
read helpers at 1k and 10k nodes, taken to size the indexing and
virtualization work in tech-debt item T7. **T7 is now closed**; this note
stays as the record of why the fixes were shaped the way they were.

Reproduce with `pnpm bench` (`src/system/fs/fsStore.bench.ts`). The
original run used Node 22.23.1 and Vitest 3.2 on Apple Silicon. Absolute
numbers are machine-specific; the ratios are what matter.

## Results before the fixes

One folder of N children (10% folders, mixed mime types) plus a depth-20
chain. Mean wall time per call.

| Operation                     |  Nodes |      mean | ops/sec |
| ----------------------------- | -----: | --------: | ------: |
| `childrenOf`, name sort       |  1,000 |  ~17.7 ms |      57 |
| `childrenOf`, name sort       | 10,000 |   ~147 ms |     6.8 |
| `childrenOf`, **date** sort   | 10,000 |   ~3.5 ms |     284 |
| `childrenOf`, kind sort       | 10,000 |   ~112 ms |     8.9 |
| `uniqueChildName` (collision) | 10,000 |   ~3.8 ms |     261 |
| `pathOf` (depth 20)           | 10,000 | ~0.001 ms | 938,000 |
| Files per-render prep¹        | 10,000 |   ~142 ms |     7.0 |

¹ `childrenOf` by name, plus the Trash-count scan and the name filter: what
one `FilesApp` render recomputed.

## What it showed

The collator was the bottleneck, not the scan. Date sort over the same 10k
nodes took ~3.5 ms against ~147 ms for name sort, and the only difference was
the comparator: `localeCompare(…, { numeric: true })` does a full Intl
collation per comparison. At 147 ms per render, a 10k-node folder blew the
16 ms frame budget about nine times over. `uniqueChildName` and `pathOf`
were never a problem.

## What was done

| Fix                                                     | Result                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| One shared `Intl.Collator` (`collator` in `fsStore.ts`) | Name sort ~147 ms → ~9 ms, kind sort ~112 ms → ~8 ms, ordering unchanged      |
| Sorted children cached per `(nodes, parentId, sort)`    | `childrenOfCache`, a `WeakMap` keyed on `nodes` identity                      |
| Children indexed by parent                              | `childIdsByParent`, same `WeakMap` idiom; the scan is O(folder), not O(total) |
| Files grid and list virtualized                         | `@tanstack/react-virtual` in `FilesView.tsx`                                  |

Still open (`ROADMAP.md` H3): the Notes and Code sidebars render every row.
At 600 rows the date formatting alone cost ~15 ms per render until
`lib/format.ts` started reusing its formatters (~0.4 ms now), which shows
where the next limit is.
