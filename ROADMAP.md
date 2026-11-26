# Kagami OS — Roadmap

**Status:** revised November 2026
**Baseline:** phases 1–12 and steps 13–16 shipped; step 17 (the app SDK)
half shipped; native N-1 and N-2 shipped; the web build live at
[kooki1000.github.io/kagami-os](https://kooki1000.github.io/kagami-os/).

This document says what "finished" means for Kagami, lists the gap between
that and `main`, and puts the remaining work in order. Feature items carry
stable IDs (`B13`, `D8.7`, …) so branches, commits and issues can refer to
them. `ARCHITECTURE.md` describes what exists; `DIRECTION.md` explains why
the project is shaped the way it is.

> **November 2026 revision.** Area U (app depth and customization) is
> finished, along with step 16. This pass removes the detail for shipped work
> (it lives in `ARCHITECTURE.md` and git history), finishes step 17's scope,
> and adds steps 18–21. Those come from the review in
> `docs/improvement-proposals.md`, which found the remaining gaps cut across
> apps rather than sitting inside any one of them: backups that miss half the
> desktop, no way back from an overwrite, search that only sees file names,
> and a desktop that can't exchange files with the host OS except through
> Upload and Download.

**Sizing:** `S` ≈ half a day · `M` ≈ 1–3 days · `L` ≈ 1–2 weeks · `XL` ≈
several weeks, needs its own design note.

**Contents**

1. [Where the project stands](#1-where-the-project-stands)
2. [Definition of "finished"](#2-definition-of-finished)
3. [Backlog by area](#3-backlog-by-area) (open items only, plus §3.X retired and parked)
4. [Roadmap](#4-roadmap) — steps 17–21
5. [Technical debt register](#5-technical-debt-register)
6. [Decisions](#6-decisions)
7. [Risk register](#7-risk-register)
8. [Success metrics](#8-success-metrics)
9. [Testing and release](#9-testing-and-release)
10. [Immediate next steps](#10-immediate-next-steps)

---

## 1. Where the project stands

- **Shell.** Menu bar with per-app manifest menus, dock (pins, size,
  position), three curated looks over five procedural wallpapers, custom
  accent and wallpaper image, interface scale, toasts and a notification
  center, global shortcuts, ⌘K name search, app and window switchers,
  desktop icons, session restore.
- **Window manager.** Focus by monotonic z-index, drag, 8-way resize,
  minimize to dock, maximize, edge and quarter snap, keyboard window ops,
  viewport clamping. A pure Zustand store, unit-tested.
- **File system.** `FsNode` tree in Zustand behind the `StorageAdapter`
  seam, a content-addressed `BlobStore` for anything over 64 KB, Trash with
  restore and optional 30-day auto-empty, full-disk zip export and import.
- **Apps.** Files, Notes (WYSIWYG markdown), Code (CodeMirror 6), Viewer,
  Documents (PDF, sandboxed), Media Player, Terminal, Calculator, Clock,
  Paint, Settings, Welcome (a first-run tour), and Browser in the native
  build.
- **Platform.** Installable PWA with an offline service worker, deployed to
  GitHub Pages from `main` (`.github/workflows/pages.yml`); a Tauri
  shell with disk-backed adapters under `$APPDATA/disk`; a capability
  sandbox (`src/system/sandbox/`) that runs Documents and installed
  third-party bundles.
- **Quality.** 86 Vitest suites and 45 Playwright specs across Chromium,
  Firefox and WebKit in CI; strict ESLint; type-checked builds; strict CSP;
  axe-core coverage.

**The gap.** The apps aren't the problem any more. What's missing is the
layer around them. The disk is the user's only copy, and the backup leaves
out every `localStorage` store, including the grants installed apps depend
on. Nothing protects a file from being overwritten. ⌘K can't search inside
files. And the SDK can install and run an app, but nobody outside the repo
has a document to write one from, and an installed app can't open a file.

---

## 2. Definition of "finished"

What the user can do when Kagami is done:

1. **It's yours, and it stays yours.** No account, no server, no telemetry.
   Files never leave the machine unless the user exports them.
2. **Nothing breaks, and nothing is lost.** No stuck state, no silent write
   failure. The whole desktop, settings and installed apps included,
   round-trips through a backup, and a bad edit can be undone after the
   fact.
3. **Real files.** Upload, download, preview and manage files the way a
   native file manager does, and open host files in Kagami directly.
4. **Apps you'd actually use.** Every built-in app is finished, and every
   file type the VFS can hold opens in an app that handles it.
5. **It feels like yours.** Wallpaper, accent, density, dock, desktop and
   default apps are under the user's control, inside a design system that
   keeps the result readable.
6. **A real app platform.** A documented, capability-scoped way to add apps
   without touching the shell and without trusting them.
7. **Runs everywhere.** The same desktop as a website and as a native app.
   See `DIRECTION.md` §3.

Statements 1, 4, 5 and 7 are met. Step 17 finishes 6, steps 18 and 19 finish
2, and step 21 finishes 3.

**Not in this definition:** multi-device sync and sharing. Both are below
the line (§3.X).

---

## 3. Backlog by area

Shipped rows are gone from these tables. Their IDs stay reserved, and the
detail is in `ARCHITECTURE.md` or the commit that shipped them. Fully shipped
areas: **U** (U1–U17, step 15) and the D-area apps D1–D7 and D9.

### B. File system and data safety

| ID  | Feature                                                                                                                                                                                                                    | Size | Notes                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| B9b | **Content search** — the second half of B9. An in-memory inverted index over text content, built in a Worker at boot and updated from `fsStore.commit()`; ⌘K results show a one-line snippet                               | M/L  | B9 deferred this until B1 shipped. It has. The index is reused by D10's backlinks |
| B14 | **Backup reminder** — record `lastBackupAt`, show it in the Backup row, notify once past a threshold (default 7 days, Safari's eviction window). Off in the native build                                                   | S    | Addresses R1 directly                                                             |
| B16 | **Version history for text files** — on save, keep the previous content hash if it's more than a few minutes old (cap 20 per node); blob GC treats them as live; "Revert to…" in Get Info and both editors                 | L    | Needs T11. Content addressing makes old versions nearly free                      |
| B17 | **Undo for file operations** — an inverse-op stack in the fs store for move, rename, drag-and-drop and paste; ⌘Z in Files and on the desktop when no text field has focus. The existing trash-undo toasts move onto it     | M    |                                                                                   |
| B18 | **Automatic backup folder** — on Chromium, a `showDirectoryPicker` handle stored in IndexedDB; Kagami writes a rolling backup zip there on a schedule and keeps the last few. The native build does the same through Tauri | M/L  | One-way, never reads back, so it isn't §3.X.2 sync. Firefox and Safari keep B14   |

### C. Shell and window manager

| ID  | Feature                                                                                                                                                                    | Size | Notes                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| C3  | **Window overview** — zoomed-out grid of open windows, click to focus                                                                                                      | L    | Nice to have, not load-bearing. Unscheduled                            |
| C5  | **Storage meter** — usage against quota from `navigator.storage.estimate()` in Settings › General and as an optional menu-bar item; warn before a large write would fail   | S    | Nothing in `src/` calls `estimate()` yet                               |
| C7  | **Multi-monitor** — populate `OsWindow.screenId` from the Window Management API                                                                                            | XL   | Deferred. The seam exists so nothing blocks on it                      |
| C9  | **Commands in ⌘K** — list the focused app's enabled menu items and the shell commands next to file results ("New Note", "Empty Trash", "Toggle Dark Mode", Settings panes) | S/M  | Menus are already data; `shortcuts.ts` already runs them. No new model |

### D. App suite

The list of apps is closed (§6.2). What's left is the SDK and the leftovers
inside existing apps.

| ID  | Feature                                                                                                                                                                                                                                                                 | Size | Notes                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| D8  | **Third-party app SDK** — D8.1–D8.8 shipped (fs write/delete, `/Apps` and the manifest schema, the flag, the dynamic registry and host, sideload install with consent, the Apps pane and uninstall, live revocation, the reference app). Remaining tasks are in step 17 | XL   | See §4                                                                                              |
| D10 | **Links between notes** — a `[[Note name]]` editor node whose only attribute is a VFS node id, opened through `openFile` inside the shell; a "Linked from" list using B9b's index                                                                                       | M/L  | Changes the schema, so it needs the PR §6.8 asks for. Image embeds stay out: a `blob:` URL is a URL |
| D11 | **App leftovers** — Documents: continuous scroll, text selection, find. Notes: nested lists. Terminal: multi-line input, `<` redirect, user variables. Player: Next/Previous should update the window payload (T13)                                                     | M    | Take these opportunistically; none blocks a step                                                    |

### F. Platform

| ID  | Feature                                                                                                                                                                                                        | Size | Notes                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| F3  | **Touch and small screens**                                                                                                                                                                                    | L    | De-scoped by §6.1                                                                |
| F5  | **PWA file handler** — `file_handlers` in `manifest.webmanifest` plus a `launchQueue` consumer: files opened from the host OS are copied into the VFS and handed to `openFile`                                 | M    | Chromium only; other engines ignore the field. The Tauri equivalent waits for N5 |
| F6  | **Paste from the host clipboard** — an image or text on the system clipboard pasted into Files or the desktop becomes a file there via `createBlobFile`; Kagami's own clipboard store wins when it's non-empty | S/M  |                                                                                  |
| F7  | **Drag out to the host** — a `DownloadURL` drag from Files saves the file on the host desktop                                                                                                                  | S    | Chromium only; everyone else keeps Download                                      |

### G. Security and privacy

G1 (security baseline), G2 (the sandbox) and G4's data export shipped; G3
(encryption) was retired with the server. The open security work is the
SDK's: every new bridge method in step 17 needs negative tests (§9).

### H. Quality

| ID  | Feature                                                                                                   | Size | Notes                                                       |
| --- | --------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| H2  | **i18n scaffolding** — extract UI strings; formatting already uses `navigator.language` (`lib/format.ts`) | M    | Cost grows slowly with each app. Last in line               |
| H3  | **Performance, remaining** — virtualize the Notes and Code sidebars; add a Lighthouse budget to CI        | S/M  | Files is virtualized and `childrenOf` is cached (T7 closed) |

### N. Native desktop (Tauri)

N1–N4 shipped. **N5** (desktop build and release pipeline: `tauri-action`
over three OSes, signing, notarization, auto-update, `tauri-driver` e2e) is
deferred with the rest of distribution (§3.X.3).

---

### X. Retired and parked

Kept so nobody re-derives the reasoning.

#### X.1 The online track — retired

A backend, accounts, a remote adapter, an op-log sync engine, quotas,
device management, share links and co-presence (former areas A and E).

**Why.** All of it needs a server this project won't run. The cost was never
the weeks of code. It was Postgres, blob storage, auth, rate limiting, abuse
handling, and being responsible, indefinitely and for free, when a sync bug
eats somebody's files. Local-first is the stronger position for this
project.

**What was kept.** The seams. `StorageAdapter` and `BlobStore`
(`src/system/fs/types.ts`) already carry the IndexedDB and native-disk
implementations and would carry X.2 unchanged. The old design sketches for
the sync engine and API (former Appendices A.1 and A.3) are in git history at
`d5fc414`.

#### X.2 Bring-your-own-storage sync — parked

The user supplies the backend (a synced folder via the File System Access
API, or a private Git repository over a token) and Kagami syncs through it.
No server and nothing to operate.

If it's picked up:

- `fsStore.commit()` and `removeIds()` are the interception points.
  `removeMany` erases with no tombstone, so nodes need a version and deletes
  need a marker before anything can sync.
- Scope it as a snapshot merge, not an op log: one user, no realtime. The
  merge is a pure function under property tests, and conflicts become
  "name (conflicted copy)" via `uniqueChildName`.
- The File System Access API is Chromium-only, so a second backend is needed
  as cross-browser proof. B18 builds the one-way half of this and is a
  reasonable first step.

#### X.3 Distribution — mostly deferred

Tagged releases, a changelog, contributor onboarding and signed installers
(N5) wait until §2 is met. The product gets finished before it gets
distributed.

The web build is the exception. It has been live on GitHub Pages since
2026-11-26, because a static demo costs one workflow and lets anyone try the
app. Pull requests build it and pushes to `main` deploy it; per-PR preview
URLs and versioned releases are still open. `ARCHITECTURE.md`'s Hosting
section covers what Pages does and doesn't give us.

The LICENSE is the other open item, and it's hygiene rather than
distribution (§6.3).

---

## 4. Roadmap

Ordering rules: work that protects user data goes before work that adds
surface; a refactor goes before the two features that would otherwise each
do it; and every step ends demoable, with e2e coverage on every engine the
feature runs on.

### Shipped

| Step        | What                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phases 1–12 | Shell, window manager, VFS, blob store, the first app suite, CI and flags, desktop experience, accessibility pass, PWA and offline |
| Step 13     | Documents realigned around local-first (July 2026)                                                                                 |
| Step 14     | Rock-solid: the whole review backlog closed (`docs/review-backlog.md`), full-disk export and import, no silent write failures      |
| Step 15     | Area U: customization and per-app depth, plus Notes' markdown preview (D1) and WYSIWYG editor (D9)                                 |
| Step 16     | 16a the capability sandbox; 16b Documents (D6), Calculator, Clock and Paint (D7), Code (D4)                                        |
| N-1, N-2    | Tauri shell with disk adapters; the native Browser and its depth pass                                                              |
| Web demo    | The web build on GitHub Pages, servable from a subpath via `VITE_BASE` and `publicUrl()` (2026-11-26)                              |

### Step 17 — Finish the app SDK _(≈ 3–4 weeks)_

D8.1–D8.5 shipped 2026-08-05, D8.6–D8.8 on 2026-11-26. The exit criterion has always been "an app
written outside this repository", and the reference app in D8.8 proves the
mechanics but not that an outsider could write one. D8.9–D8.12 close that.

| ID    | Task                                                                                                                                                                                                                                                                                                         | Size | Depends on | Accept                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| D8.9  | **Author docs and starter** — `docs/app-sdk.md` (bundle format, manifest fields, every bridge method and its capability, error codes, the security model); the client published as one copyable file with its types; D8.8's app doubles as the template                                                      | M    | —          | Someone following only the doc builds and installs a working app                                                    |
| D8.10 | **Private data folder** — every installed app gets `Apps/<id>/data` with read and write and no consent prompt; uninstall removes it                                                                                                                                                                          | S    | —          | An app persists state across reloads without requesting any fs scope                                                |
| D8.11 | **Installed apps open files** — a `fileTypes` manifest field feeding `openFile.ts` and the Default Apps pane (never the default on install), plus a per-file grant: opening a file with an app grants access to that one node for that window, and `fs.pick` shows a shell-drawn picker that grants the same | M    | D8.9       | An installed viewer appears in Open With and reads only the file it was handed; negative tests for every other node |
| D8.12 | **Menus and dock badges over the bridge** — a `menus.set` method validated against `MenuSection`, items carrying `appCommand` strings; a badge method for the dock tile. Both were in 16a's scope and never landed                                                                                           | S/M  | D8.4       | A sandboxed app's menus show in the menu bar and its chords dispatch                                                |

**Prerequisite:** the LICENSE (§6.3). Nobody can legally build against an
SDK whose source carries no license.

**Exit:** a developer who has only read `docs/app-sdk.md` builds an app that
installs from a bundle, appears in the dock, opens a file handed to it from
Files, reads only what it was granted, and uninstalls cleanly.

### Step 18 — Safety net _(≈ 1–1.5 weeks)_

B14, C5, B13, B15, then B18. The first two are small and touch nothing step
17 touches, so they can land between D8 PRs rather than waiting for it.

**Exit:** a backup made on one machine restores on another with the look,
dock, desktop layout and installed-app grants intact; a backup can be merged
into a folder instead of replacing the disk; the user can see when they last
backed up and how much space is left.

### Step 19 — Edit safety _(≈ 2 weeks)_

T11 then T10 first: both rewrite code that B16 and D10 are about to change,
so paying them here means the editors' save path changes once. Then B16 and
B17.

**Exit:** a note overwritten by select-all-and-type can be restored to any of
its last 20 versions; a drag into the wrong folder is undone with ⌘Z.

### Step 20 — Find and link _(≈ 2 weeks)_

C9, then B9b, then D10. C9 is cheap and immediately useful; B9b's index is
what D10's backlinks need.

**Exit:** ⌘K finds a note by a phrase inside it and runs any enabled menu
command by name; `[[A note]]` in one note opens the other, and the target
lists its backlinks.

### Step 21 — Working with the host _(≈ 1 week)_

F5, F6, F7. Mostly Chromium-only, which is why they sit behind the
cross-browser steps.

**Exit:** in installed Chromium, a `.md` file opened from the host OS opens
in Notes; a pasted screenshot becomes a PNG in the current folder; a file
dragged out of Files lands on the host desktop.

### After step 21

H2 (i18n), the H3 remainder, D11 leftovers and C3, in whatever order demand
suggests. Then §2 is met, and the rest of distribution (§3.X.3: releases,
installers, contributor onboarding) becomes the next decision.

### Native track

Runs alongside the steps. N-3 (N5) is deferred with distribution. Whether
the native build ever gives third-party apps something more than the
sandboxed iframe stays out of scope (`DIRECTION.md` §3.3).

### Dependencies

```text
LICENSE ─────────────► step 17 (D8.9 publishes an SDK)
D8.9 ► D8.11        D8.10 is unblocked
B14, C5 ─ any time ─► B13 ► B15 ► B18
T11 ► B16      T10 ► D10      B9b ► D10      §6.8 revisit ► D10
§2 met ──────────────► distribution (X.3)
```

---

## 5. Technical debt register

T0–T5, T7 and T9 are closed. The table lists what's open.

| ID  | Debt                                                                                                                                                                                                   | Plan                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| T6  | `fsStore.deleteForever` doesn't enforce trash-only itself; the guard lives at call sites. Closed for the bridge (D8.1: `BridgeDeps` can't reach it), still open for in-process callers                 | Optional; harden if a new caller appears |
| T8  | The `idb` library is blocked by `minimumReleaseAge`; the raw-IDB adapter is fine. B18's stored directory handle adds IDB code, so revisit then                                                         | Revisit at B18                           |
| T10 | Notes and Code duplicate their sidebar: `fileScope.ts` shares the listing logic, but ~130 lines of JSX and state are a fork. A11y fixes have already had to be carried across by hand                  | Step 19, before D10                      |
| T11 | `NoteEditor` and `CodeEditor` each carry the text-document lifecycle: the 5 MB cap, the blob load, the unmount flush, the migration across `BLOB_INLINE_THRESHOLD`. Wants a `useTextFileDocument` hook | Step 19, before B16                      |
| T12 | `viewPrefsStore` and `themeStore` declare a `version` but no `migrate`, so the first shape change silently drops their state. `settingsStore` hit exactly this in step 15                              | Fix with B13, which runs every `migrate` |
| T13 | The Player's Next/Previous doesn't update the window `payload`, so session restore reopens the track it was launched with, not the one playing                                                         | D11                                      |

---

## 6. Decisions

Numbering is stable; other documents cite these by number.

1. **Mobile** — desktop-browser-first. Phones may get a read-mostly
   single-app layout later, if at all.
2. **The app list is closed.** "Fill the obvious holes, then stop" is done:
   markdown (D1, D9), PDF (D6), small utilities (D7) and the code editor
   (D4). A spreadsheet, a real image editor or an archive manager is a new
   decision, not an extension of this one, as is depth that crosses §6.9's
   line. New kinds of app should arrive through the SDK. `DIRECTION.md` §6's
   "coherence over sprawl" breaks ties.
3. **License — open, blocks step 17.** The repository is public with no
   LICENSE, which means all rights reserved. MIT is the default
   recommendation; Apache-2.0 if an explicit patent grant matters. This one
   is the owner's call.
4. **Web target** — the website stays the permanent baseline
   (`DIRECTION.md` §9.1).
5. **Customization vs. the palette** — users may pick a custom accent and
   wallpaper image. The accent picker validates contrast and warns below
   WCAG AA, and the window-control duotone is always derived from the one
   accent, so a traffic-light triad stays impossible. Presets remain the
   recommended path.
6. **The CSP opens for the sandbox, and only for it** — `frame-src` for the
   sandboxed-app host. Every other directive stays as-is.
7. **Third-party apps are a committed goal** — part of §2, hence step 17 and
   decision 6.
8. **A closed-vocabulary renderer doesn't need the sandbox** (2026-07-27,
   re-checked 2026-08-03 on shipping D9). The sandbox is for renderers that
   can interpret arbitrary content. Notes' editor can't:

   - The schema in `src/apps/notes/editorSchema.ts` is assembled one
     extension at a time, never from `StarterKit` (which brings Link, Image,
     CodeBlock and Blockquote). Nodes: doc, paragraph, text, hardBreak,
     heading 1–3, bullet, ordered and task lists. Marks: bold, italic,
     underline.
   - A ProseMirror document holds only node types its schema declares, so
     hostile paste is dropped while parsing rather than filtered afterwards.
     `editorSchema.test.ts` asserts the exact node and mark sets, that
     nothing carries `href` or `src`, and that `<script>`, `<img onerror>`,
     a `javascript:` link and an `<iframe>` keep only their text.
   - `@tiptap/markdown` was rejected because it depends on `marked`, a full
     CommonMark-to-HTML parser. `markdownDocument.ts` speaks only the
     grammar above; anything else stays literal text.
   - Nothing renders through `dangerouslySetInnerHTML`.

   This doubles as the renderer audit G1 owed. Adding a node changes the
   argument and needs a PR that revisits it. **D10 is the next such PR.** Its
   case is that a link holding only a VFS node id, resolved by the shell,
   reaches no network and runs nothing. An image or embed node would not
   pass the same test.

9. **The code editor ships outside the sandbox** (2026-08-04). Together with
   D6 going inside, this sets where the line is:

   - **It executes nothing.** CodeMirror tokenizes text into styled spans.
     No path leads from a file's bytes to execution, markup or a URL, the
     same structural property decision 8 rests on.
   - **It would cost the design.** A `srcdoc` frame inherits no custom
     properties and paints opaque, and an editor is mostly chrome.
   - At the time, the bridge also had no `fs.write`. D8.1 added one, but the
     two reasons above stand on their own, so that doesn't reopen this.

   **What would reverse it:** any editor feature that fetches, embeds or
   evaluates what it edits, such as a live preview, a language server, a
   plugin format or an embedded runtime. Each of those is the pdf.js case
   and belongs in a PR that revisits this entry.

**Design guardrails for every step:** monochrome-at-rest window controls
with the derived duotone focus tint, rounded-square dock tiles without
magnification, Inter and JetBrains Mono, generic app names, no Apple or
Puter naming or assets. `docs/design-system.md` has the values.

---

## 7. Risk register

Reviewed at the start of each step.

| #   | Risk                                                                                                                                                                                                                  | Likelihood | Impact | Mitigation                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **The browser evicts local data.** Safari evicts IndexedDB for non-installed sites after ~7 days of disuse, and there is no other copy                                                                                | Medium     | High   | Persistent storage is requested; export exists. Step 18 makes backups complete (B13), visible (B14) and, on Chromium, automatic (B18) |
| R4  | **Steps slip.** One person, and step 17 is still the largest remaining step                                                                                                                                           | High       | Medium | Every step ends shippable; scope moves to the next step rather than quality dropping                                                  |
| R5  | **Customization breaks the design**                                                                                                                                                                                   | Low        | Medium | The contrast validator and derived duotone (§6.5); presets stay the default                                                           |
| R6  | **Drift toward macOS trade dress** as features approach OS parity                                                                                                                                                     | Medium     | Medium | The guardrails in §6 and `docs/design-system.md`'s drift register                                                                     |
| R7  | **Sandbox escape or injected content.** Step 17 adds four bridge methods and a picker, each a new path from untrusted code to the shell                                                                               | Medium     | High   | Every method gets a refusal test when ungranted; capability checks stay in the shell, never the frame; D10 revisits §6.8 explicitly   |
| R8  | **Flaky tests get ignored.** CI's `retries: 2` hides intermittent failures                                                                                                                                            | Medium     | Medium | `e2e/window-resize.spec.ts`'s near-edge test under WebKit was the known case; confirm or fix it before step 18 adds backup specs      |
| R9  | **Native distribution burden** — signing, notarization, per-OS builds and auto-update cost what the web build gives for free                                                                                          | —          | —      | Deferred with N5                                                                                                                      |
| R10 | **Dual-target rot** — `if (native)` checks scattered through components                                                                                                                                               | Low        | Medium | Every check goes through `isTauri()` (`system/platform.ts`)                                                                           |
| R11 | **Chromium-only features split the experience.** B18, F5 and F7 exist on one engine                                                                                                                                   | Medium     | Low    | Each ships with a working fallback on the others (B14, Download); docs never promise them on Firefox or Safari                        |
| R12 | **The demo shares storage with sibling sites.** IndexedDB and `localStorage` are scoped to `kooki1000.github.io`, not the `/kagami-os/` path, so any other project site under the account can read and overwrite them | Low        | Medium | Don't publish other Pages sites under the account without checking this; a custom domain (with `VITE_BASE=/`) removes it              |

R2 (area U unbounded) and R3 (dependency policy) are closed: U shipped, and
CodeMirror and pdf.js both installed under the release-age policy.

---

## 8. Success metrics

Checked at the end of each step. With no telemetry, every number comes from
CI, a scripted check or a manual pass. Standing expectations for every step:
CI wall time doesn't regress noticeably, no new flaky spec, axe-core stays
clean, no new lint or type suppressions.

**Step 17**

- An app built outside the repository from `docs/app-sdk.md` alone
  installs, runs, opens a file handed to it, and uninstalls leaving nothing
  in the VFS, the registry or `appGrantsStore`.
- Revoking a capability takes effect in an open window.
- Every new bridge method has a test that it is refused when ungranted.

**Step 18**

- Export on profile A, import on a fresh profile B: the look, dock, desktop
  layout and app grants match, asserted in e2e.
- A version-1 export zip still imports.
- An import-into-folder leaves every existing node untouched.

**Step 19**

- Unit tests for the history list's cap and its GC interaction (no version
  blob is collected while referenced).
- Move, rename and paste each undo correctly in e2e.

**Step 20**

- Content search over a 1,000-note fixture returns in under 50 ms once the
  index is built.
- The decision-8 tests still pass with the link node added, and no node
  carries `href` or `src`.

**Step 21**

- Chromium e2e for paste-to-file and the launch queue; the other engines
  still pass with the features absent.

---

## 9. Testing and release

### Test layers

1. **Unit (Vitest, `node` environment).** Pure logic next to its code. New
   store or engine code lands with tests in the same PR.
2. **E2E (Playwright).** One user-visible seam per spec in `e2e/`, run on
   Chromium, Firefox and WebKit against a production preview. Happy paths,
   data-loss paths, and a regression spec for each shipped bug. Conventions
   are in `ARCHITECTURE.md` under Testing.
3. **Sandbox negative tests.** Every bridge capability is tested for refusal
   when ungranted, and every ambient capability (storage, cookies, network,
   top-level navigation) for being unreachable from a frame. These are exit
   criteria, not coverage.
4. **Manual pass before a release.** Fresh profile; upgrade in place from
   the previous release; Safari private mode; reduced motion; 200% zoom; a
   deliberately bad custom accent.

### Release mechanics

- **Versions.** Steps release as minors; 1.0 when §2 is met, at step 21's
  exit. Tags can start before distribution does.
- **Deploys.** Every push to `main` deploys the web demo, so `main` is what
  visitors run. A change that only makes sense with a later one stays behind
  a flag until that one lands.
- **Flags.** `src/system/flags.ts`; the SDK ships dark behind
  `third_party_apps` until step 17's exit.
- **Branches.** Trunk-based, short-lived `<type>/<slug>` branches, `main`
  always releasable.
- **Migrations.** Any IndexedDB or persisted-store version bump comes with a
  `migrate` and an upgrade-in-place fixture.

---

## 10. Immediate next steps

1. **Pick a license** (§6.3). It needs the owner's decision, and step 17
   can't finish without it.
2. **D8.10, then D8.12.** Both are unblocked. D8.9 (publishing the SDK) waits on the license in item 1.
3. **B14 and C5 between D8 PRs.** Each is about half a day, and together
   they close most of R1's visibility gap.
4. **Confirm R8's WebKit case.** Run `e2e/window-resize.spec.ts` under
   WebKit in a loop; fix it or record why it's flaky before more specs pile
   onto CI's retries.
