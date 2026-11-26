# Kagami OS

[![CI](https://github.com/kooki1000/kagami-os/actions/workflows/ci.yml/badge.svg)](https://github.com/kooki1000/kagami-os/actions/workflows/ci.yml)
[![Pages](https://github.com/kooki1000/kagami-os/actions/workflows/pages.yml/badge.svg)](https://github.com/kooki1000/kagami-os/actions/workflows/pages.yml)

Kagami is a desktop that runs in a browser tab. It has windows you can drag,
snap and resize, a dock, a menu bar, a file system, and a handful of apps. All
of it runs on your machine. There is no server, no account and no telemetry,
and nothing you create leaves the browser.

**Try it: [kooki1000.github.io/kagami-os](https://kooki1000.github.io/kagami-os/)**

It's built with React 19, TypeScript, Vite, Zustand and Tailwind v4.

## What you can do in the demo

Open Files and drop something in. Double-click opens it in the app that fits:
plain text and Markdown in Notes, source code in Code, images in the Viewer,
PDFs in Documents, and audio or video in the Player. Downloading a folder
gives you a zip.

- **Files** has folders, multi-select, copy and paste, a Trash with undo, and
  Get Info. Uploads and downloads handle real binary files, not just text.
- **Notes** is a rich-text editor. **Code** is a CodeMirror editor with syntax
  highlighting for the common languages.
- **Terminal** knows about two dozen commands (`ls`, `cat`, `grep`, `find`,
  `wc` and so on) and works on the same files you see in Files. It never
  executes code.
- **Paint**, **Calculator** and **Clock** are in the dock too.
- **Settings** changes the theme, the accent colour, the wallpaper and the dock.
  Pick one accent and the rest of the desktop follows it.

`⌘K` searches across apps and files. `⌃⌥` plus an arrow key snaps the focused
window. Close the tab and reopen it, and your windows come back where you left
them.

### Where your data lives

Files are stored in your browser's IndexedDB, and settings in localStorage.
Both belong to the site you opened, so clearing site data deletes them, and a
different browser or device starts empty. To keep a copy, use **Settings ›
General › Backup › Export disk**, which writes everything (Trash included) to one zip.
Importing a zip replaces the whole disk.

### What the demo can't do

- **The Browser app** needs the native desktop build. A normal web page can't
  embed other sites, so the web version shows a short explanation instead.
- **Response headers.** GitHub Pages doesn't let a site set its own, so the
  Content-Security-Policy ships as a `<meta>` tag. That covers scripts, styles
  and connections, but not `frame-ancestors`, which browsers only honor as a
  header. Anyone can embed the demo in an iframe.

The full e2e suite runs on Chromium, Firefox and WebKit, so Chrome, Firefox
and Safari are the supported browsers.
[`docs/browser-support-matrix.md`](docs/browser-support-matrix.md) lists the
known differences between them.

## Running it locally

You need **Node 22.23.1** and **pnpm**. With [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use            # reads .nvmrc
corepack enable    # or: npm i -g pnpm
pnpm install
pnpm dev           # http://localhost:5173
```

The repo pins Node on purpose (`.npmrc` sets `engine-strict`). Other versions
may fail at install time, and on Node 20 the linter crashes outright.

| Command                         | What it does                                      |
| ------------------------------- | ------------------------------------------------- |
| `pnpm dev`                      | Vite dev server with hot reload                   |
| `pnpm build`                    | Typecheck, then a production build into `dist/`   |
| `pnpm typecheck`                | Type-check only                                   |
| `pnpm lint` / `pnpm lint:fix`   | ESLint                                            |
| `pnpm test` / `pnpm test:watch` | Vitest unit tests                                 |
| `pnpm test:e2e`                 | Playwright, in Chromium, Firefox and WebKit       |
| `pnpm bench`                    | Vitest benchmarks                                 |
| `pnpm tauri dev` / `build`      | The native desktop shell (needs a Rust toolchain) |

The first time you run the e2e suite, `pnpm exec playwright install` fetches
the browsers. The suite runs against a production build, and Playwright reuses
a preview server already listening on port 4173. If you've left an old one
running, you'll be testing an old build.

## How the demo gets published

`.github/workflows/pages.yml` builds the site and deploys it to GitHub Pages.
Pull requests get the build but not the deploy, so a change that breaks the
Pages build fails before it merges. Every push to `main` deploys, then fetches
the live site as a smoke test.

Project Pages are served from `/kagami-os/`, not from the root. The build reads
the path from `VITE_BASE` (the workflow sets it to the repository name), and it
defaults to `/` everywhere else. To reproduce the Pages build on your machine:

```bash
VITE_BASE=/kagami-os/ pnpm build
VITE_BASE=/kagami-os/ pnpm preview   # http://localhost:4173/kagami-os/
```

If you fork the repo, enable it under **Settings › Pages › Source: GitHub
Actions** and the same workflow will publish your copy.

## Docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) explains how the shell fits together.
  Start here before changing anything non-trivial.
- [`DIRECTION.md`](DIRECTION.md) covers why there's both a web build and a
  native one, and the rules that keep them from drifting apart.
- [`ROADMAP.md`](ROADMAP.md) has the backlog and the order things get built in.
- [`docs/design-system.md`](docs/design-system.md) is the design guide: colour
  tokens, type, radii, and the places the code has drifted from them.
- [`docs/security-advisories.md`](docs/security-advisories.md) lists dependency
  alerts that were looked at and deliberately left open, with the reasoning.
- [`docs/improvement-proposals.md`](docs/improvement-proposals.md) is the
  review behind the roadmap's current steps. The rest of [`docs/`](docs)
  holds notes on blob storage, the native browser, browser support,
  performance and the closed review backlog.

## Feature flags

Unfinished work can land behind a flag. A flag defaults to whatever
`src/system/flags.ts` says, a `VITE_FLAG_<ID>` environment variable overrides
that at build time, and you can flip it per browser under **Settings › About ›
Feature flags** (or set `localStorage` key `kagami:flag:<id>`).
