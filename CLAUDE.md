# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kagami OS — a browser-based desktop environment (windowing shell, virtual
file system, built-in apps) that runs entirely client-side. React 19 +
TypeScript + Vite + Zustand + Tailwind v4.

**Kagami is local-first and there will be no server** — no accounts, no
backend, no telemetry, ever. The online track (accounts, sync, sharing) was
retired in July 2026; see `ROADMAP.md` §3.X.1 for the reasoning and §3.X.2
for the parked bring-your-own-storage alternative. Don't propose a backend.

Steps 14–16 are done (`ROADMAP.md` §4): stability, app depth and
customization (area U), the capability sandbox and the apps that needed it.
**Step 17, the third-party app SDK, is what's next.** Anything
distribution-shaped — public deploy, releases, signed installers — is
deliberately below that line.

Two rules the app suite is now governed by: the D-area list is **closed**
(§6.2) — a new app is a new decision, not an extension of "fill the obvious
holes" — and whether something renders in the capability sandbox is settled
by §6.8 (Notes) and §6.9 (the code editor) together, not case by case. The
short version: the sandbox is for renderers that _interpret or execute_
untrusted content, and anything that fetches, embeds or evaluates what it
displays belongs inside it.

## Commands

Requires **Node 22.23.1** exactly (`.nvmrc`, `engines`, `.npmrc
engine-strict=true` all enforce it). If the shell resolves to a different
Node (e.g. a default of v20), `pnpm lint` crashes at ESLint config-eval time
(Iterator helpers need Node 22+) even though `tsc`/`vite` still work — run
`nvm use` first.

```bash
nvm use                          # Node 22.23.1
pnpm install
pnpm dev                         # Vite dev server, http://localhost:5173
pnpm build                       # tsc --noEmit, then production build
pnpm typecheck                   # tsc --noEmit only
pnpm lint / pnpm lint:fix        # ESLint (antfu config)
pnpm test                        # Vitest unit suites (run mode)
pnpm test:watch                  # Vitest watch mode
pnpm test:e2e                    # Playwright, against a production preview build
pnpm bench                       # Vitest bench suites
pnpm tauri dev                   # native (Tauri) shell against Vite — needs a Rust toolchain
pnpm tauri build                 # native desktop build — needs a Rust toolchain
```

`pnpm tauri dev`/`build` (`src-tauri/`) are the native-desktop track
(`DIRECTION.md`); they need [rustup](https://rustup.rs) installed but touch
no web-build files — `pnpm dev`/`build` are unaffected either way.

Single test file: `pnpm vitest run src/system/fs/fsStore.test.ts` (or
`pnpm vitest src/system/fs/fsStore.test.ts` to watch). Single Playwright spec:
`pnpm exec playwright test e2e/files.spec.ts`.

Unit tests run in a **`node` environment, no jsdom/RTL** — the store/engine
logic under test is deliberately framework-agnostic. Suites live next to
their code (`*.test.ts` under `src/`), not in a separate tree. E2E specs live
in `e2e/` and run against `pnpm build && pnpm preview` across Chromium,
Firefox, and WebKit.

CI (`.github/workflows/ci.yml`) runs two jobs on every push/PR to `main`:
`pnpm audit --audit-level=high` → lint → typecheck → unit tests (job
`verify`), and Playwright e2e (job `e2e`) — both pinned to Node 22.23.1.

## Architecture

`ARCHITECTURE.md` is the living design doc — read it before any
non-trivial change; update it when a change alters one of the seams below.
`ROADMAP.md` tracks the phased feature backlog, and
`docs/review-backlog.md` holds bugs from the last review pass (with repros
and proposed fixes) — as of step 14 every entry in it is resolved, so read it
as a record of what was fixed and why, not as open work.
`docs/security-advisories.md`
records dependency vulnerability alerts that were investigated and
deliberately left open (with the reasoning and a revisit condition) — check
it before re-dismissing or "fixing" an alert someone already triaged. The
summary here is a map, not a substitute for those.

### The two seams new features hook into

1. **App manifest pattern** (`src/system/apps/`) — every app is an
   `AppManifest` registered in `registry.ts`. The shell (window manager,
   dock, menu bar) renders everything generically from manifests, so adding
   an app never touches shell code. `component` is `React.lazy`; `menus` is
   data the menu bar renders for the focused app; `launchApp()` is the only
   bridge from a manifest into the window store. Apps live in
   `src/apps/<app-id>/` with an `index.ts` exporting the manifest.

2. **Storage adapter** (`src/system/fs/`) — `StorageAdapter`
   (`loadAll`/`putMany`/`removeMany`) is the persistence seam behind the VFS;
   the MVP impl is raw IndexedDB (`idbAdapter.ts`, not the `idb` package —
   blocked by the workspace's `minimumReleaseAge` pnpm policy). Swapping
   persistence (or adding a server backend) touches only this file.
   `FileSystemProvider` (`provider.ts`) is the separate app-facing async API
   (`readDir`/`writeFile`/`move`/…) for consumers that don't need
   reactivity; UI like Files subscribes to the `useFsStore` Zustand store
   directly instead, and both share the same state.

### State stores

Two decoupled Zustand stores plus small satellites, each independently
persisted where relevant:

- `system/windows/windowStore.ts` — window manager. Pure state + actions, no
  React imports (unit-testable headlessly, drivable from the browser
  console). Focus uses a monotonic `nextZ` counter rather than re-sorting.
- `system/fs/fsStore.ts` — the VFS tree (`FsNode`s), write-through
  fire-and-forget persistence via the storage adapter above.
- `system/theme/themeStore.ts`, `system/dock/dockStore.ts`,
  `system/settings/settingsStore.ts`, `system/notifications/notificationStore.ts`
  — theme preference, dock pins/size/position, appearance settings, and
  session-scoped notification history/toasts, respectively. All but
  notifications persist to `localStorage` via zustand's `persist`
  middleware, independent of the IndexedDB fs adapter.

Stores expose test seams (`__resetFsStoreForTest`, `indexNodes`, `setState`
seeding) — see `windowStore.test.ts` / `fsStore.test.ts` for the pattern.

### Design tokens — do not drift toward macOS defaults

**`docs/design-system.md` is the design guide** — exact token values, the
`--accent` vs `--accent-strong` accessibility contract, the radius/type/motion
vocabularies, component recipes, and a drift register. Read it before adding a
color, radius, type size or new surface; the summary below is a map, not a
substitute.

Source of truth is the "Lagoon" Claude Design prototype. Values live in two
places kept in sync: `src/styles/global.css` (CSS custom properties, themed
via `:root[data-theme='dark']`, mapped to Tailwind utilities via `@theme
inline`) and `src/design/tokens.ts` (same values as data for code that needs
them programmatically). At runtime, Settings writes the whole appearance
inline on `<html>` (inline beats stylesheet defaults) — the curated "looks"
live in `system/settings/palettes.ts`, the procedural wallpaper designs in
`system/settings/wallpaperStyles.ts`.

A look is one accent pair; the control duotone and the wallpaper's five tone
roles are **derived from it** in OKLCH (`src/design/color.ts`), which is what
stops a user-picked accent from clashing with the desktop. Don't hand-author
colors downstream of the accent — extend the derivation, or the look table.
There is exactly one sanctioned exception, and it argues for itself in
`src/apps/code/syntaxPalette.ts`: syntax highlighting, where the hues carry
meaning and must stay distinguishable from each other, so they are fixed and
contrast-tested rather than derived. Adding a second exception needs the same
kind of argument, in the file, plus a test.
Wallpaper styles must emit no viewport units (Settings previews them in small
cards) and size tiled geometry through `var(--wall-tile)`.

Binding constraints from the prototype:

- Window controls are monochrome at rest; focused windows tint them with a
  **duotone** derived from the active look's one accent (coral + teal under
  Lagoon) — **never** three independent colors, **never** a red/yellow/green
  triad, **never** system blue.
- Dock tiles are rounded squares (13px) with a hover lift — no magnification
  curve, no squircles.
- Inter (text) / JetBrains Mono (mono), via Fontsource.
- Generic app naming ("Files", "Settings") — no Apple/Puter naming or assets.
- Radius pairing: window 14 / dock tile 13 / button 7. Menu bar 30px, title
  bar 40px, dock icon 46px.

### Cross-app plumbing

- **"Open with"**: windows carry an optional `payload`; `system/apps/openFile.ts`
  maps MIME type → app (`text/*` → Notes, `image/*` → Viewer) and reuses an
  existing window for a file already open where possible.
- **App-defined menu commands**: shell commands use `CommandId` (handled by
  `system/commands.ts`); app-specific menu items use `appCommand` strings
  routed through `system/appCommands.ts` (a per-window pub/sub) to the
  focused window via `useAppCommand`. This is how Files' View/Go menus,
  Notes' New Note, and Viewer's zoom/rotate reach the focused instance
  without the shell knowing app internals.
- **Keyboard shortcuts** (`system/shortcuts.ts`): no separate keymap — a
  global keydown handler builds the same chord string already shown on menu
  items ("⌘W", "⇧⌘N") and dispatches whichever command/appCommand that menu
  item would run.

### Terminal

`src/apps/terminal/shell.ts` is a pure, framework-agnostic engine
(`runCommand(input, ctx) → ShellResult`, **no real code execution**) that
interprets a fixed command set against a `ShellContext` capability bag over
the fs store — writes land in the same VFS the Files app shows. Keep new
commands in the pure engine, not the React REPL shell
(`TerminalApp.tsx`), so they stay unit-testable without React.

### Browser (native only)

`src/apps/browser/` is chrome-only React over a **native child webview** that
Rust (`src-tauri/src/browser.rs`) layers on top of the content region — the
page is never in the DOM. Nothing React renders can overlay it, find can't
walk it, and keyboard focus inside it never reaches `system/shortcuts.ts`.
`chromeHeight()` is therefore load-bearing: it's the arithmetic that positions
the webview, so any new chrome strip must be added to it or it renders
underneath the page. `docs/browser-depth.md` has the full constraint list and
the security boundaries (address bar, restored payloads, download staging
paths). The web build renders an "available in the desktop app" state instead.

### Blob storage (Phase 10, shipped)

Design note: `docs/blob-architecture.md`. Large/binary file content lives
outside `FsNode.content` (inline string, capped at 64 KB) in a
content-addressed `BlobStore` (SHA-256 hash → bytes), parallel to
`StorageAdapter`, giving dedupe and real upload/download. Consumers resolve
bytes via `useBlobUrl(ref)` rather than reading `node.content` directly once
a node has a `contentRef`.

## Conventions

- Path alias `@/*` → `src/*` (both `tsconfig.json` and `vite.config.ts`).
- ESLint is the `@antfu/eslint-config` base (react + formatters + stylistic:
  2-space indent, semicolons, double quotes) plus
  `eslint-plugin-better-tailwindcss` for `src/styles/global.css`-aware class
  linting.
- The production build injects a strict CSP via a Vite plugin
  (`vite.config.ts`); `frame-ancestors`/HSTS must be set as real response
  headers at deploy time, not in the meta tag.
- Feature flags: `src/system/flags.ts`, build-time `VITE_FLAG_*` env vars,
  overridable per device in Settings › About or via `localStorage
kagami:flag:<id>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): summary` (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`,
  `ci`, `perf`; scope is optional, e.g. a feature ID like `c1` or an area like
  `windows`). Body explains why, not what — the diff already shows what
  changed.
- Branch names are `<type>/<slug>`, kebab-case, `<type>` matching the
  commit type the branch is mostly made of (`feat`, `fix`, `chore`, `docs`,
  `perf`, `test`, `review`); `<slug>` is a short description, e.g.
  `feat/session-restore` or `fix/player-payload-staleness`.
