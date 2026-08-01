# Kagami OS — Feature Backlog & Roadmap

**Status:** direction reset · July 2026
**Baseline:** phases 1–12 complete, native N-1/N-2 shipped (see
`ARCHITECTURE.md` § Phase status)

This document defines what "finished" means for Kagami, enumerates every
feature gap between that target and today's codebase, and sequences the work
into steps with acceptance criteria. Feature items carry stable IDs (`B4`,
`U2`, …) so steps, issues, and commits can reference them.

> **Reset, July 2026.** This roadmap previously planned an _online_ desktop:
> accounts, a backend service, cross-device sync, share links. That target is
> retired — Kagami is **local-first, with no server, ever** (§2). Areas **A**
> and **E** and the old Phases 13–14 survive only in §3.X, as a record of
> what was dropped and why.
>
> What remains is ordered by three commitments: the product gets **finished
> before it gets distributed**; finished means **rock-solid**, **deep**, and
> **extensible**; multi-device sync sits below that line.
>
> The **native track** (Tauri shell, isolated filesystem, built-in browser —
> [`DIRECTION.md`](DIRECTION.md), area **N**) runs in parallel: N-1 and N-2
> shipped, N-3 deferred with everything else distribution-shaped.

**Sizing legend:** `S` ≈ half a day · `M` ≈ 1–3 days · `L` ≈ 1–2 weeks ·
`XL` ≈ multi-week, needs its own design doc.

**Contents**

1. [Where the project stands today](#1-where-the-project-stands-today)
2. [Definition of "finished"](#2-definition-of-finished)
3. [Feature backlog by area](#3-feature-backlog-by-area) (B files · C shell · D apps · F platform · G security · H quality · U depth & customization · N native · X retired)
4. [Roadmap](#4-roadmap) — steps 13–17 with exit criteria
5. [Technical debt register](#5-technical-debt-register)
6. [Open decisions](#6-open-decisions-need-sign-off-before-the-affected-step)
7. [Risk register](#7-risk-register)
8. [Success metrics per step](#8-success-metrics-per-step)
9. [Testing & release strategy](#9-testing--release-strategy)
10. [Immediate next steps](#10-immediate-next-steps)

- [Appendix A — Design sketches for the XL items](#appendix-a--design-sketches-for-the-xl-items)
- [Appendix B — Phase 9 work breakdown](#appendix-b--phase-9-work-breakdown-shipped) (shipped, kept as a worked example)

---

## 1. Where the project stands today

Everything below already works and is the foundation the rest of this
roadmap builds on:

- **Shell** — menu bar (system + per-app manifest menus), dock (pin/run
  indicators, size/position settings), wallpaper, light/dark/auto theme,
  three curated "looks" (Lagoon/Ember/Slate) over five procedural wallpaper
  designs, chrome translucency, toasts +
  notification center, global ⌘-shortcuts, ⌘K search, app/window switchers,
  desktop icons, session restore.
- **Window manager** — open/close/focus (monotonic z-index), drag, 8-way
  resize, minimize (with fly-to-dock animation), maximize, edge and quarter
  snap, keyboard window ops, restore-rect peeling, viewport clamping. Pure
  Zustand store, unit-tested.
- **Virtual file system** — `FsNode` tree in Zustand, write-through
  persistence behind the `StorageAdapter` seam, a content-addressed
  `BlobStore` for binaries, seeded first run, Trash with restore/empty
  semantics, name dedupe, system-folder protection.
- **Apps** — Files (grid/list, breadcrumbs, history, filter, rename, DnD,
  multi-select, clipboard, keyboard nav, upload/download, Get Info,
  open-with), Notes, Viewer, Media Player, Terminal (pure shell engine over
  the VFS), Settings, Welcome, Browser (native build only).
- **Platform** — installable PWA with an offline service worker; a Tauri
  native shell with disk-backed adapters under `$APPDATA/disk`.
- **Quality** — 31 Vitest unit suites and 37 Playwright specs across
  Chromium/Firefox/WebKit in CI; strict ESLint; type-checked builds; strict
  CSP; an accessibility pass with axe-core coverage.

**The honest gap.** The _shell_ is mature; the _apps inside it_ are mostly
first passes. Notes is a bare `<textarea>` over a flat list of every text
file on the drive. The Player wraps native `<audio controls>` — a visible
break in the design language — and does not advance to the next track when
one ends. Closing that gap is area **U** (§3) and step 15 (§4), and it is
the difference between a convincing demo and a desktop somebody uses.

Three architectural **seams were built deliberately** and should absorb most
of the work below without rewrites:

1. `StorageAdapter` / `BlobStore` (`src/system/fs/types.ts`) — the only
   interfaces the fs store persists through. Built for a server backend that
   is no longer coming; they already carry the IndexedDB and native-disk
   implementations, and would carry BYO-storage sync (§3.X.2) unchanged.
2. The **app manifest pattern** (`src/system/apps/`) — apps are data
   (manifest + lazy component); the shell renders them generically. New
   apps, and eventually third-party apps, plug in here.
3. `OsWindow.screenId` — reserved for multi-monitor; currently always
   `'main'`.

---

## 2. Definition of "finished"

The target product, stated as user-visible capabilities:

1. **It's yours, and it stays yours.** No account, no server, no telemetry.
   Files live on your machine and never leave it unless you export them.
2. **Nothing breaks.** No stuck state, no unreachable menu, no silent write
   failure, and no path where a refresh, a crash, or a full disk loses
   data. Your whole disk round-trips through a zip file you keep.
3. **Real files.** Upload anything from the host OS, download anything back
   out, preview common formats, and manage files with the ergonomics of a
   native file manager (multi-select, clipboard, keyboard).
4. **Apps you'd actually use.** Every built-in app is finished, not a first
   pass — and every file type the VFS can hold has an app that opens it
   properly.
5. **It feels like yours.** Wallpaper, accent, density, dock, desktop, and
   default apps are all under the user's control, within a design system
   that keeps the result readable (§6 guardrails).
6. **A real app platform.** A documented, capability-scoped way to add apps
   without touching the shell — and without trusting them.
7. **Runs everywhere.** The same desktop is available as a website and as a
   native desktop app that adds what the browser sandbox can't. See
   [`DIRECTION.md`](DIRECTION.md) §3.

Where each lands in §3: statements 1–2 in areas B, G, and H; 3 in B; 4 in D
and U; 5 in U; 6 in G (the sandbox) and D8 (the SDK); 7 in N.

**Deliberately not in this definition:** multi-device sync and sharing.
Both were the centre of the previous roadmap; both are now below the line
(§3.X). A user who wants their desktop on two machines exports a zip today,
and may get bring-your-own-storage sync later — see §3.X.2.

---

## 3. Feature backlog by area

### A. Accounts & backend service — **retired**

Kagami will not run a server. Accounts, a remote `StorageAdapter`, a sync
engine, conflict policy, quotas, and device management are all dropped. The
scope and the reasoning are preserved in §3.X.1 rather than deleted.

### B. File system & Files app maturity

| ID  | Feature                                                                                                                                                                                                        | Size | Notes                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **Binary content architecture** — store file bytes as `Blob`s in a separate IDB object store (and S3-compatible storage server-side), keyed by content hash; `FsNode.content` becomes a reference for binaries | L    | Prerequisite for real uploads; today images live as data-URL strings inside the node record, which bloats `loadAll` and the sync payload |
| B2  | **Upload from host OS** — drag files/folders from the OS onto Files or the desktop; toolbar "Upload…" fallback (`<input type=file webkitdirectory>`)                                                           | M    | Needs B1; progress toasts via the existing notification store                                                                            |
| B3  | **Download to host OS** — "Download" on any file; folders download as a zip built client-side                                                                                                                  | M    | Zip via a Web Worker to keep the shell responsive                                                                                        |
| B4  | **Multi-select** — click+⌘/⇧ ranges, marquee selection in grid view, bulk move/trash/download                                                                                                                  | L    | Touches `selectedId → selectedIds` throughout FilesApp/FilesView; context menus grow bulk variants                                       |
| B5  | **Clipboard** — Copy/Cut/Paste for nodes (⌘C/⌘X/⌘V), including copy-as-duplicate ("name 2") within a folder                                                                                                    | M    | An in-memory clipboard store; menu items come from the Files manifest                                                                    |
| B6  | **Keyboard navigation** — arrow keys, Enter to open, ⌫ to trash, F2/Enter-to-rename, type-ahead selection                                                                                                      | M    | Files-only first; establishes the roving-focus pattern other apps reuse (H1)                                                             |
| B7  | **Desktop icons** — render the `Desktop` folder's children on the wallpaper, draggable with persisted positions, same context menus as Files                                                                   | L    | The Desktop component is currently wallpaper-only; icon positions need a small per-folder layout record                                  |
| B8  | **File metadata & properties** — size accounting (bytes, folder rollups), "Get Info" panel, kind registry expansion                                                                                            | M    | `FsNode` gains `size`; computed lazily for folders                                                                                       |
| B9  | **Search** — global name search (menu-bar magnifier is currently decorative), scoped search in Files; content search later, post-B1                                                                            | M/L  | Start with an in-memory index over `nodes`; ship the ⌘K/spotlight overlay in the shell                                                   |
| B10 | **Sort controls** — by name/date/kind/size, per-folder, persisted                                                                                                                                              | S    | `childrenOf` already centralizes ordering                                                                                                |
| B11 | **Open-with menu & file associations UI** — right-click "Open With ▸", user-editable default app per mime type                                                                                                 | M    | Generalizes the hardcoded table in `openFile.ts` into a settings-backed registry                                                         |
| B12 | **Trash policies** — item count/age badge, optional auto-empty after 30 days                                                                                                                                   | S    |                                                                                                                                          |

### C. Shell & window-manager completeness

| ID  | Feature                                                                                                                                                                       | Size | Notes                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| C1  | **Session restore** — persist window layout (app, rect, mode, z-order, minimized) and reopen it on boot; apps opt in to restoring payloads (e.g. Notes reopens the same note) | M    | ✅ shipped in Phase 11, persisted to localStorage. U9 adds the user-facing switch to turn it off                  |
| C2  | **App/window switcher** — ⌘Tab cycling with an overlay, ⌘\` between windows of one app                                                                                        | M    | Window store already has all the data; needs a capture-phase key handler coexisting with `shortcuts.ts`           |
| C3  | **Window overview** ("mission control") — zoomed-out grid of open windows, click to focus                                                                                     | L    | Pure CSS transforms over `WindowLayer`; good demo feature, not load-bearing                                       |
| C4  | **Quarter snapping & keyboard window ops** — corner snap zones; ⌃⌥-arrows to snap/maximize/restore                                                                            | M    | Extends `SnapSide` to a `SnapZone` union; store logic is unit-testable like the existing snap tests               |
| C5  | **Menu-bar status tray** — storage-usage meter, battery/network where the Web APIs allow; user-configurable via U7                                                            | S/M  | The offline indicator shipped in Phase 12; the storage meter matters more now that R1 has no server-side backstop |
| C6  | **Focus-follows-app polish** — clicking a dock tile of a running app with all windows minimized restores _all_; app-level "hide" (⌘H)                                         | S    |                                                                                                                   |
| C7  | **Multi-monitor** — populate `screenId` via the Window Management API where available; per-screen maximize/snap bounds                                                        | XL   | Explicitly deferred; the seam exists so nothing else blocks on it                                                 |
| C8  | ~~**Lock screen / fast user switch**~~ — **retired** with accounts; there is no session to lock                                                                               | —    | See §3.X.1                                                                                                        |

### D. App suite

| ID  | Feature                                                                                                                                                                                                                                   | Size     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | ~~**Notes: Markdown preview & formatting**~~ — ✅ shipped (step 15, 2026-07-27): toggleable rendered preview, toolbar (bold/italic/underline/heading/bullet+numbered lists), read-only task-list checkboxes; stays plain-markdown on disk | L        | Shipped **outside** the sandbox, ahead of the original 16b sequencing — safe by construction, see §6 decision 8. Any extension toward full CommonMark, links, images, or raw-HTML passthrough must go through G2 instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D9  | **Notes: inline (WYSIWYG) formatting** — replace the Preview toggle with format-as-you-type editing: press Bold and the selection renders bold immediately, with no visible `**`/`#` markers at any point                                 | M        | Hand-rolled `contenteditable` isn't a reasonable bar for reliability (cursor placement, undo/redo, paste, cross-browser quirks) — this needs a real editor engine. Candidates surveyed 2026-07-27: **Milkdown** (markdown is the source of truth by design, ProseMirror-based) or **Tiptap** + its first-party `@tiptap/markdown` extension (bidirectional, MarkedJS-based, larger ecosystem/plugin catalog). Either keeps notes as plain-markdown `.md` files on disk — no storage-format migration, Files/search/templates untouched. Stays outside the sandbox only if the editor schema stays closed to raw HTML, by the same reasoning as decision 8 — re-check that before shipping |
| D2  | **Viewer: pan + gestures + slideshow** — drag-to-pan when zoomed, pinch/trackpad zoom, arrow-key prev/next within the folder, basic EXIF panel                                                                                            | M        | Prev/next reuses `childrenOf` on the file's parent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D3  | **Terminal: engine v2** — `cp`, `mv`, `head/tail`, `grep`, `open` (launches the associated app), `>>` append, pipes between builtins, tab completion, `..`-aware path arguments for `mkdir`/`touch`                                       | L        | Keep the engine pure and unit-tested; completion needs a small readline layer in `TerminalApp`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D4  | **Code/text editor app** — syntax highlighting, multi-tab, association for `.json/.ts/.css/…`                                                                                                                                             | L        | Evaluate CodeMirror 6 vs. a lighter highlighter under the `minimumReleaseAge` install policy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D5  | **Media player app** — audio/video playback for uploaded files (post-B1), playlist from a folder                                                                                                                                          | M        | `<audio>/<video>` over Blob URLs; add mime associations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D6  | ~~**PDF viewing**~~ — ✅ shipped (step 16b, 2026-08-01): renders inside the capability sandbox (16a) via `pdfjs-dist`, page navigation + zoom, as a new standalone "Documents" app rather than folded into Viewer                         | M        | The sandbox's first real (non-demo) consumer — see `src/apps/documents/`, notably `sandboxEntry.ts`'s comments on why PDF parsing runs on the frame's own main thread rather than a background Worker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D7  | **Small utilities** — Calculator, Clock/timer, Paint-style canvas                                                                                                                                                                         | S–M each | Cheap wins that exercise the manifest pattern; good first-contribution targets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D8  | **Third-party app SDK** — apps as sandboxed iframes with a postMessage bridge exposing a _capability-scoped_ API (fs scopes, windowing, notifications); manifest install/uninstall UI                                                     | XL       | The long-term platform play; requires G2's sandbox model first. Everything before it should keep the manifest pattern clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### E. Sharing & collaboration — **retired**

Share links, a public viewer page, "shared with me", and real-time
co-presence all need a server to host and serve the shared bytes. Dropped
alongside area A; see §3.X.1.

### F. Platform: PWA, offline, mobile

| ID  | Feature                                                                                                                                                                                                               | Size | Notes                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------- |
| F1  | **PWA** — manifest, icons, service worker precaching the app shell, installability                                                                                                                                    | M    | Vite PWA plugin, subject to dependency policy                                                        |
| F2  | **Offline-first behavior** — boot fully offline from the cached shell + local data; visible offline indicator                                                                                                         | M    | ✅ shipped in Phase 12. With no server, "offline" is now the normal case rather than a degraded mode |
| F3  | **Touch & small screens** — touch drag for windows/files already partially works via pointer events; needs bigger hit targets, a phone layout decision (full windowing is desktop-only; phones get a single-app view) | L    | Explicitly de-scoped from v1.0 unless priorities change                                              |
| F4  | **Browser support matrix** — define and CI-test Chromium/Firefox/Safari; Safari IDB and pointer-capture quirks are the known risks                                                                                    | S    |                                                                                                      |

### G. Security, privacy, trust

| ID  | Feature                                                                                                                                                                                                                  | Size | Notes                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Security baseline** — strict CSP, no `dangerouslySetInnerHTML` anywhere (audit D1's markdown renderer), dependency audit in CI                                                                                         | M    | ✅ largely shipped in Phase 9. D1's shipped renderer never calls `dangerouslySetInnerHTML` and has no generic-HTML code path (§6 decision 8), so it needed no separate audit. A renderer audit is still owed if D1's scope grows (D9, or full CommonMark) — inherited by step 16b |
| G2  | **App sandboxing model** — iframe + capability bridge design (prerequisite for D8); even first-party "risky" renderers (PDF, or a markdown renderer that isn't closed-vocabulary like D1's) should render in the sandbox | L    |                                                                                                                                                                                                                                                                                   |
| G3  | ~~**Encryption**~~ — **retired.** With no server and no network, there is nothing in transit and no remote copy to encrypt                                                                                               | —    | If X.2 (BYO sync) is ever picked up, encrypting what lands in the user's chosen storage becomes a live question again                                                                                                                                                             |
| G4  | **Privacy posture** — no third-party trackers; opt-in only, anonymized telemetry (H4); data export (full account → zip) and account deletion                                                                             | M    | Data export doubles as the backup story                                                                                                                                                                                                                                           |

### H. Quality: accessibility, i18n, performance, testing

| ID  | Feature                                                                                                                                                                                                                                          | Size | Notes                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------ |
| H1  | **Accessibility pass** — real menu/menuitem ARIA roles + arrow-key traversal in MenuBar/ContextMenu, focus trap per window, visible focus rings, `prefers-reduced-motion` variants for the minimize/toast animations, screen-reader labels audit | L    | The biggest gap in current UI code; do before the surface area doubles                                             |
| H2  | **i18n scaffolding** — extract strings, locale-aware `Intl` date/number formatting (`format.ts` and `Clock` hardcode `en-US`), RTL smoke test                                                                                                    | M    | Scaffold early even if English-only ships                                                                          |
| H3  | **Performance** — virtualize Files list/grid and Notes sidebar for 10k+ nodes; index `childrenOf` (currently O(n) scans of all nodes per render — fine now, not at scale); Lighthouse budget in CI                                               | M    | Measure first: seed a 10k-node fixture and profile                                                                 |
| H4  | **Observability** — error boundary per window (one crashing app must not take down the shell), client error reporting, opt-in usage telemetry                                                                                                    | M    | Error boundaries are S and should happen immediately                                                               |
| H5  | **E2E test rig** — Playwright suite covering: boot, open/move/snap/close windows, Files trash/restore round-trip, Notes edit persistence across reload, Terminal session, theme switching                                                        | L    | ✅ shipped in Phase 9 and grown since — 37 specs across three engines. What makes steps 14–15 safe to move fast in |
| H6  | **CI/CD** — lint + typecheck + unit + E2E on every PR; preview deploys; versioned releases with changelog; fix the `engines` field vs. dev-Node mismatch (`package.json` pins 22.23.1; local dev uses 24)                                        | M    | First infrastructure item to do — everything else lands safer with it                                              |

### U. App depth & customization _(the "not a demo" area)_

The gap described in §1, itemized. Every entry is client-side, needs no new
architecture, and is independently shippable — which also makes this the
best area to hand to a contributor.

#### U-a. Customization surface

| ID  | Feature                                                                                                                                                                                                                       | Size | Notes                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | **Custom wallpaper** — set any image in the VFS as the wallpaper; fit modes (fill/fit/centre/tile); separate light and dark choices; presets stay                                                                             | M    | Upload and the `BlobStore` already exist, and the wallpaper is only CSS vars set inline on `<html>` (`system/settings/palettes.ts`). The new part is a blob URL whose lifetime outlives the Files window that picked it                                       |
| U2  | **Custom accent, contrast-validated** — a colour picker beside the presets, with derived `accent2` and derived window-control duotone, and a validator that warns when accent-on-surface or ink-on-accent falls below WCAG AA | M    | Guardrail change, signed off in §6.5. The control triad must stay **derived**: users pick one accent, never three control colours, so "never a traffic-light triad" survives contact with customization                                                       |
| U3  | **Curated looks over procedural wallpapers** — one "look" bundles accent, control duotone and wallpaper design; five procedural designs replace the single recolored gradient; chrome translucency (`materialLevel`)          | M    | Shipped. Wallpaper artwork became data (`wallpaperStyles.ts`) and the wallpaper tone now derives from the accent, so U2's custom color can't clash with the desktop. Retired Iris/Meadow; `settingsStore` v1→v2 migrates. Presets remain the recommended path |
| U4  | **Interface density & text size** — a `--ui-scale` token driving the shell's currently hardcoded px sizes; small/default/large                                                                                                | M    | Also the single biggest remaining accessibility win. One mechanical pass over a lot of Tailwind classes — do it in one PR, not incrementally                                                                                                                  |
| U5  | **Default apps pane** — list, change, and reset the per-mime overrides that `settingsStore.fileAssociations` already stores                                                                                                   | S    | The store field exists with no UI whatsoever: today an override can be set from "Open With" and then never inspected or undone                                                                                                                                |
| U6  | **Motion & window feel** — an explicit reduce-motion switch (not only the OS media query), animation speed, wallpaper dimming behind windows                                                                                  | S    |                                                                                                                                                                                                                                                               |
| U7  | **Menu bar & clock** — 12/24-hour, seconds, date visibility, which status items appear                                                                                                                                        | S    | `lib/format.ts` and `Clock` already centralize the formatting                                                                                                                                                                                                 |
| U8  | **Desktop preferences** — icon size, grid snap, auto-arrange, sort order                                                                                                                                                      | S    | Rides on the existing desktop-icon layout record                                                                                                                                                                                                              |
| U9  | **Startup behaviour** — session restore on/off, apps opened at boot, default window size per app                                                                                                                              | S    | Session restore (C1) currently has no user-facing control at all                                                                                                                                                                                              |
| U10 | **Shortcut reference** — a Settings pane listing every chord                                                                                                                                                                  | S    | `system/shortcuts.ts` already builds the chord strings the menus display; this is a read-only view over the same data. Rebinding is a separate, larger item                                                                                                   |

#### U-b. Per-app depth

Sized against "would a user call this finished?", not against effort.

| ID  | App                         | What finishing it means                                                                                                                                                                                                                                                                                                                                                                                                          | Size |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| U11 | **Notes**                   | Sidebar search/filter, folder scoping (it currently lists _every_ text file on the drive in one flat list), sort options, pinning; editor find-and-replace, word and character count, adjustable font and size, soft-wrap and focus modes; new-note-in-this-folder and templates; Duplicate and Reveal in Files in the context menu; and **reading blob-backed text**, which the editor currently refuses as "too large to edit" | L    |
| U12 | **Media Player**            | Transport built in the design language instead of raw `<audio controls>`; **auto-advance at end of track** — the playlist exists but never advances on its own; shuffle and repeat; persisted volume; a scrub bar with elapsed/duration; space/←/→ keys; playback speed; artwork and metadata where the file carries it; and the window-reuse gap noted at `PlayerApp.tsx:14-18`                                                 | M    |
| U13 | **Viewer**                  | A filmstrip of folder siblings, the EXIF panel D2 left unbuilt, copy-image, **Set as wallpaper** (pairs with U1), and a fullscreen presentation mode                                                                                                                                                                                                                                                                             | M    |
| U14 | **Files**                   | Column/detail view with sortable headers, space-to-preview quick look, user-pinned favourites in the sidebar, tags or colour labels, a Recents place, an editable breadcrumb path                                                                                                                                                                                                                                                | L    |
| U15 | **Terminal**                | History persisted across sessions and searchable (⌃R), aliases, `find`, adjustable font size                                                                                                                                                                                                                                                                                                                                     | M    |
| U16 | **Welcome**                 | A real first-run tour rather than a static card — it is the first thing every new user sees, and right now it teaches them nothing                                                                                                                                                                                                                                                                                               | S    |
| U17 | **Browser** _(native only)_ | Bookmarks, find-in-page, page zoom, downloads landing in the VFS                                                                                                                                                                                                                                                                                                                                                                 | M    |

**Sequencing within U:** U1, U2, U5, U11, U12 first — they are the ones a
user notices in the first five minutes. U4 wants to land before the app
suite grows in step 16, for the same reason H1 (accessibility) was scheduled
before Phase 12: mechanical passes get more expensive with every new surface.

### N. Native desktop (Tauri) _(the "runs everywhere" track)_

Packaging Kagami as a native app while keeping the website as the baseline —
progressive enhancement, one codebase, two runtimes. Rationale, sequencing,
and guardrails are in [`DIRECTION.md`](DIRECTION.md); this table is the
backlog view.

| ID  | Feature                                                                                                                                                                                                                                                                                 | Size | Notes                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| N1  | **Tauri shell** — wrap the existing frontend in a Tauri v2 window; `src-tauri/` Rust crate; dev points at the Vite server, build at `dist/`; reconcile the meta-tag CSP with the webview                                                                                                | M    | No shell/app code changes; `pnpm tauri dev`/`build` alongside the unchanged `pnpm dev`/`build`                                             |
| N2  | **Platform detection** — `src/system/platform.ts` `isTauri()`; the single gate every native-only branch routes through (never scatter `if (native)`)                                                                                                                                    | S    | Runtime detection, not a build-time flag or opt-in setting                                                                                 |
| N3  | **Native filesystem backend** — `tauriAdapter.ts` (StorageAdapter) + `tauriBlobStore.ts` (BlobStore) writing under an app-owned hidden folder (`~/Library/Application Support/kagami-os/disk/` & platform equivalents); wired via the `isTauri()` switch at `fsStore.ts`/`blobStore.ts` | L    | The "isolated file system." Injectable root so both unit-test against a fake fs; degrades to in-memory like the IDB adapter if unavailable |
| N4  | **Built-in Browser app** — a generic "Browser" over a native child webview (tabs, address bar, history, back/forward); desktop-only, shows unavailable on web                                                                                                                           | L    | Desktop-only — see `DIRECTION.md` §3.2 for why this can't work on the web                                                                  |
| N5  | **Desktop build & release pipeline** — `tauri-action` in CI over `os: [ubuntu, macos, windows]`, code signing, notarization, auto-update; `tauri-driver` desktop e2e                                                                                                                    | XL   | Deferred until the local dev loop (N1–N3) works; `ci.yml` has no build/artifact job or OS matrix today                                     |

Native third-party apps are a separate go/no-go decision — see §6 item 7
and `DIRECTION.md` §5.3 — not part of this track.

**Dependency chain:** N1 → N2 → N3 → (N4, N5).

---

### X. Retired and parked — what this roadmap dropped, and why

Kept as a record so nobody re-derives the reasoning, and so a contributor
reading the git history understands why a large, carefully specified plan
stopped being followed.

#### X.1 The online track — retired _(former areas A and E, former Phases 13–14)_

A backend service, accounts, a remote adapter, an op-log sync engine,
conflict policy, quotas, device management, share links, a public viewer
page, "shared with me", and real-time co-presence.

**Why dropped.** All of it requires a server this project will not run. The
real cost was never the 9–12 weeks of code — it is Postgres, blob storage,
auth, rate limiting, abuse handling, and being on the hook, indefinitely and
for free, when a sync bug eats somebody's files. Local-first is a stronger
position for this project than an underfunded cloud.

**What was kept.** The seams. `StorageAdapter` and `BlobStore`
(`src/system/fs/types.ts`) were built so a remote backend could drop in
behind them; that same shape already serves the native filesystem adapter
(N3) and would serve X.2 unchanged. Appendices A.1 and A.3 stay in this
document as design sketches — unscheduled, not deleted.

#### X.2 Bring-your-own-storage sync — parked

The zero-cost version of "yours anywhere": the user supplies the backend — a
Dropbox or Drive folder on disk via the File System Access API, or a private
GitHub repository over a token — and Kagami syncs through it. No server, no
account, no operational burden.

Parked below the §2 line, with its scope recorded so picking it up later
isn't a fresh investigation:

- `fsStore.commit()` and `removeIds()` are the interception points.
  `removeMany` physically erases with **no tombstone**, so nothing can sync
  until nodes carry a version and deletes leave a marker behind.
- Scope it as a **snapshot merge**, not Appendix A.1's op log: one user, no
  realtime, no fan-out, no auth. Per-node version, tombstones, and
  "name (conflicted copy)" through the existing `uniqueChildName` — with the
  merge itself a pure function under property tests.
- The File System Access API is Chromium-only, so a second backend is needed
  as cross-browser proof. In the native build, the Tauri fs plugin makes
  folder sync straightforward on all three platforms.

#### X.3 Distribution — deferred by decision

A public deploy, tagged releases, a changelog, contributor onboarding, and
signed native installers (N5) all wait until §2's definition is met. The
product gets finished before it gets distributed.

One exception is worth taking immediately: **the repository is public and has
no LICENSE**, which legally means all rights reserved — nobody may fork it or
contribute to it. That is hygiene, not distribution.

## 4. Roadmap

Steps continue `ARCHITECTURE.md`'s phase numbering (1–12 shipped). The
ordering follows four rules: infrastructure that de-risks later work ships
first; the desktop reaches "excellent" before its surface area grows; every
step ends in a demoable, releasable state; and nothing distribution-shaped
starts until §2's definition is met.

Estimates assume one person working steadily. Treat them as sizing, not
commitments — §7 R4 covers what to do when one slips.

### Phases 9–12 — shipped

Foundations and guardrails (CI, error boundaries, feature flags, CSP); file
system maturity (blob store, upload/download, multi-select, clipboard,
keyboard nav, Media Player); desktop experience (desktop icons, session
restore, switchers, quarter snap, ⌘K search, Terminal engine v2,
accessibility pass); PWA and offline packaging. Details in `ARCHITECTURE.md`
§ Phase status. Appendix B keeps the Phase 9 task breakdown as a worked
example of the granularity these steps expand into.

The native track's N-1 (Tauri shell, `isTauri()`, disk-backed adapters) and
N-2 (built-in Browser) shipped in parallel.

### Step 13 — Realign the documents — ✅ _done (July 2026)_

Done first, because every other step is planned against these documents and
a stale plan misleads contributors and planning sessions alike.

This rewrite of `ROADMAP.md`; `DIRECTION.md` §1/§2/§5.3/§6/§7/§8/§9;
`ARCHITECTURE.md`'s adapter note and phase status; `README.md`'s summary;
and the no-server constraint recorded in `CLAUDE.md` so it doesn't get
re-proposed.

### Step 14 — Rock-solid _(≈ 2 weeks)_

The stated top priority: it has to stop feeling like a demo underneath.
"Rock-solid" is a gate, so this takes the _whole_ review backlog, not just
the five entries that document triages as "the ones a user actually hits".

**Scope:**

- **Re-triage `docs/review-backlog.md` first.** It is dated 2026-07-18 and
  has drifted: the Phase 11 accessibility pass closed §1, §2, §6, §8, and §9
  incidentally without updating the file. Verify all 18 against `main`, mark
  what's done, then close the remainder. The banner at the top of that file
  records what was already confirmed fixed.
- **The data-loss paths, all confirmed still open** — §12 persisted stores
  with no `version`/`migrate`; §16 IDB `open()` handling neither `onblocked`
  nor `versionchange`; §17 storage write failures that only reach the
  console. These are the entries that most justify calling step 14 a gate.
- **Full-disk export and import (G4, promoted).** With no account and sync
  parked, R1 — Safari evicting IndexedDB after ~7 days of disuse — has no
  backstop at all. This is a data-durability item now, not a privacy nicety.
  Export reuses `src/apps/files/download.ts` and `zipWorker.ts` almost
  wholesale; import is the new half.
- **Small debt cleared while the code is open** — T4, T5, and the §18
  smaller items.
- **Dependency feasibility spike — week 1, not week 4.** Step 16 assumes
  CodeMirror 6 (D4) and pdf.js (D6) install under `minimumReleaseAge: 10080`
  and `blockExoticSubdeps: true` — the policy that already blocked `idb`
  outright. If either is blocked, step 16 changes shape, and that is worth
  knowing before it starts rather than three weeks in. R3 exists to force
  exactly this.

**Exit:** every backlog entry closed or consciously reclassified; a seeded
disk round-trips through export → wipe → import byte-identically; no write
failure is silent; every fixed HIGH/MEDIUM has an E2E spec so it can't
regress.

### Step 15 — Depth & customization _(≈ 3 weeks)_

Area U: the apps stop being first passes and the desktop becomes the user's.
This is the step that changes how the project _feels_, and the one most
likely to be underestimated — each item looks small, and there are
seventeen of them.

**Scope:** U1–U10 (customization surface) and U11–U17 (per-app depth), in the
order §3.U recommends — U1, U2, U5, U11, U12 first, because those are what a
user meets in the first five minutes. U4 (density and text size) wants to
land before step 16 grows the surface area it has to sweep.

**Landed ahead of schedule:** Notes' markdown preview and formatting toolbar
(D1), originally planned to wait inside the sandbox (R7) until step 16,
shipped here instead — safe by construction, see §6 decision 8. D9 (inline
WYSIWYG editing) and any extension of D1 toward full CommonMark or raw HTML
still wait for the sandbox.

**Exit:** a user can set their own wallpaper and accent and the result stays
readable; Notes searches, finds, replaces, counts words, and opens a file of
any size; the Player plays a folder through to the end without being asked
track by track; no app in the suite reads as a first pass.

### Step 16 — The sandbox, then the apps that need it _(≈ 5 weeks)_

Two halves, in this order: building the second first and retrofitting it is
wasted work.

**16a — the capability sandbox (G2, ≈ 2 weeks).**
`<iframe sandbox="allow-scripts">` on a null origin; a promise-based
postMessage RPC where every call is checked against granted capabilities **in
the shell**, never in the frame; shell integration (window title, menu
declaration reusing the existing `MenuSection` shape, `appCommand` delivery,
dock badges) over that same bridge. The CSP opens for `frame-src` and nothing
else — a real change to the security posture, recorded in §6.6 and
`DIRECTION.md` §6 rather than slipped in quietly.

**16b — fill the remaining app holes (≈ 3 weeks).** D6 PDF viewing, inside
the sandbox so first-party apps harden the bridge before any third-party
code touches it — D1 Notes markdown preview shipped early in step 15
outside it (§6 decision 8) and no longer needs this step. D9 (Notes inline
WYSIWYG), if picked up, is re-evaluated against the sandbox requirement at
that time. **D6 shipped 2026-08-01** as a new standalone "Documents" app
(§3 area D) — see `src/apps/documents/`; `e2e/documents.spec.ts` covers the
step's hostile-PDF exit criterion below. Then D4 (code editor with syntax
highlighting and file associations) and D7 (Calculator, Clock, Paint), which
need no sandbox and re-exercise the manifest pattern that step 17 has to
carry.

**Exit:** a first-party app runs sandboxed, reads only its granted scope, and
is provably unable to reach storage, cookies, or the network; every file type
the VFS can hold opens in an app that handles it properly.

### Step 17 — The app SDK _(XL, ≈ 4–6 weeks)_

D8: generalize 16a's bridge from first-party to third-party. An app is a
static bundle plus a `manifest.json` (id, name, version, entry, icon,
`capabilities`, min-shell-version). Bundles live in the VFS under a hidden
`/Apps` folder, so they inherit persistence and backup for free. A first-run
consent screen lists requested capabilities, and grants stay revocable in
Settings.

This is what turns "the app list is a TypeScript array" into a platform, and
it is a decision as much as a feature — see §6.7.

**Exit:** an app written outside this repository, installed from a bundle,
appears in the dock, opens a window, reads only what it was granted, and
uninstalls cleanly.

### Below the line — distribution and sync

Deliberately unscheduled; revisit once steps 13–17 land. Detail in §3.X.2 and
§3.X.3. The one item worth taking out of order is a LICENSE file, which the
repository needs regardless of when distribution starts.

### Native desktop track (parallel — see `DIRECTION.md`)

Runs alongside the numbered steps, not inside them. Each milestone is
independently shippable.

- **N-1 — Native shell + isolated filesystem** — ✅ shipped. `pnpm tauri dev`
  boots the shell; N1 (Tauri v2 shell), N2 (`isTauri()`), and N3 (disk-backed
  `StorageAdapter`/`BlobStore` under `$APPDATA/disk`) are in `main`.
- **N-2 — Built-in Browser** — ✅ shipped. N4: a native child webview with
  tabs, address bar, history, and back/forward; the web build presents it as
  desktop-only.
- **N-3 — Distribution** — deferred with everything else distribution-shaped
  (§3.X.3). N5's signing and notarization cost money; unsigned CI builds do
  not, and are the cheap first move whenever this is revisited.

Third-party apps themselves are committed (§6.7), but they ship through the
same sandboxed-iframe bridge in both builds. Whether the native build ever
gets _extra_ third-party affordances — a child webview per app rather than
an iframe — stays out of scope; see `DIRECTION.md` §3.3.

### Dependency snapshot

```
docs realigned (13) ──► everything else planned honestly
review backlog (14) ──► depth work isn't built on broken foundations
U4 density (15) ──► before step 16 doubles the surface to sweep
G2 sandbox (16a) ──► D6 PDF · D8 SDK (17) — D1 shipped independently in 15; D9 revisits this gate only if it needs raw HTML
dep spike (14) ──► D4 editor · D6 PDF shape
export/import (14) ──► the only answer to R1 while sync is parked
StorageAdapter/BlobStore seam ◄── native adapter (shipped) · BYO sync (X.2)
§2 definition met ──► distribution (X.3)
```

---

## 5. Technical debt register

Known issues to schedule (none block daily use today). T0–T3 shipped in
Phase 9 and are dropped from this table.

| ID  | Debt                                                                                                                                                                                                                                                                     | Suggested step |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| T4  | `notificationStore.toastIds` can retain ids evicted from the 50-item history (harmless, filtered on render)                                                                                                                                                              | 14             |
| T5  | Terminal `parse()` redirect regex can match a `>` inside quotes (`echo "a > b"`)                                                                                                                                                                                         | 14             |
| T6  | `deleteForever` doesn't itself enforce trash-only; the guard lives at call sites — this becomes load-bearing the moment the fs API is exposed to third-party apps                                                                                                        | 17 (with D8)   |
| T7  | `childrenOf` was ~147 ms on a 10k-node folder. **Shared `Intl.Collator` landed** (Phase 10 kickoff): ~147 ms → ~9 ms, under frame budget. Remaining: memoize sorted children, virtualize the list, parent-id index. See [`docs/perf-baseline.md`](docs/perf-baseline.md) | 15 (with U14)  |
| T8  | The `idb` convenience library is blocked by the workspace `minimumReleaseAge` policy; the raw-IDB adapter is fine, but revisit if IDB code keeps growing                                                                                                                 | opportunistic  |
| T9  | [`docs/review-backlog.md`](docs/review-backlog.md) has drifted — five of its 18 entries were closed incidentally by the Phase 11 accessibility pass. Re-verify against `main`, then close the rest; step 14 does both                                                    | 14             |

---

## 6. Open decisions (need sign-off before the affected step)

Decisions 1–3 of the previous revision (backend stack, sync conflict policy,
E2EE stance) are retired with the online track — see §3.X.1.

1. **Mobile ambition** (F3): desktop-browser-first; phones get a read-mostly
   single-app layout later, if at all. Confirm before step 15 spends effort
   on responsive work it doesn't need.
2. **How far the app suite grows** (D-area): the current answer is "fill the
   obvious holes, then stop" — markdown preview (✅ shipped, step 15), PDF, a
   code editor, and a few small utilities (step 16b), plus Notes' inline
   WYSIWYG (D9) as a further refinement. A spreadsheet, a drawing app, or an
   archive manager would be a new decision, not an extension of this one.
   `DIRECTION.md` §6's "coherence over sprawl" is the tie-breaker.
3. **License** (blocks any contribution): the repository is public with no
   LICENSE file, which means all rights reserved. MIT is the default
   recommendation for a project optimizing for contributors and plugin-style
   extension; Apache-2.0 if an explicit patent grant is wanted.
4. **Web-target longevity** (native track): keep the website as the
   permanent baseline, or deprecate it once native is primary? **Current
   answer: keep the link** — see `DIRECTION.md` §9.1.
5. **✅ Decided (July 2026) — customization vs. the palette guardrail.**
   Users may set a **custom accent colour and a custom wallpaper image**, not
   only the documented directions. The guardrail is replaced, not removed:
   the accent picker **validates contrast** against the token system and
   warns when accent-on-surface or ink-on-accent falls below WCAG AA, and the
   window-control duotone stays **derived from the accent** — a user picks
   one colour, never three control colours, so "never a traffic-light triad"
   survives. Presets remain the designed, recommended path. Implements U1–U3.
6. **✅ Decided (July 2026) — the CSP opens for the sandbox.** Step 16a adds
   a `frame-src` directive for the sandboxed-app host and nothing else. This
   is the only planned loosening of the strict-CSP guardrail; it is a
   deliberate trade for G2/D8, and every other directive stays as-is.
7. **✅ Decided (July 2026) — third-party apps are a committed goal.**
   `DIRECTION.md` §9.2 framed Bet 3 as a "become a platform" go/no-go after
   the native bets shipped. It is now above the line: extensibility is part
   of §2's definition of finished, and step 17 is scheduled. The consequence
   is decision 6 above.
8. **✅ Decided (2026-07-27) — a closed-vocabulary markdown renderer doesn't
   need G2.** R7's sandbox requirement targets renderers that can interpret
   **arbitrary** HTML/content — a real risk for a general CommonMark-to-HTML
   pipeline. D1's shipped preview only recognizes a fixed set of constructs
   (bold/italic/underline/heading/bullet+numbered lists/read-only checklist)
   with no generic tag-parsing code path at all — even a literal
   `<script>`/`<img onerror>` in a note renders as inert text, never through
   `dangerouslySetInnerHTML`. That structural guarantee, not the sandbox, is
   what makes it safe pre-16a. The guardrail still applies in full to
   anything that gains a generic-HTML or arbitrary-markup code path — D6
   (PDF), D8 (third-party apps), and D9 (WYSIWYG) if its editor schema is
   ever opened past that same closed vocabulary.

**Design guardrails carried through all steps:** monochrome-at-rest window
controls with the duotone focus tint (never a traffic-light triad),
rounded-square dock tiles without magnification, Inter/JetBrains Mono,
generic app names, no Apple/Puter naming or assets — and, per decision 5,
curated palettes as the designed default with contrast-validated custom
values permitted alongside them.

---

## 7. Risk register

Ordered by (likelihood × impact). Review at the start of every step.
Retired with the online track: the old R5 (backend cost & abuse). The old R2
(sync engine complexity) now applies only to the parked X.2 work.

| #   | Risk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | L    | I    | Mitigation                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Browser evicts local data.** Safari caps IndexedDB for non-installed sites and evicts after ~7 days of disuse. With accounts retired, a user's only copy can simply vanish                                                                                                                                                                                                                                                                                                                                                                                                                | High | High | `navigator.storage.persist()` is called at boot and surfaced in Settings › About; the PWA install path raises the storage tier. The real mitigation is now **export/import (step 14)** — there is no server-side copy to fall back on, which is exactly why it was promoted out of G4 into the stability step |
| R2  | **Area U is unbounded.** "Make the apps good" has no natural stopping point, and seventeen items each look small                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | High | Med  | §3.U fixes the list and §6.2 fixes the stopping rule. Anything not in U1–U17 is a new decision, not a continuation. Ship per-app rather than per-feature so a slip leaves finished apps, not seventeen half-finished ones                                                                                     |
| R3  | ~~**Dependency policy blocks a needed library.**~~ **Resolved (2026-07-25):** `minimumReleaseAge: 10080` + `blockExoticSubdeps` already blocked `idb`; CodeMirror 6 (D4) and pdf.js (D6) were the next asks. Spiked in step 14 week 1 — `pnpm add codemirror @codemirror/lang-javascript @codemirror/state @codemirror/view` and `pnpm add pdfjs-dist` both resolved to their current `latest` dist-tag (`codemirror@6.0.2`, `pdfjs-dist@6.1.200`) with no `ERR_PNPM_NO_MATURE_MATCHING_VERSION`/exotic-subdep rejection, unlike `idb`. Neither is blocked; step 16b can proceed as planned | Med  | Med  | —                                                                                                                                                                                                                                                                                                             |
| R4  | **Step slip through underestimation.** Solo bandwidth; step 17 alone is 4–6 optimistic weeks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | High | Med  | Every step ends releasable, so slipping delays value but never strands broken work; cut scope (move items right) rather than skipping exit criteria; re-estimate at each step boundary                                                                                                                        |
| R5  | **Customization breaks the design.** §6.5 lets users pick arbitrary accents and wallpapers — the exact thing the old guardrail forbade                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Med  | Med  | Contrast validation is part of U2's definition of done, not a follow-up; the control duotone stays derived rather than user-set; presets stay the default and the recommended path; screenshot the extremes before merging                                                                                    |
| R6  | **Design drift toward macOS trade dress.** As features approach OS parity, each small decision pulls toward the familiar                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Med  | Med  | The guardrails block in §6 is binding; any new shell surface gets a design pass against the Lagoon prototype before merge                                                                                                                                                                                     |
| R7  | **Sandbox escape / injected content** once PDF (D6) or third-party apps (D8) render untrusted content. D1's shipped preview doesn't qualify — §6 decision 8 — but D9 (WYSIWYG) or any richer D1 extension must be re-evaluated against this risk before shipping outside the sandbox. **Promoted:** this is now on the critical path, not a post-1.0 concern                                                                                                                                                                                                                                | Med  | High | G2 (step 16a) is a hard prerequisite for D6/D8 and for any D1/D9 extension past the closed vocabulary that shipped 2026-07-27, enforced in the dependency graph; negative tests are the _point_ of 16a's exit criteria; the CSP opens for `frame-src` only, so a slip fails closed                            |
| R8  | **Test suite becomes flaky and gets ignored**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Med  | Med  | Flake budget in §9; quarantine-and-fix policy; E2E kept lean (happy paths + data-loss paths), breadth lives in unit tests                                                                                                                                                                                     |
| R9  | **Native distribution burden** (N track) — signing, notarization, per-OS builds, and auto-update are ongoing costs the web build gives for free (`DIRECTION.md` §9.4); the built-in Browser (N4) also enlarges the attack surface                                                                                                                                                                                                                                                                                                                                                           | Med  | Med  | Deferred entirely (§3.X.3); the website stays the shippable baseline so native slipping strands nobody; the strict CSP is kept in the native build too                                                                                                                                                        |
| R10 | **Dual-target rot** (N track) — scattered `if (native)` conditionals make the shared codebase two divergent apps in practice                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Med  | Med  | Route every native branch through one `isTauri()` gate, in one place (N2) — `DIRECTION.md` §4                                                                                                                                                                                                                 |

## 8. Success metrics per step

Checked at the end of each step, not aspirational-only. With telemetry
retired along with the server, every number below comes from CI, a
scripted check, or a manual QA pass — never from user data.

Metrics for the shipped phases 9–12 are kept in git history; the ones that
still matter (CI wall time, E2E flake rate, axe-core cleanliness, no new
lint/type suppressions) are standing expectations of every step below.

**Step 13 (documents)**

- Zero references to accounts, sync, or a backend as _planned_ work across
  `ROADMAP.md`, `DIRECTION.md`, `CLAUDE.md`, and `src/system/flags.ts`.

**Step 14 (rock-solid)**

- `docs/review-backlog.md` has no open entry left unresolved or unreclassified.
- Export → wipe storage → import reproduces the tree and every blob
  byte-identically (hash-checked in E2E, mirroring `e2e/download.spec.ts`).
- Fault injection: a rejected IDB write surfaces a user-visible error rather
  than a console line, in every store that writes.
- An old-schema localStorage fixture upgrades cleanly through `migrate`.

**Step 15 (depth & customization)**

- A custom accent and a custom wallpaper can be set, and the resulting UI
  passes the same axe-core contrast checks the presets do.
- Notes opens a 5 MB text file, finds and replaces inside it, and reports an
  accurate word count.
- The Player plays a 10-track folder start to finish untouched.
- Nothing in the suite still uses browser-default form or media controls.
- Frame time p95 < 16 ms in a 10,000-node folder after U14's view work.
- Notes' markdown preview renders a hostile fixture (`<script>`, `<img
onerror>`) as inert text, unit-tested, confirming D1 shipped safely outside
  the sandbox (§6 decision 8).

**Step 16 (sandbox + remaining apps)**

- A sandboxed frame cannot reach `localStorage`, cookies, IndexedDB, or the
  network — asserted by negative tests, not by inspection.
- A capability the manifest didn't request is refused by the shell, and the
  refusal is logged rather than silent.
- A deliberately hostile PDF fixture renders without script execution and
  without a CSP violation (D1's markdown fixture equivalent already covers
  step 15's shipped preview; D9, if it opens the editor schema to raw HTML,
  repeats this check before shipping). **✅ Verified 2026-08-01** —
  `e2e/fixtures/hostile.pdf` carries an `/OpenAction` JavaScript entry;
  `e2e/documents.spec.ts` confirms no dialog fires and the console stays
  clean, since `getDocument()` never wires pdf.js's scripting API.

**Step 17 (app SDK)**

- An app built outside this repository installs from a bundle, runs,
  and uninstalls leaving nothing in the VFS or the registry.
- Revoking a capability in Settings takes effect on the running app.

## 9. Testing & release strategy

### Test pyramid

1. **Unit (exists, keep growing)** — Vitest over pure logic: window store,
   fs store, shell engine, and every new pure module (zip import/export,
   contrast validation, capability checks, blob refcounting, path/keyboard
   helpers). Rule: new store or engine code lands with unit tests in the
   same PR.
2. **E2E (Playwright)** — the catalog below; runs on Chromium + Firefox +
   WebKit in CI. Kept deliberately lean: happy paths, data-loss paths, and
   regressions for shipped bugs.
3. **Sandbox negative tests (step 16a)** — not a category the old plan had.
   Every capability the bridge exposes gets a test that it is _refused_
   when ungranted, and every ambient browser capability (storage, cookies,
   network, top-level navigation) gets a test that the frame cannot reach
   it. These are the tests that make G2 trustworthy; treat them as exit
   criteria, not coverage.
4. **Manual QA script (every release)** — a one-page checklist: fresh
   profile boot, upgrade-in-place from the previous release (migration
   check), Safari private mode (degraded-storage path), reduced-motion,
   200%-zoom, and — once U2 lands — a deliberately awful custom accent, to
   confirm the contrast validator earns its keep.

### E2E scenario catalog (H5 — initial 15)

| #   | Scenario                                                                   | Guards against                              |
| --- | -------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | Cold boot → Welcome window, dock, menu bar render; no console errors       | Boot regressions                            |
| 2   | Open Files from dock; drag window; snap left; restore-drag; close          | WM pointer logic                            |
| 3   | ⌘-shortcut dispatch: app chord beats shell chord; ⌘W closes                | shortcuts.ts routing                        |
| 4   | Create folder → rename → move via DnD → trash → restore → verify path      | fs lifecycle                                |
| 5   | Trash → Empty (two-step confirm) → items gone after reload                 | destructive flow                            |
| 6   | Notes: edit → autosave badge → reload → content persists                   | autosave/flush                              |
| 7   | Open file from Files → Notes selects it; switch note; re-open → re-selects | the payload-identity bug fixed this session |
| 8   | Viewer: open image → zoom/fit/rotate → resize window → fit recomputes      | ResizeObserver path                         |
| 9   | Terminal: `mkdir`/`echo >`/overwrite/`cat`/`rm` round-trip vs. Files view  | engine↔store integration                    |
| 10  | Theme: toggle dark; accent + wallpaper change; reload persists             | settings persistence                        |
| 11  | Dock: pin/unpin, size/position change relayouts, running dots              | dock store/UI                               |
| 12  | Notification: action button (Undo) restores the file; center marks read    | notification flows                          |
| 13  | Two windows same app: z-order, minimize→dock restore, ⌘Q closes all        | multi-window                                |
| 14  | Private-mode boot (no IDB): OS boots in-memory, banner shown               | persistence hardening                       |
| 15  | Forced app crash → error card in-window; shell + other windows fine        | H4 boundaries                               |

Phase 10 added upload/download/multi-select scenarios. Step 14 adds the
export/import round-trip and a spec per fixed backlog finding; step 15 adds
custom-wallpaper/accent persistence and Player auto-advance; step 16 adds the
sandbox negative tests (a frame that tries to reach storage, network, or an
ungranted capability and is refused).

### Versioning & release mechanics

- **Semver mapping:** steps release as tagged minors (0.13, 0.14, …); 1.0
  when §2's definition is met — that is, at step 17's exit, not before.
  Patch releases for fixes between steps.
- **Feature flags:** `flags.ts` (env + localStorage override); the sandbox
  and the app SDK ship dark through steps 16–17 behind their own flags, the
  way `online` was meant to be used before that track was retired.
- **Branching:** trunk-based; `main` always releasable (enforced by CI);
  step work in short-lived feature branches; no long-running release
  branches until there are external users to support.
- **Migrations:** IDB and persisted-store version bumps get an explicit
  migration function plus an upgrade-in-place E2E fixture (an old-schema
  snapshot committed as a test asset). Step 14 makes this real for the
  localStorage stores, which have no `migrate` at all today.
- **Changelog:** human-written `CHANGELOG.md` per release; exit criteria
  from §4 become the release-notes skeleton. Tagging can start before
  distribution does — a tag costs nothing and dates the work.

## 10. Immediate next steps

1. **Add a LICENSE** (§6.3). The repository is public without one, so today
   nobody may legally fork it or contribute. Ten minutes, and gated on
   nothing.
2. ~~**Run the dependency spike** (R3)~~ — ✅ done 2026-07-25; see R3 above.
   Neither CodeMirror 6 nor pdf.js is blocked by the workspace policy.
3. **Re-triage the review backlog** against `main` before working from it —
   five entries were already closed by the accessibility pass, and a stale
   defect list is worse than none.
4. **Write the U2 contrast note before building the picker.** Deciding what
   "readable" means — which colour pairs, which ratio, warn or refuse — is
   the whole design; the picker itself is straightforward once that's
   settled.

---

## Appendix A — Design sketches for the XL items

Not final designs — these are the starting points for each item's design
doc, capturing decisions already implied by the current architecture.

**A.2 (blob architecture) and A.4 (session restore) shipped**; they are kept
because they document _why_ the shipped code looks the way it does. **A.1 and
A.3 describe the retired server track** (§3.X.1) and are kept only as
reference — A.1 in particular is deliberately _heavier_ than the snapshot
merge X.2 would need, and should not be used as X.2's design. **A.5 is live**
and seeds step 16a.

### A.1 Sync engine (A4): op log over the StorageAdapter seam — _retired_

**Core shape.** Every fs/settings mutation becomes an **operation**
appended to a local outbox before the UI even hears about network:

```ts
interface Op {
  opId: string; // uuid — idempotency key
  deviceId: string; // stable per install
  seq: number; // Lamport counter per device (never wall clock)
  kind: "put" | "remove";
  nodes?: FsNode[]; // for put (metadata only; blobs travel separately)
  nodeIds?: string[]; // for remove
  baseVersion?: Version; // what this op believed it was editing
}
interface Version { deviceId: string; seq: number } // LWW order: (seq, deviceId)
```

**Client pipeline.**
`mutation → commit to Zustand + IDB (as today) → append Op to IDB "outbox"
→ syncer drains FIFO with exponential backoff → server acks with canonical
versions → server broadcasts deltas → remote ops applied iff their version
wins`. The existing `commit()`/`removeIds()` helpers in `fsStore.ts` are
the exact interception points — the store API doesn't change.

**Non-negotiable invariants** (each becomes a fuzzer assertion):

1. Applying the same op twice is a no-op (`opId` dedupe).
2. Ops from one device apply in `seq` order; cross-device order may vary
   but all devices converge to identical state.
3. A delete leaves a **tombstone** (`removedAt` + version) for ≥ 30 days —
   today's `removeMany` physically erases, which cannot sync.
4. Offline boot = snapshot + replay of unacked outbox; no network in the
   boot path.
5. Content conflict (both devices edited `content` from the same
   `baseVersion`) forks a "name (conflicted copy)" node rather than losing
   either write — reuses `uniqueChildName`.

**Server side.** Per-account append-only `ops` table (the audit log and
recovery mechanism), materialized `nodes` snapshot for fast `GET
/fs/nodes?since=<cursor>`, WebSocket fan-out of applied ops to the
account's other connections. Ops make server storage grow forever →
periodic compaction below the tombstone horizon.

**Explicitly out of scope for v1:** CRDT text merging (that's E3),
per-field merge, cross-account ops.

### A.2 Blob architecture (B1): content-addressed bytes

**Problem.** `FsNode.content` holds file bytes as strings (data URLs for
images). Every byte rides through `loadAll`, every Zustand snapshot, and —
post-A4 — every sync op. This caps file size at "toy".

**Shape.**

```ts
// FsNode changes
interface FsNode {
  // content?: string        → stays, but only for small text (≤ 64 KB)
  contentRef?: { hash: string; size: number }; // binaries & big text
}
```

- New IDB object store `blobs`: `hash (sha-256) → Blob`. Nodes are
  metadata-only; the fs store never holds bytes in memory.
- **Content addressing** gives dedupe for free (10 copies of a photo = 1
  blob) and makes server upload skippable when the hash already exists
  ("instant upload").
- **GC:** refcount sweep triggered by `emptyTrash`/`deleteForever` —
  delete blobs no live `contentRef` points to. Runs idle-time, unit-tested
  as a pure function over `(nodes, blobHashes)`.
- **Threshold rule:** text ≤ 64 KB stays inline in `content` so Notes,
  the Terminal (`cat`, `echo >`), and sync ops keep their simple
  string path; everything else goes through `contentRef`.
- **Server:** blobs live in S3-compatible storage; API hands out presigned
  upload/download URLs after a hash-existence check; metadata sync (A4)
  never carries bytes.
- **Migration:** one-time pass in `fsStore.init` — any node whose
  `content` is a data URL > threshold is hashed into `blobs` and
  rewritten. Ship with the upgrade-in-place E2E fixture (§9).
- **Consumers to update:** Viewer & Files thumbnails (`node.content` →
  `URL.createObjectURL`), `openFile`, seed data, Terminal `cat` (prints a
  size/type notice for binary refs — it already special-cases images).

### A.3 API surface (A1/A2): first draft — _retired_

REST for request/response, one WebSocket for push. All routes
account-scoped by the session token; versioned under `/v1`.

| Route                                                                        | Purpose                                                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /v1/auth/signup` · `POST /v1/auth/login`                               | Email + passkey (WebAuthn) first; password fallback decided in the design doc             |
| `POST /v1/auth/refresh` · `DELETE /v1/auth/sessions/:id`                     | Short-lived access token (~15 min) + rotating refresh; device list & remote sign-out (A8) |
| `GET /v1/fs/nodes?since=<cursor>`                                            | Snapshot/delta catch-up on boot and reconnect                                             |
| `POST /v1/fs/ops`                                                            | Batch op submission (A.1); returns per-op ack/canonical version                           |
| `POST /v1/blobs/presign` · `HEAD /v1/blobs/:hash`                            | Upload/download URLs; hash-existence check                                                |
| `GET /v1/account` · `PATCH /v1/account/settings` · `GET /v1/account/usage`   | Profile, synced preferences (A6), quota meter (A7)                                        |
| `POST /v1/shares` · `DELETE /v1/shares/:id` · `GET /v1/public/shares/:token` | E1; the public route is the only unauthenticated surface                                  |
| WS `/v1/events`                                                              | `ops.applied`, `account.updated`, later `presence.*`                                      |

Skeleton decisions to confirm in the A1 design doc: TypeScript service in
this pnpm workspace (`apps/server`) sharing the `FsNode`/`Op` types with
the client; Postgres (nodes, ops, accounts, shares) + S3-compatible blob
store; rate limiting and body-size caps in the skeleton from day one (R5).

### A.4 Session restore (C1): saved-session schema

```ts
interface SavedSession {
  version: 1;
  savedAt: number;
  windows: Array<{
    appId: string;
    rect: WindowRect;
    mode: WindowMode;
    minimized: boolean;
    stackOrder: number; // relative z, not raw zIndex
    payload?: unknown; // only if the app opts in
  }>;
  focusedIndex: number | null;
}
```

- Written debounced on any window-store change; localStorage first, synced
  via A6 later.
- Apps opt into payload restore through two optional manifest hooks:
  `serializePayload(payload) → JsonValue | null` and
  `restorePayload(json) → payload`. Notes serializes `{ fileId }`, checks
  the file still exists on restore; apps without hooks reopen bare.
- Guardrails: skip windows whose `appId` is no longer registered; clamp
  rects through the existing `clampToViewport`; a `?fresh` URL param
  bypasses restore (recovery hatch if a bad session wedges boot).

### A.5 Third-party app sandbox (G2 → D8): capability bridge

- **Packaging:** an app = static bundle (HTML/JS/CSS) + `manifest.json`
  (id, name, version, entry, icon, `capabilities: string[]`,
  min-shell-version). Installed bundles live in the VFS under a hidden
  `/Apps` folder → they sync like files for free.
- **Isolation:** `<iframe sandbox="allow-scripts">` on a null origin —
  no cookies, no storage, no network except through the bridge.
- **Bridge:** promise-based postMessage RPC. Every call is checked against
  the manifest's granted capabilities _in the shell_, e.g.
  `fs.read:/Home/Documents`, `fs.write:<own-data-dir>`, `notifications`,
  `clipboard.read`. First-run consent screen lists requested capabilities;
  grants are revocable in Settings.
- **Shell integration over the same bridge:** window title updates, menu
  section declaration (reusing the `MenuSection` shape), `appCommand`
  delivery back into the iframe, dock badge/progress.
- **First consumer is first-party:** the D6 PDF viewer (✅ shipped, step 16b,
  2026-08-01) renders inside this sandbox before any external code does
  (D1's markdown renderer shipped independently — §6 decision 8 — and only
  needs this if D9 opens its editor schema to raw HTML) — the bridge gets
  hardened on friendly apps.

## Appendix B — Phase 9 work breakdown _(shipped)_

Kept as a worked example of the granularity a step expands into: ordered,
each row one PR-sized task, each with its own acceptance criterion. Steps
14–17 should be broken down the same way before they start.

| ID    | Task                               | Size | Details & acceptance                                                                                                                                                                                                        |
| ----- | ---------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P9.1  | **Git init + remote** (T0)         | S    | `git init`, commit (excluding `dist/` — it's currently on disk; `.gitignore` already covers it), push, protect `main`. _Accept:_ PRs are the only path to `main`.                                                           |
| P9.2  | **Toolchain alignment** (T1)       | S    | Decide Node 22 LTS vs 24; align `engines`, `.nvmrc`, CI image, and the `.claude/launch.json` node path. _Accept:_ `pnpm lint && pnpm build && pnpm test` clean on the pinned version with no engine warnings.               |
| P9.3  | **CI pipeline** (H6)               | M    | Actions workflow: pnpm cache → lint → typecheck → unit. Badge in README. _Accept:_ red on any failure; < 4 min before E2E is added.                                                                                         |
| P9.4  | **Playwright rig** (H5)            | M    | Install (verify against the 7-day release-age policy — pin an older minor if needed), config for 3 engines, scenario 1 (boot smoke). _Accept:_ runs headless in CI on all three browsers.                                   |
| P9.5  | **E2E: fs + notes round-trips**    | M    | Scenarios 4, 5, 6, 7 from §9. _Accept:_ catches a deliberately re-introduced payload-identity bug (mutation test).                                                                                                          |
| P9.6  | **E2E: window management**         | M    | Scenarios 2, 3, 13. Pointer-event drag/snap helpers become shared fixtures.                                                                                                                                                 |
| P9.7  | **Per-window error boundary** (H4) | S    | New `WindowErrorBoundary` wrapping `<AppComponent>` in `Window.tsx`; crash card with "Reload app" (remount) and "Close window". _Accept:_ scenario 15 green; a `throw` in any app leaves shell interactive.                 |
| P9.8  | **CSP + security lint** (G1)       | M    | Meta-tag CSP for the static build (no inline script; workers/blobs allowed for B3/B1), `eslint-plugin-security`-style rules if policy-installable, `pnpm audit` in CI. _Accept:_ app runs with zero CSP console violations. |
| P9.9  | **Perf baseline** (H3 prep)        | S    | Script seeding 10k nodes; profile Files render + `childrenOf`; write findings into T7's entry. _Accept:_ a one-page note with numbers, informing Phase 10 virtualization scope.                                             |
| P9.10 | **Sort controls** (B10)            | M    | View-menu + toolbar sort (name/date/kind), per-folder persistence in a small `viewPrefs` store; `childrenOf` gains a comparator param (unit-tested).                                                                        |
| P9.11 | **Rename guard** (T2)              | S    | `fsStore.rename` (and Files/Notes rename UIs) reject `/` in names with a toast; unit test. Keeps every node addressable by the Terminal.                                                                                    |
| P9.12 | **Live window titles** (T3)        | S    | Files/Notes/Viewer window titles follow renames — add a `setWindowTitle(id, title)` store action; Viewer subscribes to its node's name.                                                                                     |
| P9.13 | **Trash polish** (B12)             | S    | Sidebar badge ages out, optional auto-empty-after-30-days setting (default off).                                                                                                                                            |
| P9.14 | **Feature-flag utility**           | S    | `src/system/flags.ts`: build-time env + localStorage override + Settings › About debug list. Needed dark-shipping from Phase 10 onward.                                                                                     |

Suggested sequencing: P9.1 → P9.2 → P9.3 land first (everything else rides
CI); P9.4–P9.6 and P9.7–P9.9 can proceed in parallel tracks; P9.10–P9.14
are independent fillers.
