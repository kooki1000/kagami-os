# Kagami OS — Feature Backlog & Roadmap to a Full Online Desktop

**Status:** draft for review · July 2026
**Baseline:** v0.6 "Lagoon" — phases 1–8 complete (see `ARCHITECTURE.md`)

This document defines what "a fully functioning online desktop client" means
for Kagami, enumerates every feature gap between that target and today's
codebase, and sequences the work into milestones with acceptance criteria.
Feature items carry stable IDs (`A1`, `B4`, …) so milestones, issues, and
commits can reference them.

**Sizing legend:** `S` ≈ half a day · `M` ≈ 1–3 days · `L` ≈ 1–2 weeks ·
`XL` ≈ multi-week, needs its own design doc.

**Contents**

1. [Where the project stands today](#1-where-the-project-stands-today)
2. [Definition of "fully functioning online desktop client"](#2-definition-of-fully-functioning-online-desktop-client)
3. [Feature backlog by area](#3-feature-backlog-by-area) (A backend · B files · C shell · D apps · E sharing · F platform · G security · H quality)
4. [Roadmap](#4-roadmap) — phases 9–15 with exit criteria
5. [Technical debt register](#5-technical-debt-register)
6. [Open decisions](#6-open-decisions-need-sign-off-before-the-affected-phase)
7. [Risk register](#7-risk-register)
8. [Success metrics per milestone](#8-success-metrics-per-milestone)
9. [Testing & release strategy](#9-testing--release-strategy)
10. [Immediate next steps](#10-immediate-next-steps)

- [Appendix A — Design sketches for the XL items](#appendix-a--design-sketches-for-the-xl-items)
- [Appendix B — Phase 9 work breakdown](#appendix-b--phase-9-work-breakdown-ready-to-work)

---

## 1. Where the project stands today

Everything below already works and is the foundation the roadmap builds on:

- **Shell** — menu bar (system + per-app manifest menus), dock (pin/run
  indicators, size/position settings), wallpaper, light/dark/auto theme,
  three accent/wallpaper "directions" (Lagoon/Iris/Meadow), toasts +
  notification center, global ⌘-shortcuts.
- **Window manager** — open/close/focus (monotonic z-index), drag, 8-way
  resize, minimize (with fly-to-dock animation), maximize, 50% edge snap,
  restore-rect peeling, viewport clamping. Pure Zustand store, unit-tested.
- **Virtual file system** — `FsNode` tree in Zustand, write-through
  IndexedDB persistence behind the `StorageAdapter` seam, seeded first run,
  Trash with restore/empty semantics, name dedupe, system-folder protection.
- **Apps** — Files (grid/list, breadcrumbs, history, filter, rename, DnD,
  trash flows), Notes (autosave, payload-driven selection), Viewer
  (zoom/fit/rotate), Terminal (sandboxed pure shell engine over the VFS),
  Settings (appearance/dock/about), Welcome.
- **Quality** — 62 Vitest unit tests over the window store, fs store, and
  shell engine; strict ESLint; type-checked builds.

Two architectural **seams were built deliberately for this roadmap** and
should absorb most of the work below without rewrites:

1. `StorageAdapter` (`src/system/fs/types.ts`) — the only interface the fs
   store persists through. The online backend replaces `idbAdapter.ts` here.
2. The **app manifest pattern** (`src/system/apps/`) — apps are data
   (manifest + lazy component); the shell renders them generically. New
   apps, and eventually third-party apps, plug in here.
3. `OsWindow.screenId` — reserved for multi-monitor; currently always
   `'main'`.

---

## 2. Definition of "fully functioning online desktop client"

The target product, stated as user-visible capabilities:

1. **It's yours anywhere.** Sign in from any browser and get the same
   files, notes, wallpaper, dock, and open-window layout you left behind.
2. **Real files.** Upload anything from the host OS, download anything
   back out, preview common formats, and manage files with the ergonomics
   of a native file manager (multi-select, clipboard, keyboard).
3. **Always usable.** Works offline as a PWA and syncs when connectivity
   returns; no data loss on refresh, crash, or network failure.
4. **Shareable.** Any file or folder can be shared via link with
   view/edit permissions.
5. **A real app platform.** A useful built-in app suite, plus a documented
   way to add apps without touching the shell.
6. **Trustworthy.** Authenticated, authorized, rate-limited, encrypted in
   transit; third-party code is sandboxed; accessible; tested end-to-end.

Everything in section 3 traces back to one of these six statements.

---

## 3. Feature backlog by area

### A. Accounts & backend service _(the "online" in online desktop)_

The single biggest gap. Today there is no server; all state is
device-local. This area needs its own design doc before implementation
(see Open Decisions), but the scope is:

| ID  | Feature                                                                                                                                                                                                                        | Size | Notes                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Backend service skeleton** — HTTP API + WebSocket event channel, deployable unit, environments (dev/staging/prod)                                                                                                            | L    | Recommend a thin Node/TypeScript service so types are shared with the client via the workspace                                                                                            |
| A2  | **Accounts & auth** — sign-up/sign-in (email + passkey first; OAuth later), session tokens with refresh, sign-out everywhere                                                                                                   | L    | Client side: login screen before the desktop boots, session store, guest/local-only mode preserved                                                                                        |
| A3  | **Remote `StorageAdapter`** — implement `loadAll/putMany/removeMany` against the API                                                                                                                                           | M    | Drop-in behind the existing seam; keep the IDB adapter as the offline cache, not a rival source of truth                                                                                  |
| A4  | **Sync engine** — replace fire-and-forget write-through with a persistent **operation queue**: mutations append ops locally, a syncer drains the queue to the server, server broadcasts deltas over WebSocket to other devices | XL   | Requires: per-node `version` (Lamport or `updatedAt` + device id), **tombstones** for deletes (current `removeMany` erases history), idempotent op application, exponential-backoff retry |
| A5  | **Conflict policy** — last-writer-wins per node for metadata; for file _content_ conflicts, keep both ("name (conflicted copy)") rather than silently dropping edits                                                           | M    | Aligns with the existing `uniqueChildName` machinery                                                                                                                                      |
| A6  | **Settings/preferences sync** — themeStore, settingsStore, dockStore currently persist to localStorage; mirror them through the same op queue so appearance follows the account                                                | M    | Keep localStorage as the offline cache                                                                                                                                                    |
| A7  | **Quotas & usage** — per-account storage quota, usage meter in Settings › About/Storage, friendly errors when full                                                                                                             | M    | Server-enforced; client shows headroom before large uploads                                                                                                                               |
| A8  | **Multi-device session awareness** — device list in Settings, remote sign-out                                                                                                                                                  | S    | Rides on A2's session model                                                                                                                                                               |

**Dependency chain:** A1 → A2 → A3 → A4 → (A5, A6, A7, A8).

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

| ID  | Feature                                                                                                                                                                       | Size | Notes                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| C1  | **Session restore** — persist window layout (app, rect, mode, z-order, minimized) and reopen it on boot; apps opt in to restoring payloads (e.g. Notes reopens the same note) | M    | Persist via the settings sync path (A6) once it exists; localStorage first                              |
| C2  | **App/window switcher** — ⌘Tab cycling with an overlay, ⌘\` between windows of one app                                                                                        | M    | Window store already has all the data; needs a capture-phase key handler coexisting with `shortcuts.ts` |
| C3  | **Window overview** ("mission control") — zoomed-out grid of open windows, click to focus                                                                                     | L    | Pure CSS transforms over `WindowLayer`; good demo feature, not load-bearing                             |
| C4  | **Quarter snapping & keyboard window ops** — corner snap zones; ⌃⌥-arrows to snap/maximize/restore                                                                            | M    | Extends `SnapSide` to a `SnapZone` union; store logic is unit-testable like the existing snap tests     |
| C5  | **Menu-bar status tray** — sync status (A4's queue depth/offline badge), storage meter (A7), battery/network where the Web APIs allow                                         | S/M  | First real consumer of sync-engine observability                                                        |
| C6  | **Focus-follows-app polish** — clicking a dock tile of a running app with all windows minimized restores _all_; app-level "hide" (⌘H)                                         | S    |                                                                                                         |
| C7  | **Multi-monitor** — populate `screenId` via the Window Management API where available; per-screen maximize/snap bounds                                                        | XL   | Explicitly deferred; the seam exists so nothing else blocks on it                                       |
| C8  | **Lock screen / fast user switch** — visual lock tied to the session (A2)                                                                                                     | S    | Post-auth nicety                                                                                        |

### D. App suite

| ID  | Feature                                                                                                                                                                                             | Size     | Notes                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Notes: Markdown preview & formatting** — split/rendered view, toolbar, task-list checkboxes; stays plain-markdown on disk                                                                         | L        | Renderer must be sandboxed/sanitized (no raw HTML injection)                                                                |
| D2  | **Viewer: pan + gestures + slideshow** — drag-to-pan when zoomed, pinch/trackpad zoom, arrow-key prev/next within the folder, basic EXIF panel                                                      | M        | Prev/next reuses `childrenOf` on the file's parent                                                                          |
| D3  | **Terminal: engine v2** — `cp`, `mv`, `head/tail`, `grep`, `open` (launches the associated app), `>>` append, pipes between builtins, tab completion, `..`-aware path arguments for `mkdir`/`touch` | L        | Keep the engine pure and unit-tested; completion needs a small readline layer in `TerminalApp`                              |
| D4  | **Code/text editor app** — syntax highlighting, multi-tab, association for `.json/.ts/.css/…`                                                                                                       | L        | Evaluate CodeMirror 6 vs. a lighter highlighter under the `minimumReleaseAge` install policy                                |
| D5  | **Media player app** — audio/video playback for uploaded files (post-B1), playlist from a folder                                                                                                    | M        | `<audio>/<video>` over Blob URLs; add mime associations                                                                     |
| D6  | **PDF viewing** — render uploaded PDFs (pdf.js) in Viewer or a dedicated app                                                                                                                        | M        | Dependency-policy check needed                                                                                              |
| D7  | **Small utilities** — Calculator, Clock/timer, Paint-style canvas                                                                                                                                   | S–M each | Cheap wins that exercise the manifest pattern; good first-contribution targets                                              |
| D8  | **Third-party app SDK** — apps as sandboxed iframes with a postMessage bridge exposing a _capability-scoped_ API (fs scopes, windowing, notifications); manifest install/uninstall UI               | XL       | The long-term platform play; requires G2's sandbox model first. Everything before it should keep the manifest pattern clean |

### E. Sharing & collaboration _(post-backend)_

| ID  | Feature                                                                                                                                               | Size | Notes                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------- |
| E1  | **Share links** — per node, view or edit, revocable, optional expiry; public viewer page for shared files that renders without a full desktop session | L    | Needs A1–A4                                                                                 |
| E2  | **Shared-with-me** — a virtual place in the Files sidebar                                                                                             | M    |                                                                                             |
| E3  | **Real-time co-presence** — see other devices/users viewing a folder; live cursor/selection in Notes later                                            | XL   | CRDT territory for Notes (Yjs or similar); scope carefully, ship presence before co-editing |

### F. Platform: PWA, offline, mobile

| ID  | Feature                                                                                                                                                                                                               | Size | Notes                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------- |
| F1  | **PWA** — manifest, icons, service worker precaching the app shell, installability                                                                                                                                    | M    | Vite PWA plugin, subject to dependency policy                         |
| F2  | **Offline-first behavior** — boot fully offline from cached shell + IDB data; the A4 op queue holds writes until reconnect; visible offline indicator (C5)                                                            | M    | Mostly falls out of A3/A4 done right; this item is the UX + test pass |
| F3  | **Touch & small screens** — touch drag for windows/files already partially works via pointer events; needs bigger hit targets, a phone layout decision (full windowing is desktop-only; phones get a single-app view) | L    | Explicitly de-scoped from v1.0 unless priorities change               |
| F4  | **Browser support matrix** — define and CI-test Chromium/Firefox/Safari; Safari IDB and pointer-capture quirks are the known risks                                                                                    | S    |                                                                       |

### G. Security, privacy, trust

| ID  | Feature                                                                                                                                                                        | Size | Notes                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------- |
| G1  | **Security baseline** — strict CSP, no `dangerouslySetInnerHTML` anywhere (audit D1's markdown renderer), dependency audit in CI, rate limiting + input validation server-side | M    | Do alongside A1, not after                                                      |
| G2  | **App sandboxing model** — iframe + capability bridge design (prerequisite for D8); even first-party "risky" renderers (markdown preview, PDF) should render in the sandbox    | L    |                                                                                 |
| G3  | **Encryption** — TLS everywhere (table stakes); evaluate optional client-side encryption for file content at rest                                                              | M/XL | E2EE conflicts with server-side search/preview — decide explicitly, don't drift |
| G4  | **Privacy posture** — no third-party trackers; opt-in only, anonymized telemetry (H4); data export (full account → zip) and account deletion                                   | M    | Data export doubles as the backup story                                         |

### H. Quality: accessibility, i18n, performance, testing

| ID  | Feature                                                                                                                                                                                                                                          | Size | Notes                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------ |
| H1  | **Accessibility pass** — real menu/menuitem ARIA roles + arrow-key traversal in MenuBar/ContextMenu, focus trap per window, visible focus rings, `prefers-reduced-motion` variants for the minimize/toast animations, screen-reader labels audit | L    | The biggest gap in current UI code; do before the surface area doubles                                 |
| H2  | **i18n scaffolding** — extract strings, locale-aware `Intl` date/number formatting (`format.ts` and `Clock` hardcode `en-US`), RTL smoke test                                                                                                    | M    | Scaffold early even if English-only ships                                                              |
| H3  | **Performance** — virtualize Files list/grid and Notes sidebar for 10k+ nodes; index `childrenOf` (currently O(n) scans of all nodes per render — fine now, not at scale); Lighthouse budget in CI                                               | M    | Measure first: seed a 10k-node fixture and profile                                                     |
| H4  | **Observability** — error boundary per window (one crashing app must not take down the shell), client error reporting, opt-in usage telemetry                                                                                                    | M    | Error boundaries are S and should happen immediately                                                   |
| H5  | **E2E test rig** — Playwright suite covering: boot, open/move/snap/close windows, Files trash/restore round-trip, Notes edit persistence across reload, Terminal session, theme switching                                                        | L    | The unit suites are strong; integration coverage is zero. Prerequisite for confident backend refactors |
| H6  | **CI/CD** — lint + typecheck + unit + E2E on every PR; preview deploys; versioned releases with changelog; fix the `engines` field vs. dev-Node mismatch (`package.json` pins 22.23.1; local dev uses 24)                                        | M    | First infrastructure item to do — everything else lands safer with it                                  |

---

## 4. Roadmap

Phases continue `ARCHITECTURE.md`'s numbering (1–8 shipped). Ordering
follows three rules: (1) infrastructure that de-risks later work ships
first, (2) the local desktop reaches "excellent" before the backend lands
(sync amplifies whatever quality exists), (3) each phase ends in a
demoable, releasable state.

### Phase 9 — Foundations & guardrails → v0.7 _(≈ 2–3 weeks)_

The boring phase that makes every later phase cheaper.

**Scope:** T0 (git init — everything else depends on it) · H6 (CI/CD) ·
H4 error boundaries · H5 (E2E rig with the first ~10 scenarios) · G1
client-side items (CSP, audit) · H3 measurement baseline (10k-node fixture

- profile) · B10 (sort) · B12 (trash polish) · tech-debt items T1–T3 (§5)
  · a feature-flag utility for later dark-shipping.
  **Task-level breakdown:** Appendix B (P9.1–P9.14).

**Exit criteria:**

- Every PR runs lint, typecheck, unit, and E2E in CI; `main` auto-deploys
  a preview build.
- A thrown render error in any app shows an in-window crash card; the
  shell and other windows keep working.
- Playwright smoke suite green on Chromium + Firefox + WebKit.

### Phase 10 — File system maturity → v0.8 _(≈ 3–4 weeks)_

Files becomes a real file manager; the storage layer becomes
binary-capable and sync-ready.

**Scope:** B1 (blob architecture — **do first**, it reshapes `FsNode`) ·
B2 (upload) · B3 (download) · B4 (multi-select) · B5 (clipboard) · B6
(keyboard nav) · B8 (metadata/size) · B11 (open-with) · D5 or D6 (one new
consumer of binary files, to prove B1).

**Exit criteria:**

- Drag a folder of photos from the host OS into Pictures; thumbnails
  render; download one back and it's byte-identical.
- Select 50 files with ⇧-click, ⌘C, paste into another folder, trash them,
  restore them — all keyboard-only, all surviving a reload.
- `loadAll` payload no longer contains file bytes (nodes are metadata).

### Phase 11 — Desktop experience → v0.9 _(≈ 3 weeks)_

The shell reaches feature parity with what people expect from a desktop.

**Scope:** B7 (desktop icons) · C1 (session restore) · C2 (⌘Tab switcher)
· C4 (quarter snap + keyboard window ops) · B9 name search (⌘K overlay) ·
C6 · D2 (viewer pan/next-prev) · D3 (terminal engine v2) · H1
(accessibility pass — last chance before surface area doubles).

**Exit criteria:**

- Reload the browser: every window returns to its exact rect/mode, Notes
  reopens the same note, the desktop shows your icons where you left them.
- Full session (open app, arrange windows, find a file, open it) possible
  without touching the mouse.
- Menus and context menus pass an axe-core audit and are operable with a
  screen reader.

### Phase 12 — PWA & offline packaging → v0.9.x _(≈ 1–2 weeks)_

**Scope:** F1 (PWA) · F2 UX (offline indicator, though the queue arrives
in Phase 13 — offline here means "boots and works locally") · F4 (browser
matrix in CI) · H2 (i18n scaffolding while strings are still few).

**Exit criteria:** installable PWA; airplane-mode boot to a fully working
local desktop; CI runs the matrix.

### Phase 13 — The backend: accounts & sync → v1.0-alpha _(≈ 6–8 weeks, the big one)_

Runs behind a feature flag; local-only mode remains the default until GA.

**Scope:** A1 (service + API design doc first — **checkpoint: review the
design before code**) · A2 (auth + login screen + guest mode) · A3 (remote
adapter) · A4 (op queue, tombstones, versioning, WebSocket deltas) · A5
(conflicts) · A6 (settings sync) · A7 (quotas) · C5 (sync status tray) ·
G1 server-side items.

**Exit criteria:**

- Sign in on machine A, edit a note, watch it appear on machine B within
  seconds; no reload required.
- Edit the same note offline on both machines, reconnect: both versions
  survive as documented by the conflict policy; nothing is silently lost.
- Kill the tab mid-upload; on next boot the op queue resumes and completes.
- Soak test: 2 devices × 1k random ops fuzzer runs clean (no divergence
  between device states — assert store equality).

### Phase 14 — Online GA → v1.0 _(≈ 3–4 weeks)_

**Scope:** E1 (share links + public viewer) · E2 (shared-with-me) · A8
(device management) · G4 (export/deletion) · security review + pen-test
pass · onboarding polish (Welcome app becomes a real first-run tour) ·
docs (user guide + self-hosting notes).

**Exit criteria:** a stranger can sign up, upload files, share a link that
opens for a signed-out recipient, and delete their account taking all
data with them.

### Phase 15+ — Platform & collaboration _(post-1.0, re-plan at GA)_

In rough priority order: G2 sandbox model → D8 third-party app SDK · D1
Notes markdown preview (in the sandbox) · D4 code editor · E3 presence →
co-editing · C3 window overview · C7 multi-monitor · F3 mobile layout ·
G3 E2EE decision.

### Dependency snapshot

```
H6 CI ──► everything
B1 blobs ──► B2/B3 upload/download ──► D5/D6 media/PDF
A1 api ──► A2 auth ──► A3 adapter ──► A4 sync ──► A5/A6/A7 · E1 sharing ──► E3 collab
G2 sandbox ──► D8 SDK · D1 preview
H1 a11y before Phase 12+ surface growth
C1 session restore ──► (better with A6, works locally without)
```

---

## 5. Technical debt register

Known issues to schedule (none block daily use today):

| ID  | Debt                                                                                                                                                                                                                                                                              | Suggested phase |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| T0  | **The project is not a git repository.** No history, no branches, no CI possible; `dist/` build output sits on disk untracked. Blocking prerequisite for H6 and all collaboration                                                                                                 | 9 (first)       |
| T1  | `engines` pins Node 22.23.1 but development uses Node 24 (ESLint crashes on default Node 20); align `.nvmrc`, `engines`, and CI                                                                                                                                                   | 9               |
| T2  | Files rename permits `/` in names, which the Terminal's path resolver can never address; decide (reject vs. escape) and enforce in `fsStore.rename`                                                                                                                               | 9               |
| T3  | Viewer/openFile window titles go stale when the file is renamed while open                                                                                                                                                                                                        | 9               |
| T4  | `notificationStore.toastIds` can retain ids evicted from the 50-item history (harmless, filtered on render)                                                                                                                                                                       | 10              |
| T5  | Terminal `parse()` redirect regex can match a `>` inside quotes (`echo "a > b"`)                                                                                                                                                                                                  | 11 (with D3)    |
| T6  | `deleteForever` doesn't itself enforce trash-only; the guard lives at call sites — revisit when the fs API is exposed to third-party apps                                                                                                                                         | 15 (with D8)    |
| T7  | `childrenOf` is ~147 ms on a 10k-node folder — but the hotspot is per-comparison `localeCompare`, not the O(n) scan (date sort of the same data is ~3.5 ms). Reuse one `Intl.Collator` first; parent-id index second. See [`docs/perf-baseline.md`](docs/perf-baseline.md) (P9.9) | 10 (with H3)    |
| T8  | The `idb` convenience library is blocked by the workspace `minimumReleaseAge` policy; raw-IDB adapter is fine, but revisit when B1 makes IDB code grow                                                                                                                            | 10              |

---

## 6. Open decisions (need sign-off before the affected phase)

1. **Backend stack & hosting** (blocks Phase 13): recommendation is a
   TypeScript service in this pnpm workspace (shared types with the
   client), Postgres for node metadata + ops, S3-compatible blob storage,
   WebSocket for deltas. Alternatives: BaaS (Supabase-style) to compress
   A1/A2 at the cost of owning less of A4.
2. **Sync conflict policy detail** (Phase 13): per-node LWW +
   duplicate-on-content-conflict is proposed in A5 — confirm before the
   design doc.
3. **E2EE stance** (G3): encrypt-at-rest server-side (default) vs. true
   client-side encryption (kills server-side previews/search). Proposal:
   default server-side, revisit E2EE post-1.0.
4. **Mobile ambition** (F3): v1.0 is desktop-browser-first; phones get a
   read-mostly single-app layout later. Confirm so Phase 11 CSS decisions
   don't over-invest.
5. **Carried over from the design phase** (flagged at the end of the
   phase-1/2 session, still awaiting explicit sign-off): (a) the menu-bar +
   dock skeleton intentionally follows the macOS layout convention; (b) the
   coral+teal duotone window-control colors. Both are binding constraints
   from the Lagoon prototype — this roadmap assumes they stand.

**Design guardrails carried through all phases:** monochrome-at-rest
window controls with the duotone focus tint (never a traffic-light triad),
rounded-square dock tiles without magnification, Inter/JetBrains Mono,
generic app names, no Apple/Puter naming or assets, palettes only from the
documented prototype directions.

---

## 7. Risk register

Ordered by (likelihood × impact). Review at the start of every phase.

| #   | Risk                                                                                                                                                                                                                 | L    | I    | Mitigation                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **Browser evicts local data.** Safari caps IndexedDB for non-installed sites and evicts after ~7 days of disuse; a local-only user could lose everything                                                             | High | High | Call `navigator.storage.persist()` at boot and surface the result; prominent export-to-zip (G4) shipped _before_ GA marketing; PWA install prompt (F1) raises the storage tier; accounts (A2) are the real fix — this risk is a reason not to delay Phase 13                   |
| R2  | **Sync engine is harder than estimated.** Distributed-state bugs are subtle and erode trust permanently if user data diverges or vanishes                                                                            | Med  | High | Design doc + review checkpoint before code (Phase 13 gate); property-based fuzzer as an exit criterion, not an afterthought; feature flag with local-only fallback; server keeps an append-only op log so any client state can be rebuilt; staged rollout (alpha cohort first) |
| R3  | **Dependency policy blocks a needed library.** `minimumReleaseAge: 10080` + `blockExoticSubdeps` already blocked `idb`; Playwright, pdf.js, CodeMirror, a zip library, and a WebSocket client are all upcoming wants | Med  | Med  | Evaluate installability in the _first week_ of any phase that needs a new dependency; prefer zero-dep or vendorable options; budget time for hand-rolling thin layers (the raw-IDB adapter proves this is viable)                                                              |
| R4  | **Phase slip through underestimation.** Solo/small-team bandwidth; Phase 13 alone is 6–8 optimistic weeks                                                                                                            | High | Med  | Every phase ends releasable, so slipping delays value but never strands broken work; cut scope (move items right) rather than skipping exit criteria; re-estimate the remaining plan at each phase boundary                                                                    |
| R5  | **Backend cost & abuse.** Public share links + uploads invite abuse (piracy, malware hosting) and surprise storage bills                                                                                             | Med  | Med  | Quotas (A7) server-enforced from day one; rate limits in A1's skeleton, not retrofitted; share links get abuse-report + revocation (E1); egress-heavy features (public viewer) behind sensible limits                                                                          |
| R6  | **Design drift toward macOS trade dress.** As features approach OS parity, each small decision pulls toward the familiar                                                                                             | Med  | Med  | The guardrails block in §6 is binding; any new shell surface (switcher, overview, lock screen) gets a design pass against the Lagoon prototype before merge                                                                                                                    |
| R7  | **Sandbox escape / injected content** once markdown preview (D1), PDF (D6), or third-party apps (D8) render untrusted content                                                                                        | Low  | High | G2's sandbox model is a prerequisite for those features, enforced in the dependency graph; CSP from Phase 9 means a slip fails closed                                                                                                                                          |
| R8  | **Test suite becomes flaky and gets ignored**                                                                                                                                                                        | Med  | Med  | Flake budget in §9; quarantine-and-fix policy; E2E kept lean (happy paths + data-loss paths), breadth lives in unit tests                                                                                                                                                      |

## 8. Success metrics per milestone

Checked at release, not aspirational-only. Client metrics come from the
opt-in telemetry (H4/G4) once it exists; before that, from CI and manual
QA scripts.

**v0.7 (Phase 9)**

- CI wall time < 8 min; E2E flake rate < 2% over trailing 50 runs.
- 100% of app windows wrapped in error boundaries; forced-crash drill
  leaves the shell interactive.
- Zero ESLint/type suppressions added (`eslint-disable`, `@ts-expect-error` audit).

**v0.8 (Phase 10)**

- 1 GB single-file upload and 1,000-file folder upload both succeed with
  progress UI and are resumable after a mid-transfer reload.
- Files stays interactive (frame time p95 < 16 ms) in a 10,000-node folder.
- Download round-trip is byte-identical (hash check in E2E).

**v0.9 (Phases 11–12)**

- "Find and open a file, arrange two windows side by side" completable
  keyboard-only in under 30 s (scripted usability check).
- axe-core: zero critical/serious violations on every shell surface.
- Session restore fidelity: 100% of window rects/modes and Notes selection
  survive reload in E2E.
- PWA: Lighthouse installability pass; airplane-mode boot < 3 s to
  interactive desktop.

**v1.0-alpha (Phase 13)**

- Sync propagation p50 < 2 s, p95 < 10 s (two-device E2E harness).
- Fuzz soak: 2 simulated devices × 1,000 randomized ops × 100 runs with
  zero state divergence and zero lost writes.
- Op queue survives: tab kill, browser restart, 24 h offline, quota-full
  device.

**v1.0 (Phase 14)**

- Stranger test: signup → first uploaded file < 3 min without assistance.
- Share link opens for a signed-out recipient in < 2 s (cold).
- Account deletion verifiably removes all nodes, blobs, ops, and sessions
  (audited by an automated check, not a promise).

## 9. Testing & release strategy

### Test pyramid

1. **Unit (exists, keep growing)** — Vitest over pure logic: window store,
   fs store, shell engine, and every new pure module (sync queue, op
   application, blob refcounting, path/keyboard helpers). Rule: new store
   or engine code lands with unit tests in the same PR.
2. **E2E (Phase 9, Playwright)** — the catalog below; runs on Chromium +
   Firefox + WebKit in CI. Kept deliberately lean: happy paths, data-loss
   paths, and regressions for shipped bugs.
3. **Sync soak/fuzz (Phase 13)** — a Node-level harness driving two
   in-memory clients against a real server instance with randomized op
   interleavings, asserting store convergence. Not a browser test; runs
   nightly, and as a gate on sync-touching PRs.
4. **Manual QA script (every release)** — a one-page checklist: fresh
   profile boot, upgrade-in-place from the previous release (IDB migration
   check), Safari private mode (degraded-storage path), reduced-motion,
   200%-zoom.

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

Phase 10 adds upload/download/multi-select scenarios; Phase 13 adds the
two-browser-context sync scenarios.

### Versioning & release mechanics

- **Semver mapping:** milestone releases as tagged minors (0.7, 0.8, …);
  1.0 at Phase 14 exit. Patch releases for fixes between milestones.
- **Feature flags:** a tiny `flags.ts` (env + localStorage override) from
  Phase 9; backend/sync ships dark through Phase 13 behind `flag:online`.
- **Branching:** trunk-based; `main` always releasable (enforced by CI);
  phase work in short-lived feature branches; no long-running release
  branches until there are external users to support.
- **Migrations:** IDB schema version bumps get an explicit migration
  function + an upgrade-in-place E2E fixture (old-schema snapshot committed
  as a test asset). Same discipline server-side from A1 onward.
- **Changelog:** human-written `CHANGELOG.md` per release; exit criteria
  from §4 become the release-notes skeleton.

## 10. Immediate next steps

1. **Initialize version control** — the project is not a git repository
   yet (T0); nothing in Phase 9 (CI, branch protection, PR checks) exists
   without it. `git init`, first commit, remote, then protect `main`.
2. Review/adjust this roadmap — especially §6 decisions 1 and 5.
3. Stand up CI (H6) — the highest-leverage single item in the plan.
4. Add per-window error boundaries (H4, ~half a day).
5. Write the Phase 10 blob-storage design note (B1, seeded by Appendix
   A.2) — it changes `FsNode` and both adapters, so it deserves a page of
   thought before code.
6. Start the Playwright rig (H5) with scenarios 1, 4, and 6 from §9.

---

## Appendix A — Design sketches for the XL items

Not final designs — these are the starting points for each item's design
doc, capturing decisions already implied by the current architecture.

### A.1 Sync engine (A4): op log over the StorageAdapter seam

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

### A.3 API surface (A1/A2): first draft

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
- **First consumers are first-party:** the D1 markdown renderer and D6
  PDF viewer render inside this sandbox before any external code does —
  the bridge gets hardened on friendly apps.

## Appendix B — Phase 9 work breakdown (ready to work)

Ordered; each row is one PR-sized task. IDs `P9.x` for tracking.

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
