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
  `--surface`, `--chrome`, …), themed via `:root[data-theme='dark']`. A
  Tailwind v4 `@theme inline` block maps them to utility classes
  (`bg-surface`, `text-ink-2`, `bg-accent`, …).
- `src/design/tokens.ts` — the same values as data, for code that needs
  tokens programmatically (dock tile gradients, tests).

The static defaults in `global.css` are the "Lagoon" direction, and only
cover the pre-hydration paint. At runtime `App` writes the whole appearance
inline on `<html>` (inline vars beat the stylesheet defaults), recomputed by
`themeVariables` (`system/settings/palettes.ts`) whenever the theme, look or
any override changes.

### One hue in, a whole environment out

A **look** (`LOOKS` in `palettes.ts`) is one considered decision: an accent
pair per theme, the window-control duotone that goes with it, and the
wallpaper design it was composed against. Accent and wallpaper used to be two
independently chosen preset lists, which meant most reachable combinations
were ones nobody had ever looked at.

Everything downstream of the accent pair is _derived_ in OKLCH
(`src/design/color.ts`), which is what keeps a user-picked color from
clashing with the desktop behind it:

- `deriveAccentTone(hex)` → `--accent-2` and the `--ctl1/2/3` triad.
- `deriveWallpaperTone(accent, accent2, theme)` → the five color roles
  (`base`/`mid`/`wash`/`warm`/`line`) every wallpaper style paints with.

Both sets of constants were solved against the hand-authored Lagoon values,
so feeding Lagoon's own accent pair back in reproduces its original gradient
and shape colors to within a unit or two per channel (asserted in
`color.test.ts` and `palettes.test.ts`).

### Wallpaper artwork is data

`system/settings/wallpaperStyles.ts` holds the procedural library. A style is
a pure function from a `WallpaperTone` to a list of CSS background layers;
`wallpaperStyleVars` flattens that into `--wall`, `--wall-size`,
`--wall-repeat` and `--wall-position` as four comma-separated lists of equal
length, which `@utility wallpaper` reads as separate `background-*`
longhands. Before this the artwork was fixed CSS (one gradient plus three
blurred pseudo-element shapes) and presets could only recolor it.

Three constraints on what a style may emit, all load-bearing and all
unit-tested:

- **Something in every composition resolves at pixel scale.** The first pass
  was built entirely from gradient ramps spanning 40–70% of the viewport, so
  the whole desktop read as out of focus. Every style now carries fine
  repeating detail — a hairline, a zero-width stop, or a grain. Soft passages
  are the ground beneath something sharp, never the entire surface.
- **No viewport units** — Settings renders the same vars into small preview
  cards, where `vmax` would size the artwork to the window instead of the card.
- **Tiled geometry goes through `calc(Npx * var(--wall-tile, 1))`** so a
  preview can scale ring/dot spacing down with the box, while stroke _widths_
  add a fixed px on top (`tilePlus`) — scaling a 1px hairline by the preview's
  0.34 would fade it out entirely.

The compositions themselves, and Ember's amber/indigo pair, come from the
"Kagami OS wallpaper design" Claude Design project.

### Overrides

Each layers onto the chosen look with the same "set wins, null inherits"
shape (`themeVariables`' `overrides` param):

- `customAccentHex` replaces the look's accent — and, because the wallpaper
  tone derives from it, retints the desktop with it.
- `wallpaperStyleId` picks a design other than the look's own.
- `wallpaperFileId` (separate per light/dark theme) replaces `--wall`
  entirely with `url(...)` plus `--wall-size/--wall-repeat/--wall-position`
  per the chosen fit mode (`wallpaperFit`). The image's blob URL lifetime is
  owned by `system/settings/wallpaperBlobUrl.ts`, not any component — vars
  are written on `<html>` outside any mounted subtree, so nothing "owns" an
  unmount to revoke on; the module tracks one URL per theme itself and only
  revokes when that slot's file changes or is cleared.
- `materialLevel` (clear/frosted/opaque) sets `--chrome`, `--chrome-2` and
  the `--chrome-filter`/`--chrome-filter-2` backdrop filters that
  `@utility chrome` reads. `frosted` is an exact no-op against the values
  global.css used to hardcode; `opaque` resolves the filter to `none`, which
  drops the backdrop compositing layer rather than blurring by zero.

Binding design decisions from the prototype (do not drift toward
macOS-typical treatments):

- Window controls are **monochrome at rest**; focused windows tint them with
  a **duotone** (`--ctl1/2/3`) — coral + teal under Lagoon, and each other
  look's own two hues — and hovering the control cluster reveals the glyphs.
  The triad always stays derived from one accent, never three independent
  colors. Never a red/yellow/green triad, never system blue.
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
  `removeMany`. The web implementation is raw IndexedDB (`idbAdapter.ts`)
  — the `idb` convenience library is currently blocked by the workspace's
  `minimumReleaseAge` pnpm policy. Every store mutation persists
  write-through, fire-and-forget. The native desktop track (`DIRECTION.md`,
  area N) plugs in here too: `tauriAdapter.ts` (and its `BlobStore` sibling
  `tauriBlobStore.ts`) write a JSON node file and one file per blob under
  the Tauri app's `$APPDATA/disk` folder — a real, isolated folder on the
  host machine — instead of IndexedDB. `fsStore.ts`/`blobStore.ts` each
  pick the adapter at construction with one `isTauri()` check
  (`system/platform.ts`). The seam was built for a remote/API adapter that
  is no longer coming (`ROADMAP.md` §3.X.1); if bring-your-own-storage sync
  is ever picked up (§3.X.2), it selects in here the same way.
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

- **Notes** (`src/apps/notes/`) — single-instance; sidebar scopes to a
  current folder (a "this folder" / "+ subfolders" toggle, `notesFilter.ts`'s
  pure `scopedDocs`/`filterDocs`/`sortDocs`/`splitPinned`), with a filter
  input, sort control, and pinning (`notesPrefsStore.ts`, a `Set<string>` of
  pinned ids persisted the same shape as `viewPrefsStore`). Editor: debounced
  autosave (flushed on note-switch and unmount) that migrates between
  `node.content` and the blob store as the byte size crosses
  `BLOB_INLINE_THRESHOLD` in either direction (`fsStore.setFileBlob`, the
  mirror of `updateFileContent`), find-and-replace (`findReplace.ts`,
  Cmd+F/Cmd+G), word/char count, a persisted font size, soft-wrap toggle, and
  a focus mode that hides the sidebar/chrome. Blob-backed text over 5 MB
  stays a read-only "too large" placeholder; at or under that it's read via
  `blobStore.get(...).then(b => b.text())` and edited normally. Inline
  rename, duplicate, reveal-in-Files, move-to-trash, and a couple of starter
  templates (`noteTemplates.ts`) round out the context menu. A formatting
  toolbar (`markdownFormat.ts`, pure selection-toggle logic for bold/italic/
  underline wrap, heading cycling, and bullet/numbered lists) edits the raw
  markdown text in place; a Preview toggle swaps the textarea for a
  read-only rendered view (`NotePreview.tsx` over `markdownPreview.ts`'s
  `parseMarkdown`). The renderer recognizes only that fixed vocabulary — plus
  a literal `<u>`/`</u>` pair for underline, matched as a string rather than
  parsed as a tag — so it never calls `dangerouslySetInnerHTML` and needed no
  sandboxing to ship (ROADMAP.md §6 decision 8). Format-as-you-type editing
  (no visible markdown markers, replacing the Preview toggle) is a tracked
  follow-up, ROADMAP.md D9.
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

- **Appearance** — theme preference (`themeStore`, light/dark/auto), then
  the **look** as the primary control: three curated directions
  (Lagoon/Ember/Slate) in `palettes.ts`, each rendered as a live desktop
  miniature — its own wallpaper, and a window carrying its control duotone —
  in a `radiogroup` of preview cards. Lagoon is still the prototype's values
  verbatim; Ember and Slate are tuned to the same OKLCH lightness/chroma
  register so all three read with the same weight.

  Everything finer sits behind a collapsed **Customize** disclosure: the
  custom accent picker (with a non-blocking WCAG AA warning from
  `design/color.ts`'s `checkAccentContrast`), the wallpaper design picker
  (the five procedural styles), the per-theme custom image slots with their
  fit mode, and wallpaper dimming. Presets stay the recommended path — the
  disclosure exists so the pane doesn't read as a wall of knobs.

  Below that, the "feel" axes stay as plain rows: `materialLevel`
  (clear/frosted/opaque chrome translucency), `uiScale`, `reduceMotion` (an
  explicit override layered on `useReducedMotion`'s OS-query default,
  combined by `useEffectiveReducedMotion`), and `animationSpeed` (a
  multiplier `Window.tsx`'s enter/minimize durations divide by).
  `wallpaperDim` is a scrim opacity `Desktop.tsx` renders behind its icons,
  separate from window chrome's own glass `backdrop-filter`.

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
9. ✅ Foundations & guardrails — CI (lint/typecheck/unit/e2e per PR across
   three browser engines), error boundaries, feature flags, CSP
10. ✅ File system maturity — content-addressed blob store, upload/download,
    multi-select, clipboard, keyboard nav, Get Info, open-with, Media Player
11. ✅ Desktop experience — desktop icons, session restore, app/window
    switchers, quarter snap + keyboard window ops, ⌘K search, dock
    focus-follows-app, Viewer pan/zoom/next-prev/slideshow, Terminal engine
    v2, accessibility pass (ARIA menu roles + arrow-key traversal, per-window
    Tab focus trap, visible focus rings, reduced-motion variants, axe-core
    audit)
12. ✅ PWA & offline packaging — installable manifest + icons, a hand-rolled
    offline-capable service worker (`public/sw.js`), storage persistence
    requested and surfaced in Settings › About, a menu-bar offline
    indicator, and the browser support matrix documented
    (`docs/browser-support-matrix.md`). H2 (i18n scaffolding) was scoped
    into this phase but deliberately deferred — see ROADMAP.md's Phase 12
    entry.

**Native desktop track (parallel, not phase-numbered — see `DIRECTION.md`):**
N-1 shipped — Tauri v2 shell (`src-tauri/`), `isTauri()` platform detection,
and the native `StorageAdapter`/`BlobStore` pair under `$APPDATA/disk`,
described under `StorageAdapter` above. `pnpm dev`/`build` (the website) are
unaffected. Remaining: N-2 (built-in Browser) and N-3 (signed/notarized
distribution, desktop e2e via `tauri-driver`).

**Next:** `ROADMAP.md` steps 13–17 — realigned docs, a stability pass over
the review backlog, app depth and customization (area U), the capability
sandbox and the apps that need it, then the third-party app SDK. The online
track that used to sit here is retired (`ROADMAP.md` §3.X.1): Kagami is
local-first with no server.

Steps 13–15 and step 16a (the capability sandbox — `src/system/sandbox/`, an
`<iframe sandbox="allow-scripts">` + capability-checked postMessage bridge)
are done; step 16b is underway, with D6 (PDF viewing, `src/apps/documents/`)
shipped 2026-08-01 as the sandbox's first real (non-demo) consumer. D4 (code
editor) and D7 (small utilities) remain, needing no sandbox.
