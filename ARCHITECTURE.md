# Kagami OS — Architecture

A browser-based desktop environment: windowing shell + virtual file system +
a suite of built-in apps, all client-side. This document tracks the two seams
future features hook into (the **app manifest pattern** and the **storage
adapter interface**) plus the shell's moving parts.

## Design tokens

Source of truth is the Claude Design prototype `KagamiOS.html` ("Lagoon"
direction). Its values live in two places, deliberately kept in sync:

- `src/styles/global.css` — CSS custom properties, using the prototype's
  variable names (`--accent`, `--accent-2`, `--ctl1/2/3`, `--wall`,
  `--wsh1/--wsh2`, `--surface`, `--chrome`, …), themed via
  `:root[data-theme='dark']`. A Tailwind v4 `@theme inline` block maps them
  to utility classes (`bg-surface`, `text-ink-2`, `bg-accent`, …).
- `src/design/tokens.ts` — the same values as data, for code that needs
  tokens programmatically (dock tile gradients, tests).

The static defaults in `global.css` are the "Lagoon" direction. At runtime
the Settings app can override the accent + wallpaper vars live: `App` writes
the selected preset's `--accent/--accent-2/--ctl1-3/--wall/--wsh1/--wsh2`
inline on `<html>` (inline vars beat the stylesheet defaults), recomputed
whenever theme, accent, or wallpaper changes. Presets live in
`system/settings/palettes.ts` (see Settings section below).

Binding design decisions from the prototype (do not drift toward
macOS-typical treatments):

- Window controls are **monochrome at rest**; focused windows tint them with
  a coral + teal duotone (`--ctl1/2/3`), and hovering the control cluster
  reveals the glyphs. Never a red/yellow/green triad, never system blue.
- Dock tiles are **rounded squares** (13px) with a hover lift — no
  magnification curve, no squircles.
- Type is Inter (via Fontsource); mono is JetBrains Mono.
- Generic app naming ("Files", "Settings") — no Apple/Puter naming anywhere.
- Radius pairing: window 14 / dock tile 13 / button 7. Menu bar 30px, title
  bar 40px, dock icon 46px.

## State: two decoupled Zustand stores (+ small satellites)

### `system/windows/windowStore.ts` — window manager

Pure state + actions, no React imports, so it is unit-testable headlessly
(and drivable from the browser console via
`import('/src/system/windows/windowStore.ts')`).

- `OsWindow`: id, appId, title, `rect`, `restoreRect`, `mode`
  (`normal | maximized | snapped-left | snapped-right`), `minimized`,
  `zIndex`, `minSize`, `screenId` (always `'main'` for now — the seam for
  multi-monitor later).
- Focus uses a **monotonic `nextZ` counter**; focusing a window just bumps
  its zIndex, nothing is re-sorted.
- `restoreRect` is captured when entering maximized/snapped mode and
  consumed on restore. Dragging a non-normal window "peels" it back to its
  restore size under the cursor (`restoreToRect`).
- The store owns a `viewport` (updated by `App` on resize) so geometry math
  (cascade placement, maximize bounds, 50% snap, clamping) stays pure. A
  single `rectForMode` helper derives the rect for each mode, and
  `setViewport` replays it across every window — maximized/snapped windows
  re-fill the new viewport, normal ones are re-clamped so a shrinking
  viewport can't strand a title bar out of reach. Windows whose geometry
  doesn't change keep their object identity, so `Window`'s memo holds.
- `snapPreview` is transient UI state for the drag-to-edge highlight.
- `hydrateSession` (C1) replaces the whole `windows` array from a restored
  session snapshot, assigning fresh ids/z-index from array order — see
  Session restore below. `setWindowPayload` updates a window's payload in
  place (Notes uses it to keep "which note is showing" in sync; see below).

### `system/theme/themeStore.ts`

`light | dark | auto` preference (persisted); `auto` tracks
`prefers-color-scheme`. `App` reflects the resolved theme onto
`<html data-theme>` alongside the accent/wallpaper vars.

### `system/dock/dockStore.ts`

Pinned app ids (seeded from manifests' `pinned` flag) plus dock size and
position — persisted to localStorage.

## App manifest pattern

Every app is described by an `AppManifest`
(`src/system/apps/types.ts`) and registered in
`src/system/apps/registry.ts`. The shell renders everything generically from
manifests, so adding an app never touches the window manager, dock, or menu
bar:

- `component` is a `React.lazy` import — each app code-splits and mounts
  inside the window's `<Suspense>`.
- `menus` is data; the menu bar renders whichever sections the focused
  app's manifest declares (system menu only when nothing is focused).
  Menu items carry either a shell `CommandId` executed by
  `system/commands.ts` (close/minimize/zoom/new-window/quit/about) or an
  app-defined `appCommand` string delivered to the focused window through
  the app-command bus (`system/appCommands.ts`, consumed with
  `useAppCommand(windowId, handler)`) — e.g. Files' "Go → Trash".
- `singleInstance` (e.g. Settings) makes `openWindow` focus the existing
  window instead of opening another.
- `tileGradient` + `icon` (Lucide) define the dock tile; `dockZone:
'system'` places an app after the dock separator.
- `launchApp(appId)` (`system/apps/launch.ts`) is the only bridge from
  manifest to window store.
- `serializePayload`/`restorePayload` (C1, optional): an app whose windows
  carry launch data worth reopening implements both, turning its `payload`
  into JSON-safe data at save time and back at boot. Notes/Viewer/Player all
  use the same `{ fileId }` shape (`system/apps/filePayload.ts`'s
  `serializeFilePayload`/`restoreFilePayload` — `restoreFilePayload` drops
  the restore if the file no longer exists). An app with neither hook still
  gets its window position/mode restored; it just reopens bare.

Apps live in `src/apps/<app-id>/` with an `index.ts` exporting the manifest.
Files, Notes, Viewer, Terminal, and Settings are all real; Welcome is the
onboarding window. (`ComingSoon` remains as a scaffold for future apps.)

## Session restore (`system/windows/sessionStore.ts`)

Window layout (app, rect, mode, minimized, z-order, focus) survives a
reload, localStorage-backed:

- `buildSessionSnapshot`/`resolveSessionSnapshot` are pure functions (unit
  tested) — save direction walks `windows` back-to-front, drops any window
  whose `appId` is no longer registered, and calls the app's
  `serializePayload` hook if it has one; restore direction is the inverse,
  resolving `title`/`minSize` from the _current_ registry (not what was
  saved) and calling `restorePayload`.
- `watchSessionForSave()` subscribes to `useWindowStore` and debounces
  (400ms) writes to `localStorage["kagami:session"]`; `restoreSession()`
  reads it once at boot and calls `windowStore.hydrateSession`.
- `App.tsx` wires it in after `fsStore.init()` resolves (payload restoration
  needs the fs tree up first): a `?fresh` query param bypasses restore as a
  recovery hatch, self-clearing via `history.replaceState` after one use so
  it doesn't also swallow every later plain reload. A session that restores
  to zero windows (the user closed everything on purpose) is distinguished
  from a genuine first-ever boot (no session key at all) — only the latter
  still launches Welcome.
- Notes syncs its window's `payload` on every selection change (an effect
  calling `setWindowPayload`), not just at launch — otherwise picking a note
  from its own sidebar (as opposed to opening one from Files) would never
  update what gets restored. Viewer has no in-app "switch file" action, so
  it doesn't need the same treatment. Player's Next/Previous also changes
  its current file without updating `payload` — a known, pre-existing gap
  independent of this feature — so a restored Player window can reopen
  whichever track it was last launched or explicitly reopened with, not
  necessarily whatever was mid-playback.
- Restored windows get fresh ids — nothing across a reload depends on id
  stability.

## Shell components (`src/components/shell/`)

- `Desktop` — wallpaper layer (pure CSS artwork from tokens); clicking it
  blurs all windows. Also renders the Desktop folder's children as icons
  (B7): single selection, freeform pointer-drag repositioning (persisted in
  `system/desktop/desktopLayoutStore.ts`, localStorage — an icon with no
  stored position falls back to a deterministic grid slot computed by
  `system/desktop/desktopLayout.ts`'s `autoPosition` from its rank among
  the folder's children; `clampIconPosition` keeps a cell fully on screen
  both while dragging and when reading a stored position back, so a
  persisted corner position can't strand an icon out of reach on a smaller
  viewport), double-click to open (a file goes through
  `openFile.ts`; a folder launches a new Files window scoped to it via
  `{ payload: { folderId } }`), and a context menu mirroring Files' (Open
  With, Copy/Cut/Paste via the same `clipboardStore`, Download, Get Info,
  Rename, Move to Trash). Deliberately a lighter sibling of Files rather
  than a `FilesView` reuse — no marquee/multi-select, and dragging one icon
  onto another doesn't move it _into_ that folder, unlike Files' HTML5 DnD.
- `WindowLayer` — isolated stacking context; renders non-minimized windows
  and the snap-preview overlay. `pointer-events: none` on the layer so the
  desktop stays clickable.
- `Window` — title bar drag / 8-way resize via pointer events + pointer
  capture (hand-rolled instead of react-rnd; gives us the restore-on-drag
  and snap behavior with no dependency). Only `transform`/`opacity` are ever
  transitioned so drag/resize never lag. Minimize animates toward the app's
  dock tile (`data-dock-app` lookup), then commits to the store.
- `MenuBar` — brand/system menu + focused app's manifest menus + clock +
  light/dark toggle. Dropdowns are plain data (`BarMenu`) built from
  manifest sections.
- `Dock` — pinned + running apps, running dot, hover lift + tooltip,
  right-click context menu (New Window / Pin / Quit).
- `ToastStack` / `NotificationCenter` — transient corner toasts and the
  persistent history flyout (see Notifications below).
- `SearchOverlay` — `⌘K` global name search over the whole VFS (B9); a
  centered command-palette-style flyout (unlike the corner-anchored toast/
  notification flyouts). Matches by case-insensitive substring over
  `fsStore.nodes` (`system/search/searchNodes.ts`), excluding Trash.
  Selecting a folder launches a new Files window scoped to it (the same
  `{ payload: { folderId } }` pattern Desktop icons use); a file goes
  through `openFile.ts`.

## Virtual file system (`src/system/fs/`)

A tree of `FsNode`s (`{ id, parentId, name, type, mimeType?, content?,
createdAt, modifiedAt, trashedFrom? }`) held in `useFsStore` (Zustand),
with two seams around it:

- **`StorageAdapter`** (persistence seam): `loadAll` / `putMany` /
  `removeMany`. The MVP implementation is raw IndexedDB
  (`idbAdapter.ts`) — the `idb` convenience library is currently blocked
  by the workspace's `minimumReleaseAge` pnpm policy; swapping it (or a
  real server backend) in touches only this file. Every store mutation
  persists write-through, fire-and-forget.
- **`FileSystemProvider`** (`provider.ts`, app-facing seam): async
  `readDir/readFile/writeFile/mkdir/move/rename/delete/stat` for external
  consumers that don't need reactivity. UI like Files subscribes to the
  store directly (`childrenOf`, `pathOf` selectors) for live updates — both
  views share the same state.

Semantics worth knowing: well-known folder ids (`home`, `documents`,
`trash`, …) are seeded on first run and protected from rename/move/trash
(`SYSTEM_IDS`); `delete` means "move to Trash" (recording `trashedFrom` for
Restore) and only trashed items can be deleted permanently; sibling name
collisions auto-suffix (`name 2`); moves into a node's own descendants are
rejected. First run seeds Home/Desktop/Documents/Downloads/Pictures plus
sample markdown, text, and original SVG artwork.

The Files app (`src/apps/files/`) is the reference consumer: grid/list
views, breadcrumbs + back/forward history, name filtering, inline rename,
HTML5 drag-and-drop moves (items → folders, sidebar places, Trash), context
menus (shared `components/ui/ContextMenu`), and a two-step Empty Trash.

## "Open with" plumbing

Windows carry an optional `payload` (window store) delivered to the app
component as `AppWindowProps.payload`. `system/apps/openFile.ts` owns the
built-in mime-family → app table (`text/*` → Notes, `image/*` → Viewer,
`audio|video/*` → Player) and opens a file by launching its app with a
`{ fileId }` payload — reusing an existing window when one already shows
that file. Single-instance apps (Notes) adopt a fresh payload into their
selection via a render-time state adjustment; multi-instance apps (Viewer,
Player) get one window per file.

Files' "Open With ▸" context-menu submenu (B11) generalizes that table: a
user's choice persists as a per-exact-mime-type override in
`settingsStore.fileAssociations` (localStorage), which `appIdForFile` checks
before falling back to the built-in family default. `candidateAppsForFile`
lists the app(s) capable of opening a given file — today every family still
has exactly one candidate, but the list shape is what lets a future second
app for the same type show up as a real choice instead of a no-op menu.
`ContextMenu` grew nested-submenu support (`ContextMenuEntry.children`) for
this; the flyout renders through a `createPortal` to `<body>` rather than
inline, because the top-level menu's `translateY(-100%)` (used when it opens
upward) makes it a `position: fixed` containing block for anything nested
inside it, which would otherwise push the submenu off-screen.

App-defined menu items use `appCommand` (vs the shell's `command`): the menu
bar routes them through `system/appCommands.ts`, a tiny per-window pub/sub
the focused app subscribes to with `useAppCommand`. This is how Files'
View/Go menus, Notes' New Note, and the Viewer's zoom/rotate reach the
focused instance without the shell knowing app internals.

- **Notes** (`src/apps/notes/`) — single-instance; sidebar lists every
  `text/*` document on the drive, debounced autosave (flushed on
  note-switch and unmount), inline rename, move-to-trash.
- **Viewer** (`src/apps/viewer/`) — multi-instance image viewer with
  zoom/fit/rotate; fit recomputes via a `ResizeObserver` on the window.

## Terminal (`src/apps/terminal/`)

A sandboxed fake shell — **no code execution**. `shell.ts` is a pure,
framework-agnostic engine (`runCommand(input, ctx) → ShellResult`) that
interprets a fixed command set (`ls cd pwd cat mkdir touch echo rm tree
whoami date clear help`, with `>` redirect, quoting, and `~`/`.`/`..` path
resolution) against a `ShellContext` — a thin capability bag over the fs
store, so writes land in the same VFS the Files app shows. `TerminalApp.tsx`
is the REPL shell: scrollback, command history (↑/↓), and prompt path. The
engine's purity makes it unit-testable without React (phase 8).

## Settings (`src/apps/settings/` + `src/system/settings/`)

Three sections wired to live state:

- **Appearance** — theme preference (`themeStore`, light/dark/auto) + accent
  - wallpaper. Accents and wallpapers are the prototype's three complete
    "directions" (Lagoon/Iris/Meadow) in `palettes.ts`; each carries full
    light/dark tones + the window-control triad (accent) or shape colors
    (wallpaper). We expose these documented presets rather than inventing
    partial ones, per the brief's "do not invent your own palette" rule.
    Accent and wallpaper are chosen independently (`settingsStore`).
- **Dock** — size (`DockSize` → tile px) and position (bottom/left/right);
  the `Dock` component reads both and relayouts (column vs row, hover-lift
  direction, tooltip/dot placement) from a per-position table.
- **About** — version/build/engine panel; original-work + attribution note.

Persistence: `settingsStore`, `themeStore` (preference only, `resolved`
recomputed on rehydrate), and `dockStore` (pins + size + position) each use
zustand's `persist` middleware against localStorage — independent of the
IndexedDB fs adapter, since these are small UI prefs, not documents.

## Notifications + keyboard shortcuts

- **Notifications** (`system/notifications/notificationStore.ts`) — a
  session store of `items` (history, newest-first, capped) plus `toastIds`
  (the subset currently shown as toasts). `notify(input)` is callable from
  anywhere (components, plain functions like `openFile`, stores); optional
  `action: { label, run }` renders an inline button (e.g. Files' "Moved to
  Trash → Undo"). `ToastStack` shows up to 4 corner toasts that auto-dismiss
  after 5s (paused on hover); `NotificationCenter` is the bell-triggered
  history flyout (opening marks all read, clearing the menu-bar unread
  badge). Not persisted — notifications are session-scoped.
- **Keyboard shortcuts** (`system/shortcuts.ts`, `useGlobalShortcuts` in
  `App`) — instead of a separate keymap, a global keydown builds the same
  chord string apps already display on menu items ("⌘W", "⇧⌘N") and runs the
  matching item on the focused app (command or appCommand). Shell fallbacks
  (⌘W/⌘M/⌘Q) apply when a window is focused; symbol chords stay menu-only.
  `⌘K` (global search, B9) is the one chord that isn't gated on a focused
  window — it opens `SearchOverlay` from anywhere, including an empty
  desktop. Menu-item shortcut labels render through `formatShortcut`
  (`lib/format.ts`), showing `Ctrl+…` off Mac.

## Testing + persistence hardening

`pnpm test` (Vitest, `node` environment — no jsdom/RTL needed since the
high-risk logic is framework-agnostic). Suites live next to their code:

- `system/windows/windowStore.test.ts` — open/focus/z-order, close &
  refocus, minimize/restore, maximize + restore-bounds, 50% snap, move
  clamping, min-size enforcement, single-instance + payload delivery.
- `system/fs/fsStore.test.ts` — tree helpers (sort, path, descendant,
  unique-name), create/rename dedupe, move validity (descendant/system/
  non-folder guards, Trash routing), the full trash lifecycle
  (trash → restore → fallback → empty → delete-forever), and subtree
  collection at depth (`collectSubtrees` indexes children once and walks
  iteratively, so deleting a deep subtree stays linear and a corrupt parent
  cycle terminates instead of overflowing the stack).
- `apps/terminal/shell.test.ts` — `resolvePath` (relative/`..`/`~`/absolute)
  and every command, driven against a seeded fs store.
- `system/fs/blobIntegrity.test.ts` — the `content` xor `contentRef`
  invariant: editing a blob-backed file inline releases its ref (and its
  bytes), `touchFile` bumps the timestamp without disturbing them, and the
  GC never collects a blob whose node commit is still in flight.

Stores expose small test seams: `__resetFsStoreForTest` / `indexNodes`, and
both stores accept `setState` seeding. **Persistence hardening**: the
IndexedDB adapter degrades to an in-memory no-op when `indexedDB` is
unavailable (private mode, SSR, tests), and `fsStore.init` falls back to the
in-memory seed on any load error — so the OS always boots instead of hanging
on the spinner.

**E2E (`pnpm test:e2e`, Playwright)**: specs in `e2e/`, run against a
production preview build across Chromium, Firefox, and WebKit. Shared
helpers (`boot`, `openApp`, `createFolder`, …) live in `e2e/helpers.ts`;
fixtures (kept tiny) in `e2e/fixtures/`. Conventions the suite relies on to
stay lean and stable:

- One user-visible seam per spec file, named `<area>.spec.ts`; each test
  gets its own browser context so IndexedDB/localStorage start clean —
  never rely on order between tests.
- Assert on behavior (item presence/counts, values, download events), not
  Tailwind classes — class assertions are the flakiest and least meaningful.
- Target roles/labels/text, never CSS class chains; where a stable hook is
  genuinely absent, add a `data-*` attribute (`data-dock-app`,
  `data-window-control`, `data-node-id`, …) rather than reaching through
  the DOM.
- Cross-platform chords via the `ControlOrMeta` modifier —
  `shortcuts.ts` resolves both ⌘ and Ctrl to the same menu chord string.
- Tag genuinely flaky interactions (native HTML5 drag-and-drop) to run
  Chromium-only rather than dropping the scenario or letting CI's
  `retries: 2` paper over a real race.
- New shell/app interaction seams land with an E2E scenario in the same PR,
  mirroring the unit-test rule below.

## Phase status

1. ✅ Shell skeleton (tokens, wallpaper, menu bar, dock, light/dark)
2. ✅ Window manager (open/close/focus/drag/resize/min/max/snap)
3. ✅ Virtual file system (IndexedDB) + Files app + Trash
4. ✅ Notes + Image Viewer + file→app "open with" plumbing
5. ✅ Terminal (pure engine over the shared VFS)
6. ✅ Settings — live accent/wallpaper/theme + dock size/position
7. ✅ Notifications + keyboard shortcuts + polish (toast/undo, ⌘-shortcuts)
8. ✅ Persistence hardening + Vitest suites (56 tests, both stores + engine)
9. ✅ Foundations & guardrails — CI (lint/typecheck/unit/e2e per PR, Chromium
   + Firefox + WebKit), error boundaries, feature flags, CSP
10. ✅ File system maturity — content-addressed blob store, upload/download,
    multi-select, clipboard, keyboard nav, Get Info, open-with, Media Player
11. ✅ Desktop experience — desktop icons, session restore, app/window
    switchers, quarter snap + keyboard window ops, ⌘K search, dock
    focus-follows-app, Viewer pan/zoom/next-prev/slideshow, Terminal engine
    v2, accessibility pass (ARIA menu roles + arrow-key traversal, per-window
    Tab focus trap, visible focus rings, reduced-motion variants, axe-core
    audit)
