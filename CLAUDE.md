# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kagami OS — a browser-based desktop environment (windowing shell, virtual
file system, built-in apps) that runs entirely client-side. React 19 +
TypeScript + Vite + Zustand + Tailwind v4.

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
`docs/review-backlog.md` holds known open bugs from the last review pass
(with repros and proposed fixes) — check it before touching the shell's
menus, the Files view, or the persisted stores. The summary here is a map,
not a substitute for those.

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

Source of truth is the "Lagoon" Claude Design prototype. Values live in two
places kept in sync: `src/styles/global.css` (CSS custom properties, themed
via `:root[data-theme='dark']`, mapped to Tailwind utilities via `@theme
inline`) and `src/design/tokens.ts` (same values as data for code that needs
them programmatically). At runtime, Settings can override accent/wallpaper
vars inline on `<html>` (inline beats stylesheet defaults) — presets live in
`system/settings/palettes.ts`.

Binding constraints from the prototype:

- Window controls are monochrome at rest; focused windows tint them with a
  coral + teal duotone — **never** a red/yellow/green triad, **never**
  system blue.
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

### Blob storage (Phase 10, in progress)

Design note: `docs/blob-architecture.md`. Large/binary file content is
moving out of `FsNode.content` (inline string, capped at 64 KB) into a
content-addressed `BlobStore` (SHA-256 hash → bytes), parallel to
`StorageAdapter`, enabling dedupe and unblocking real upload/download.
Consumers resolve bytes via a `useBlobUrl(ref)`-style hook rather than
reading `node.content` directly once a node has a `contentRef`.

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
