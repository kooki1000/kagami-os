# Kagami OS

[![CI](https://github.com/kooki1000/kagami-os/actions/workflows/ci.yml/badge.svg)](https://github.com/kooki1000/kagami-os/actions/workflows/ci.yml)

A desktop environment that runs in the browser: a windowing shell, a virtual
file system and a suite of built-in apps, all client-side. Built with React,
TypeScript, Vite, Zustand and Tailwind v4.

Kagami is **local-first**. There is no account, no server and no telemetry,
and your files stay on your machine.

It runs two ways from one codebase. The website is the zero-install
baseline. The native desktop app (Tauri) adds a real folder on disk for the
file system and a built-in web browser. See [`DIRECTION.md`](DIRECTION.md).

**Apps:** Files, Notes, Code, Viewer, Documents (PDF), Media Player,
Terminal, Calculator, Clock, Paint, Settings, and Browser in the desktop
app. Third-party apps can be installed as sandboxed bundles behind the
`third_party_apps` flag while the SDK is finished.

## Getting started

Requires **Node 22.23.1** and **pnpm**. With
[nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use            # reads .nvmrc → 22.23.1
corepack enable    # or: npm i -g pnpm
pnpm install
pnpm dev           # http://localhost:5173
```

`.npmrc` sets `engine-strict`, so install fails on any other Node version.
If your shell defaults to an older Node, `pnpm lint` crashes even where the
build works; run `nvm use` first.

## Scripts

| Command                         | What it does                                      |
| ------------------------------- | ------------------------------------------------- |
| `pnpm dev`                      | Vite dev server with HMR                          |
| `pnpm build`                    | Typecheck (`tsc --noEmit`), then production build |
| `pnpm typecheck`                | Typecheck only                                    |
| `pnpm lint` / `pnpm lint:fix`   | ESLint (antfu config)                             |
| `pnpm test` / `pnpm test:watch` | Vitest unit suites                                |
| `pnpm test:e2e`                 | Playwright, against a production preview build    |
| `pnpm bench`                    | Vitest benchmarks                                 |
| `pnpm tauri dev`                | Native (Tauri) shell against the Vite dev server  |
| `pnpm tauri build`              | Native desktop build                              |

The `tauri` scripts also need a Rust toolchain ([rustup](https://rustup.rs)).
The web scripts don't.

## Continuous integration

Every push and pull request to `main` runs two jobs on Node 22.23.1
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- **verify:** `pnpm audit --audit-level=high`, lint, typecheck, unit tests.
- **e2e:** the Playwright suite on Chromium, Firefox and WebKit.

CI doesn't build the Tauri shell, so run `cargo fmt`, `cargo clippy` and
`cargo test` in `src-tauri/` yourself when you change Rust code.

## Project docs

- [`DIRECTION.md`](DIRECTION.md): why Kagami is local-first and runs two
  ways, and the guardrails that keep it coherent.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): how the shell, file system, apps and
  sandbox fit together.
- [`ROADMAP.md`](ROADMAP.md): what "finished" means and the steps left to
  get there.
- [`docs/`](docs): the design system, the improvement review behind the
  current roadmap, and notes on blob storage, the native browser, browser
  support, performance, security advisories and the closed review backlog.

## Feature flags

`src/system/flags.ts` gates unfinished features. Set them at build time with
`VITE_FLAG_*` env vars, or per device in **Settings › About › Feature
flags** or `localStorage` `kagami:flag:<id>`.
