# Performance baseline — fs store hot paths (P9.9)

**Goal:** measure the file-system store's read helpers at 1k and 10k nodes to
size Phase 10's indexing/virtualization work (tech-debt item **T7**). This is
a one-off measurement note; the benchmark is reproducible via `pnpm bench`
(`src/system/fs/fsStore.bench.ts`).

**Environment:** Node 22.23.1, Vitest 3.2.6 (tinybench), Apple Silicon macOS.
Absolute numbers are machine-specific — the _ratios_ are the takeaway.

## Results

Single-folder drive of N children (10% folders, mixed mime types) plus a
depth-20 chain. `mean` is per-call wall time; lower is better.

| Operation                     |  Nodes |      mean | ops/sec |
| ----------------------------- | -----: | --------: | ------: |
| `childrenOf` · name sort      |  1,000 |  ~17.7 ms |      57 |
| `childrenOf` · name sort      | 10,000 |   ~147 ms |     6.8 |
| `childrenOf` · **date** sort  | 10,000 |   ~3.5 ms |     284 |
| `childrenOf` · kind sort      | 10,000 |   ~112 ms |     8.9 |
| `uniqueChildName` (collision) | 10,000 |   ~3.8 ms |     261 |
| `pathOf` (depth 20)           | 10,000 | ~0.001 ms | 938,000 |
| Files per-render prep¹        | 10,000 |   ~142 ms |     7.0 |

¹ `childrenOf` (name) + Trash-count scan + name filter — what one `FilesApp`
render recomputes.

## Findings

1. **The bottleneck is the collator, not the scan.** Name and kind sort of
   10k nodes cost ~110–150 ms, but **date sort of the same 10k nodes is
   ~3.5 ms** — a ~40× gap. The only difference is the comparator: date does
   numeric subtraction; name/kind call
   `String.prototype.localeCompare(…, { numeric: true })`, which does a full
   Intl collation per comparison. The `Object.values(nodes).filter(…)` scan
   that T7 flags is cheap — it's included in that 3.5 ms date-sort number.

2. **147 ms per render blows the 16 ms frame budget by ~9×.** In a 10k-node
   folder, every `FilesApp` render (navigation, selection, filter keystroke)
   re-runs this. It's fine at today's hundreds of nodes but would make a
   large folder visibly janky.

3. **`uniqueChildName` (~3.8 ms) and `pathOf` (~0.001 ms) are non-issues** at
   this scale. `uniqueChildName` builds a 10k `Set` per call (create / rename
   / move only, not per render), and `pathOf` is O(depth).

## Recommendations for Phase 10 (in impact order)

1. **Reuse a single `Intl.Collator`.** Replace per-call `localeCompare` with a
   module-level `new Intl.Collator(undefined, { numeric: true }).compare`.
   This is a few lines and should reclaim most of the ~40× gap — the single
   biggest, cheapest win. Revisit T7's framing: the fix is the comparator,
   not (yet) the scan.
2. **Memoize sorted children per `(folderId, sort)`** so re-renders that don't
   change the folder or its contents don't re-sort at all.
3. **Virtualize the Files grid/list.** This benchmark is data-layer only
   (Node, no DOM); rendering 10k real DOM tiles is the _other_ half of the
   cost and the reason H3 lists virtualization. Measure again in-browser
   once binary uploads (B1/B2) make large folders realistic.
4. **Parent-id index** (children bucketed by `parentId`) turns the O(total)
   scan into O(folder). Lower priority than the collator — the scan isn't the
   current hotspot — but it compounds once a drive holds many folders.
