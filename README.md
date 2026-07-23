# Kagami OS

[![CI](https://github.com/kooki1000/kagami-os/actions/workflows/ci.yml/badge.svg)](https://github.com/kooki1000/kagami-os/actions/workflows/ci.yml)

A browser-based desktop environment — windowing shell, virtual file system,
and a suite of built-in apps, all client-side. Built with React, TypeScript,
Vite, Zustand, and Tailwind v4.

The website is the zero-install baseline. A **native desktop app** (Tauri)
is the next direction: the same codebase, packaged natively, with a real
isolated filesystem and a built-in browser — progressive enhancement, not a
pivot away from the web. See [`DIRECTION.md`](DIRECTION.md).

## Getting started

Requires **Node 22.23.1** (LTS "jod") and **pnpm**. With
[nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use            # reads .nvmrc → 22.23.1
corepack enable    # or: npm i -g pnpm
pnpm install
pnpm dev           # http://localhost:5173
```

> `.npmrc` sets `engine-strict`, so the pinned Node version is enforced on
> install. The repo is tested on Node 22.23.1; other versions may fail.

## Scripts

| Command                         | What it does                                     |
| ------------------------------- | ------------------------------------------------ |
| `pnpm dev`                      | Vite dev server with HMR                         |
| `pnpm build`                    | Typecheck (`tsc --noEmit`) then production build |
| `pnpm typecheck`                | Type-check only                                  |
| `pnpm lint` / `pnpm lint:fix`   | ESLint (antfu config)                            |
| `pnpm test` / `pnpm test:watch` | Vitest unit suites                               |

## Continuous integration

Every push and pull request to `main` runs lint → typecheck → unit tests on
Node 22.23.1 (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Project docs

- [`DIRECTION.md`](DIRECTION.md) — where the project is going and why: the
  native desktop (Tauri) direction, the dual-runtime principle, and the
  guardrails that keep it coherent.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the shell's moving parts and the two
  seams (app manifest pattern, storage adapter) that future features hook into.
- [`ROADMAP.md`](ROADMAP.md) — feature backlog and the phased plan toward a
  full online desktop, plus the parallel native desktop track.

## Feature flags

Dark-shipping is gated by `src/system/flags.ts` (build-time `VITE_FLAG_*` env
vars, overridable per device in **Settings › About › Feature flags** or via
`localStorage` `kagami:flag:<id>`).
