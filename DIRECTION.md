# Kagami OS — Product Direction

**Status:** direction set · revised July 2026
**Baseline:** phases 1–12 shipped, native N-1/N-2 shipped (see
`ARCHITECTURE.md` § Phase status)

This is the "where is Kagami going and why" document. `ARCHITECTURE.md`
describes what exists; `ROADMAP.md` enumerates the feature backlog and
sequences the work. This document sits above both: it states the strategic
position, the bets that follow, and the guardrails that keep the project
coherent (§6).

If you read only one section, read [§2 The shift](#2-the-shift) and
[§4 The dual-target principle](#4-the-dual-target-principle).

> **Revised July 2026.** Two things changed. Kagami is now explicitly
> **local-first with no server, ever** — the online track (accounts, sync,
> sharing) is retired, not deferred (§7). And Bet 3, the third-party app
> ecosystem, moved from an open question to a **committed goal** (§5.3),
> which is the one place the strict-CSP guardrail is knowingly loosened.

---

## 1. Where we are

Kagami OS today is a **browser-based desktop environment** — a windowing
shell, a virtual file system, and a suite of built-in apps, running entirely
client-side. Phases 1–12 are shipped: the shell, window manager, VFS with a
content-addressed blob store, the app suite (Files, Notes, Viewer, Terminal,
Media Player, Settings), desktop icons, session restore, ⌘K search, an
accessibility pass, and PWA/offline packaging. On the native track, N-1
(Tauri shell, `isTauri()`, disk-backed adapters) and N-2 (the built-in
Browser) have shipped too.

Its defining qualities today are that it is **coherent** (one design
language, from the "Lagoon" prototype) and **locked down** (a strict CSP,
no untrusted code paths, everything `'self'`).

Its defining _weakness_ is depth. The shell is mature; most of the apps
inside it are first passes, and the desktop is barely customizable. That is
the gap `ROADMAP.md` area U and step 15 exist to close, and it outranks
every new capability on the list.

## 2. The shift

**First, the constraint everything else follows from: Kagami is
local-first, and there will be no server.**

No accounts, no backend service, no telemetry. Files live on the user's
machine and never leave it unless the user exports them. This is a product
claim, not a limitation to apologize for — and it is what the codebase
already is. The previously planned online track (accounts, cross-device
sync, share links) is retired; the reasoning is in `ROADMAP.md` §3.X.1, and
the zero-cost alternative for multi-device users — pointing Kagami at
storage they already own — is parked in §3.X.2.

The practical consequence to keep in view: with no server-side copy, a
browser evicting local data is unrecoverable. Export and import are
therefore a data-durability feature, not a privacy nicety, and they ship in
the stability step rather than late (`ROADMAP.md` R1).

**Second, Kagami is a desktop environment that runs two ways:**

1. **As a website** — the universal baseline. Open a URL, get a full
   desktop, zero install. Shareable by link, runs on a locked-down
   Chromebook, tries instantly. This is the project's most distinctive
   quality and we are keeping it.
2. **As a native desktop app** (via **Tauri**) — the premium tier. Same
   codebase, wrapped in a native window, with access to capabilities the
   browser sandbox forbids.

This is **progressive enhancement, not a pivot away from the web.** The web
build stays the baseline everyone can reach; the native build adds powers on
top for users who install it. "Download the desktop app for the built-in
browser and third-party apps" is a normal, honest story — the same one many
products tell.

Why Tauri (over Electron): a much smaller binary, a native OS-level sandbox
that fits the "isolated file system" pitch directly (scoped fs
permissions), and a Rust core we can grow into. The tradeoff is a smaller
plugin ecosystem and a Rust toolchain in the build — acceptable for what we
gain.

## 3. Why native unlocks things

Three capabilities motivate the native build. Each is something the browser
sandbox does poorly or cannot do at all — so they are the reason the native
tier exists, not features we could just as easily ship on the web.

### 3.1 A real, isolated file system

The web build persists to IndexedDB — durable, but invisible and not "real
files." The native build gives Kagami a **real folder on the host machine
that it owns**: an automatic, hidden application-data directory (e.g.
`~/Library/Application Support/kagami-os/disk/` on macOS, the platform
equivalent elsewhere). That folder _is_ the virtual disk, sandboxed to
Kagami, that other apps' file pickers don't wander into.

We chose an **app-owned hidden folder** over asking the user to pick a
folder on first run: it removes the onboarding step and the persisted-scope
permission problem, and it matches the current all-in-one VFS model — the
disk is Kagami's, not a corner of the user's `Documents`.

### 3.2 A built-in web browser

A "Browser" app that renders arbitrary third-party websites **only works in
the native build**: most sites send `X-Frame-Options` / `frame-ancestors`
headers that forbid iframe embedding, and CORS blocks proxying them. The
native build sidesteps this with a **native child webview** that can
navigate anywhere, with browser chrome (tabs, address bar, history) built
around it.

### 3.3 Safer, richer third-party apps

The long-term platform play — an ecosystem of third-party apps — is safest
with a strong sandbox boundary. The native build provides one: untrusted app
code sits in an isolated webview, one more layer removed from the host than
a web-only deployment can offer. (The mechanism is the same in both builds —
sandboxed iframes plus a capability bridge, see §5.3 — but native gives it a
firmer floor to stand on.)

## 4. The dual-target principle

**One codebase, two runtimes.** The shell, window manager, dock, menu bar,
every app, and every store are 100% shared and do not know which runtime
they are in. Only two things diverge:

- **Persistence.** The `StorageAdapter` and `BlobStore` seams
  (`src/system/fs/types.ts`) already isolate persistence behind small
  swappable interfaces — this was designed in from the start. The native
  build supplies filesystem-backed implementations; the web build keeps its
  IndexedDB ones. The divergence is ~two files plus the adapters.
- **Native-only features.** The Browser (§3.2) and, later, native
  third-party-app affordances exist only in the native build.

### The one discipline that keeps this cheap

Route **every** platform check through a single `isTauri()` / capability
helper, and gate features in one place. Never sprinkle `if (native)`
conditionals across components. Native-only features present a clean
"available in the desktop app" state in the web build rather than silently
vanishing. Do this and dual-target stays tidy indefinitely; skip it and you
get death by a thousand conditionals — the thing that makes people hate
dual-target codebases.

The strict CSP is **kept in both builds.** It is a security boundary, not a
web-only tax — it matters _more_ in the native build, sitting next to
filesystem access.

## 5. The three bets, sequenced

Each bet is independently shippable, ordered so the contained,
high-confidence work comes first and each unlocks the next. **Bets 1 and 2
have shipped**; Bet 3 is now committed (§5.3) and scheduled as `ROADMAP.md`
steps 16a and 17.

### 5.1 Bet 1 — Native shell + isolated filesystem — ✅ _shipped (N-1)_

Wrap the existing web app in a Tauri window and back the VFS with the hidden
app-data folder (§3.1). New `StorageAdapter` + `BlobStore` implementations
behind the existing seam; a runtime `isTauri()` switch at the two singleton
construction points (`fsStore.ts`, `blobStore.ts`). No shell or app code
changes.

This is the **foundation** the other two bets sit on — it proves the
packaging, the seam swap, and the CSP reconciliation with the least surface
area.

### 5.2 Bet 2 — Built-in Browser — ✅ _shipped (N-2)_

A generic "Browser" app over a native child webview (§3.2): tabs, address
bar, history, back/forward. Desktop-only; the web build shows it as
unavailable. Medium lift, low architectural risk — and the feature that best
demonstrates why the native tier is worth installing.

### 5.3 Bet 3 — Third-party app ecosystem _(decided: yes)_

> **Committed, July 2026.** This was a go/no-go to be made once Bets 1–2
> shipped. They have, and the answer is yes: extensibility is part of
> `ROADMAP.md` §2's definition of finished. The section below stands as
> written — including its account of what the decision costs, now a cost
> being accepted rather than weighed.
>
> The sandbox comes **before** the apps that need it. PDF rendering handles
> untrusted content, so it lands inside the sandbox as its first consumer,
> hardening the bridge before any third-party code touches it. Notes'
> markdown preview (`ROADMAP.md` D1) turned out not to need this: it shipped
> as a closed, fixed-vocabulary renderer with no generic-HTML code path, so
> it isn't "untrusted content" in the sense this bet worried about — see
> `ROADMAP.md` §6 decision 8. A future format-as-you-type WYSIWYG editor for
> Notes (`ROADMAP.md` D9) would revisit that only if its editor schema opens
> up to raw HTML.

The biggest lift, and a genuine fork in what Kagami _is_. Third-party apps
cannot be bundled TypeScript loaded into our own React tree — they must be
**web apps in sandboxed iframes**, talking to the OS through a **capability-
scoped postMessage bridge**, gated by a permission model (this app may read
the VFS; that one may not). This is exactly the `G2` sandbox model and `D8`
third-party-app SDK already in `ROADMAP.md`, now with a native angle.

What it forces, and why it is a _decision_ rather than just a feature:

- The strict CSP has to **open up** for a `frame-src` of foreign origins and
  a sandboxed-iframe host — a real change to the security posture (§4 keeps
  the CSP strict everywhere else).
- "The app list is a TypeScript array" becomes "there is an app registry, an
  SDK contract, a permission system, and an install/uninstall UI" — most of
  what makes a platform a platform.

That decision — **ecosystem** rather than polished self-contained shell —
has now been made. It is why this bet sits above the distribution line
instead of after it.

## 6. Guardrails — what stays true

These hold across every bet above. They are what keep the project coherent
as it grows.

- **Design language is fixed — the _system_ is, not every value.** The
  Lagoon prototype constraints in `ARCHITECTURE.md` bind: monochrome-at-rest
  window controls with the coral+teal duotone focus tint (never a
  traffic-light triad), rounded-square dock tiles without magnification,
  Inter / JetBrains Mono, generic app names. **No Apple or Puter naming or
  assets** — Puter (the open-source "internet OS") is a _reference we
  studied_ for the third-party-app model, not a source of branding or code.
- **Customization is allowed inside that system** _(revised July 2026)_.
  The old rule — palettes only from the documented directions — is replaced.
  Users may set a custom accent colour and their own wallpaper image, with
  two conditions that keep the guardrail meaningful: the accent picker
  **validates contrast** against the token system and warns below WCAG AA,
  and the window-control duotone stays **derived from the accent** rather
  than user-set, so a user can never produce a traffic-light triad. Curated
  presets remain the designed default and the recommended path.
  (`ROADMAP.md` §6.5, U1–U3.)
- **Local-first, permanently.** Both builds boot and work with no network,
  because there is no network to work with. Persistence degrades gracefully
  — if the native disk folder or IndexedDB is unavailable, the OS still
  boots in-memory rather than hanging. There is no account, and nothing is
  ever a precondition to using Kagami.
- **Strict CSP in both builds** (§4), with exactly one planned exception:
  step 16a adds a `frame-src` directive for the sandboxed-app host and
  nothing else. Every other directive stays as-is, in both builds.
- **Coherence over sprawl.** Puter's ideas are adopted **deliberately and
  sequenced**, not imported wholesale. The risk in chasing a full cloud-OS
  clone is turning a tight desktop into a sprawling one with a much larger
  attack surface. Every bet ends shippable; scope moves right rather than
  quality dropping.

## 7. What happened to the online track

`ROADMAP.md` used to describe a second, parallel track: accounts, a backend,
sync across devices, and sharing. **It is retired** — the reasoning is in
`ROADMAP.md` §3.X.1, and it comes down to the difference between shipping
code and running a service indefinitely, for free, for strangers.

What survives:

- **The seams.** `StorageAdapter` and `BlobStore` were designed so a remote
  backend could drop in behind them. That shape wasn't wasted — it is what
  let the native filesystem adapter land without touching a line of shell or
  app code, and it is what a future bring-your-own-storage sync would use.
- **The BYO-storage idea** (`ROADMAP.md` §3.X.2), parked rather than
  dropped: the user supplies the backend — a Dropbox or Drive folder on
  disk, or a private Git repository over a token — and Kagami syncs. Zero
  operational cost, and it keeps "yours anywhere" reachable without
  contradicting §2. It sits below the line until the product is finished.
- **The third-party sandbox** (§5.3), which was always the `G2`/`D8` work and
  is now scheduled rather than hypothetical.

Until then, the honest multi-device answer is export and import: a user's
whole disk round-trips through a zip file they keep.

## 8. Technical approach — _as built_

This began as a sketch for Bet 1 and is now a description of shipped code:
every bullet below except the last landed in N-1/N-2. It is kept because it
records _why_ the native build is shaped the way it is.

- **Scaffold:** add Tauri v2 to the existing frontend (not a fresh
  `create-tauri-app` scaffold). `@tauri-apps/cli` + the `fs` plugin; a
  `src-tauri/` Rust crate; `tauri.conf.json` pointing dev at the Vite server
  and build at `dist/`.
- **Platform detection:** a new `src/system/platform.ts` exposing
  `isTauri()` — runtime detection, not a build-time `VITE_FLAG_*` (it is a
  fact about the environment, not an opt-in feature).
- **Adapters:** `tauriAdapter.ts` (StorageAdapter) and `tauriBlobStore.ts`
  (BlobStore), parallel to the `idb*` ones, writing under the hidden
  app-data folder. Both take the resolved root as an injectable dependency
  so they unit-test against a fake fs — mirroring how the IDB backend is
  exercised in Playwright, not vitest's `node` environment.
- **Seam wiring:** `isTauri() ? createTauriAdapter() : createIdbAdapter()`
  at `fsStore.ts` and the equivalent in `blobStore.ts`.
- **CSP:** the build-time meta-tag CSP (`vite.config.ts`) still applies
  inside the webview; Tauri plugin calls go over IPC, not `fetch`, so this
  likely needs no change — verify empirically in `tauri dev` and add only
  the specific directive the webview asks for if a violation appears.
- **Still not built, and now deliberately deferred (§9.4):** the desktop
  build/release pipeline (code signing, notarization, auto-update, per-OS
  matrix — `ci.yml` still has no build/artifact job), and desktop e2e
  (Playwright can't drive a Tauri window; needs `tauri-driver`). Signing is
  the only part that costs money; unsigned CI builds are free for public
  repositories and are the cheap first move whenever this is revisited.

## 9. Open decisions

1. **Web-target longevity.** ✅ **Decided: keep the website as the permanent
   baseline.** It is the zero-install way in, and with distribution deferred
   it is also the only way anyone will ever try Kagami without a Rust
   toolchain. The seam makes keeping both cheap.
2. **Is Bet 3 a committed goal?** ✅ **Decided: yes** — see §5.3. Steps 16a
   and 17 in `ROADMAP.md` schedule it, and §6's CSP exception is the price.
3. **Tauri v2 plugin specifics.** Still open, and still the right instinct:
   confirm current plugin APIs (fs scope, dialog, store) against Tauri v2
   docs at implementation time rather than from memory — plugin surfaces
   shift between versions.
4. **Distribution burden.** ✅ **Decided: deferred, deliberately.** Nothing
   distribution-shaped — public deploy, tagged releases, contributor
   onboarding, signed installers — starts until `ROADMAP.md` §2's definition
   of finished is met. The product gets finished before it gets distributed.
   One exception is worth taking immediately: the repository is public with
   no LICENSE, which legally means all rights reserved. That is hygiene, not
   distribution.
5. **How far the app suite grows.** Open. The current answer is "fill the
   obvious holes, then stop" — markdown preview (shipped), PDF, a code
   editor, a few small utilities, plus Notes' inline WYSIWYG (`ROADMAP.md`
   D9) as a further refinement. A spreadsheet or a drawing app would be a new
   decision; §6's "coherence over sprawl" is the tie-breaker.
