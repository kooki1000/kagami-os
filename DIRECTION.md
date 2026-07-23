# Kagami OS — Product Direction

**Status:** direction set · July 2026
**Baseline:** phases 1–11 shipped (see `ARCHITECTURE.md` § Phase status)

This is the "where is Kagami going and why" document. `ARCHITECTURE.md`
describes what exists; `ROADMAP.md` enumerates the feature backlog toward a
full online desktop. This document sits above both: it states the strategic
shift the project is making, the bets that follow from it, and the
guardrails that keep those bets from turning a tight, coherent desktop into
a sprawling one.

If you read only one section, read [§2 The shift](#2-the-shift) and
[§4 The dual-target principle](#4-the-dual-target-principle).

---

## 1. Where we are

Kagami OS today is a **browser-based desktop environment** — a windowing
shell, a virtual file system, and a suite of built-in apps, running entirely
client-side. Phases 1–11 are shipped: the shell, window manager, VFS with a
content-addressed blob store, the app suite (Files, Notes, Viewer, Terminal,
Media Player, Settings), desktop icons, session restore, ⌘K search, and an
accessibility pass.

Its defining qualities today are that it is **coherent** (one design
language, from the "Lagoon" prototype) and **locked down** (a strict CSP,
no untrusted code paths, everything `'self'`). It ships exactly one way:
as a website you open in a browser tab.

## 2. The shift

**Kagami is becoming a desktop environment that runs two ways:**

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
equivalent elsewhere). That folder *is* the virtual disk — a real place on
disk, sandboxed to Kagami, that other apps' file pickers don't wander into.

We chose an **app-owned hidden folder** over asking the user to pick a
folder on first run: it removes the onboarding step and the persisted-scope
permission problem, and it matches the current all-in-one VFS model — the
disk is Kagami's, managed by Kagami, not a corner of the user's `Documents`.

### 3.2 A built-in web browser

A "Browser" app that renders arbitrary third-party websites **only works in
the native build.** In the web build it is effectively impossible: most
sites send `X-Frame-Options` / `frame-ancestors` headers that forbid being
embedded in an iframe, and CORS blocks proxying them. In the native build we
spawn a **native child webview** that can navigate anywhere, and build
browser chrome (tabs, address bar, history) around it.

This makes the Browser the clearest *showcase* of why native matters — it is
a capability the web version fundamentally can't have.

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
web-only tax — it matters *more* in the native build, sitting next to
filesystem access.

## 5. The three bets, sequenced

Each bet is independently shippable. They are ordered so the contained,
high-confidence work comes first and each unlocks the next.

### 5.1 Bet 1 — Native shell + isolated filesystem *(do first)*

Wrap the existing web app in a Tauri window and back the VFS with the hidden
app-data folder (§3.1). New `StorageAdapter` + `BlobStore` implementations
behind the existing seam; a runtime `isTauri()` switch at the two singleton
construction points (`fsStore.ts`, `blobStore.ts`). No shell or app code
changes.

This is the contained, high-confidence step and the **foundation** the other
two bets sit on. It proves the packaging, the seam swap, and the CSP
reconciliation with the least surface area.

### 5.2 Bet 2 — Built-in Browser *(second)*

A generic "Browser" app over a native child webview (§3.2): tabs, address
bar, history, back/forward. Desktop-only; the web build shows it as
unavailable. Medium lift, low architectural risk — and the feature that best
demonstrates why the native tier is worth installing.

### 5.3 Bet 3 — Third-party app ecosystem *(a deliberate platform decision)*

The biggest lift, and a genuine fork in what Kagami *is*. Third-party apps
cannot be bundled TypeScript loaded into our own React tree — they must be
**web apps in sandboxed iframes**, talking to the OS through a **capability-
scoped postMessage bridge**, gated by a permission model (this app may read
the VFS; that one may not). This is exactly the `G2` sandbox model and `D8`
third-party-app SDK already in `ROADMAP.md`, now with a native angle.

What it forces, and why it is a *decision* rather than just a feature:

- The strict CSP has to **open up** for a `frame-src` of foreign origins and
  a sandboxed-iframe host — a real change to the security posture (§4 keeps
  the CSP strict everywhere else).
- "The app list is a TypeScript array" becomes "there is an app registry, an
  SDK contract, a permission system, and an install/uninstall UI" — most of
  what makes a platform a platform.

Do this only after deciding Kagami should be an **ecosystem** rather than a
polished self-contained shell. Bets 1 and 2 do not depend on it.

## 6. Guardrails — what stays true

These hold across every bet above. They are what keep the project coherent
as it grows.

- **Design language is fixed.** The Lagoon prototype constraints in
  `ARCHITECTURE.md` bind: monochrome-at-rest window controls with the
  coral+teal duotone focus tint (never a traffic-light triad), rounded-
  square dock tiles without magnification, Inter / JetBrains Mono, generic
  app names, palettes only from the documented directions. **No Apple or
  Puter naming or assets** — Puter (the open-source "internet OS") is a
  *reference we studied* for the third-party-app model, not a source of
  branding or code.
- **Local-first.** Both builds boot and work with no network. Persistence
  degrades gracefully — if the native disk folder or IndexedDB is
  unavailable, the OS still boots in-memory rather than hanging. Accounts
  and sync (the `ROADMAP.md` online track) are additive, never a
  precondition to using Kagami.
- **Strict CSP in both builds** (§4). Loosened only for the third-party
  sandbox, and only as far as that sandbox requires.
- **Coherence over sprawl.** Puter's ideas are adopted **deliberately and
  sequenced**, not imported wholesale. The risk in chasing a full cloud-OS
  clone is turning a tight desktop into a sprawling one with a much larger
  attack surface. Every bet ends shippable; scope moves right rather than
  quality dropping.

## 7. How this relates to the online-desktop roadmap

`ROADMAP.md` describes a second, **parallel** track: accounts, a backend,
sync across devices, and sharing — the "online" in "online desktop." The two
tracks are independent and share the same seams:

- Both swap the **same `StorageAdapter`/`BlobStore`** interface — the online
  track for a remote/API adapter, the native track for a filesystem adapter.
  A device could eventually be *both* (native app with an account that syncs)
  because both are just adapters behind one seam.
- The third-party sandbox (§5.3) is the same `G2`/`D8` work already planned.

Sequencing between the tracks is a scheduling choice, not a technical
dependency. Neither blocks the other.

## 8. Technical approach (sketch)

Design-sketch altitude only — a full design note (in `docs/`, following the
`docs/blob-architecture.md` precedent) and an implementation plan come when
Bet 1 actually starts.

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
  at `fsStore.ts` and the equivalent in `blobStore.ts`. Everything above the
  seam is untouched.
- **CSP:** the build-time meta-tag CSP (`vite.config.ts`) still applies
  inside the webview; Tauri plugin calls go over IPC, not `fetch`, so this
  likely needs no change — verify empirically in `tauri dev` and add only
  the specific directive the webview asks for if a violation appears.
- **Out of scope for the first pass:** the desktop build/release pipeline
  (code signing, notarization, auto-update, per-OS matrix — `ci.yml` has no
  build/artifact job today), and desktop e2e (Playwright can't drive a Tauri
  window; needs `tauri-driver`). Both are follow-ups once the local dev loop
  works.

## 9. Open decisions

Revisit these before the affected bet, not now:

1. **Web-target longevity.** Keep the website as the permanent baseline
   (current stance, §2), or eventually treat it as deprecated once native is
   the primary product? The seam makes "keep both" cheap; the deciding
   question is whether the try-by-link demo stays valuable. **Current
   answer: keep the link.**
2. **Is Bet 3 a committed goal?** The third-party ecosystem reshapes the
   security model and distribution story. Treat it as a separate "become a
   platform" go/no-go, made after Bets 1–2 ship — not folded silently into
   the pivot.
3. **Tauri v2 plugin specifics.** Confirm current plugin APIs (fs scope,
   dialog, store) against Tauri v2 docs at implementation time — plugin
   surfaces shift between versions; don't assume from memory.
4. **Distribution burden.** Native means owning installers, code signing,
   Apple notarization, per-OS builds, and auto-update — a real ongoing cost
   the web build gives for free. Budget for it before promising installable
   releases.
