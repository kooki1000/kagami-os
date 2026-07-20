# Global name search (B9) — design

**Status:** approved · 2026-07-20
**Roadmap item:** `B9` (Phase 11 — Desktop experience), `ROADMAP.md`

## Problem

The menu-bar magnifier (`MenuBar.tsx:202`) is decorative. Files has a
per-folder filter field (`FilesApp.tsx:329,780`) but nothing searches the
whole tree. There's no way to jump straight to a file or folder by name
without navigating to it.

## Scope

Search file/folder names across the whole VFS, from anywhere in the shell,
via a `⌘K` overlay. Explicitly **not** in scope: launching apps by name
(kept as a possible later extension of the same overlay, not built now),
fuzzy matching, content search (post-B1, per the roadmap), and per-folder
search (Files' existing filter already covers that).

As a byproduct of building `⌘K`'s hint label, this also adds
**platform-aware shortcut labels** app-wide (`⌘` → `Ctrl+…` off Mac),
applied at the one existing render site plus the new overlay.

## Architecture

### `src/system/search/searchStore.ts` (new)

Small Zustand store, session-only (no persistence), same shape as
`notificationStore`'s `centerOpen`:

```ts
interface SearchStore {
  open: boolean;
  query: string;
  openSearch: () => void;
  closeSearch: () => void; // also clears query
  setQuery: (q: string) => void;
}
```

### `src/system/search/searchNodes.ts` (new)

Pure function, unit-testable headlessly like `fsStore`'s `childrenOf`/`pathOf`:

```ts
export interface SearchResult {
  node: FsNode;
  /** Ancestor path label for disambiguation, e.g. "Documents/2026". */
  path: string;
}

export function searchNodes(nodes: NodeMap, query: string, limit = 20): SearchResult[]
```

- **Match:** `node.name.toLowerCase().includes(query.trim().toLowerCase())`.
  Empty/whitespace query → `[]`.
- **Exclude trashed:** skip any node where `node.parentId === TRASH_ID ||
isDescendantOf(nodes, node.id, TRASH_ID)` (reuses the existing
  `isDescendantOf` from `fsStore.ts`), so contents of a trashed folder are
  excluded too, not just direct Trash children.
- **Ranking:** name-prefix matches sort above interior substring matches;
  ties broken alphabetically.
- **Cap:** 20 results.
- **Path label:** built from the existing `pathOf(nodes, node.id)`
  ancestor-chain helper, joined by `/`, root excluded.

### `src/components/shell/SearchOverlay.tsx` (new)

Mounted in `App.tsx` alongside `NotificationCenter`/`ToastStack`. Same
`if (!open) return null` shape as `NotificationCenter`, but a centered
palette panel near the top of the viewport (not corner-anchored) — backdrop
`fixed inset-0 z-45` closing on `onPointerDown`, panel `z-50`,
`chrome hairline shadow-(--shadow-deep)` + `animate-flyout-in` to match the
rest of the shell's overlay chrome.

- Autofocused text input bound to `searchStore.query`. Dimmed `⌘K` hint
  (via `formatShortcut`) shown only while the query is empty.
- Results computed with `useMemo(() => searchNodes(nodes, query), [nodes,
query])`, `nodes` from `useFsStore`.
- Roving-highlight list: ↑/↓ moves the highlighted row, Enter opens it,
  mouse hover updates the highlight, click opens. Each row shows the node's
  name plus its dimmed path.
- Empty states: query empty → "Type to search files and folders."; query
  non-empty, no matches → "No results for "{query}"."
- **Escape closes the overlay**, handled explicitly in this component
  (backdrop-click already closes it too). Called out because
  `docs/review-backlog.md` item #9 already documents Escape not closing
  other shell overlays as a bug — this component must not repeat it.
- Query resets to `""` every time the overlay opens.

**Opening a result** reuses existing, already-shipped plumbing:

- Folder → `launchApp("files", { payload: { folderId: node.id } })` — the
  exact pattern B7 desktop icons already use.
- File → `openFile(node)` (`system/apps/openFile.ts`), which resolves the
  right app and reuses an existing window when possible.

Either path calls `closeSearch()` afterward.

### Trigger wiring

- Menu-bar `Search` icon (`MenuBar.tsx:202`) becomes a button calling
  `openSearch()`.
- `⌘K` global shortcut. `chordFromEvent` in `shortcuts.ts` already accepts
  either `metaKey` or `ctrlKey` as the modifier and always normalizes to a
  `"⌘"`-prefixed chord string, so `Ctrl+K` on non-Mac works for free — no
  change needed there. What _does_ need to change: today's `SHELL_CHORDS`
  only fire `if (shell && win)`, i.e. only with a window focused. `⌘K` must
  work from an empty desktop too, so it's wired as an always-available
  chord checked ahead of that focused-window fallback, not folded into
  `SHELL_CHORDS`.

### Platform-aware shortcut labels

`shortcut` fields on menu items are hardcoded `"⌘"`-prefixed literals
across every app manifest (~20+ items in 8 `index.ts` files). They serve
as both the match key compared against `chordFromEvent`'s output and the
display label — but there's exactly **one render site**:
`MenuBar.tsx:269` inside `DropMenu`. No matching logic changes; this is a
display-only transform layered on top.

`src/lib/format.ts` gains:

```ts
export function isMacPlatform(): boolean; // navigator sniff, defaults true if navigator is undefined
export function formatShortcut(shortcut: string, mac = isMacPlatform()): string;
```

`formatShortcut` passes through unchanged on Mac; off Mac, converts
`⌘`/`⇧`/`⌥`/`⌃` into `Ctrl+`/`Shift+`/`Alt+`/`Ctrl+` in standard
`Ctrl+Shift+…` order and appends the trailing key. The `mac` param
defaults from the real platform check but can be passed explicitly —
required because unit tests run in a plain Node environment with no
`navigator` (per `CLAUDE.md`).

Applied at `MenuBar.tsx:269` and the new `SearchOverlay`'s `⌘K` hint.

## Testing

- `src/system/search/searchNodes.test.ts` — substring match, trashed +
  trashed-descendant exclusion, prefix-ranking, limit, path labels, empty
  query.
- `src/system/search/searchStore.test.ts` — mirrors the existing
  `notificationStore.test.ts` pattern for `open`/`query` transitions.
- `src/lib/format.test.ts` (new file) — `formatShortcut`/`isMacPlatform`
  passthrough vs. conversion, multi-modifier chords.
- `e2e/search.spec.ts` — open via `⌘K`, type to filter, Enter opens a
  file; matches the one-spec-per-feature convention already in `e2e/`.

## Out of scope / explicitly deferred

- App-launching from the same overlay (unified command palette) — kept
  possible but not built.
- Fuzzy matching.
- Content search (post-B1 per the roadmap).
- Platform-aware label rendering elsewhere in the app beyond the one
  `MenuBar.tsx` render site + the new overlay (there is only one site
  today, so this is already complete, not actually deferred — noted for
  clarity if more render sites appear later).
