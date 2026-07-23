# Sandboxed third-party apps + in-app Browser — design note

**Status:** design for review · Phase 15+ (Platform & collaboration)
**Maps to:** roadmap **D8** (third-party app SDK, XL) + **G2** (app
sandboxing model, L), whose starting sketch is Appendix A.5. The in-app
Browser is **not** in the current roadmap — it is net-new here, and shares
the iframe-host scaffolding with the app SDK, which is one reason to build
that scaffolding once.
**Gate:** both features introduce untrusted-content surfaces (R7) and the
Browser proxy path (§B.3) would break "runs entirely client-side." Nothing
here ships until the shapes below are agreed; the proxy in particular needs
an explicit Open-Decisions sign-off, not a quiet merge.

---

## 0. Grounding — what already exists in our favor

Both features lean on machinery that is already in place; neither is a
rewrite:

- **Single app-mount point.** `Window.tsx` does `const AppComponent =
  app.component` (~line 138) and renders it (~line 352) inside `<Suspense>` +
  `<WindowErrorBoundary>`. This is the **only** place a manifest becomes a
  live app surface. Both features branch here.
- **The launch bridge is kind-agnostic.** `launchApp` → `openWindow`
  (`system/apps/launch.ts`) reads only `id/name/size/minSize/singleInstance/
  payload`. Iframe apps and the Browser launch through the identical path
  with no changes.
- **`FileSystemProvider`** (`system/fs/provider.ts`) is already the async,
  React-free, app-facing API — exactly the thing to expose over the bridge.
  **Caveat that drives the whole security model:** it is *id-based over the
  entire tree* (`readFile(id)`, `move(id, newParentId)`) with **no scoping**.
  A caller can address any node. The raw provider must therefore **never** be
  handed to a sandboxed app (see §A.4).
- **Feature flags** (`system/flags.ts`) — the dark-ship seam. Add
  `third_party_apps` and `browser`; gate manifests in `registry.ts` exactly
  as `e2e_crash` gates `devCrashApp` today.
- **CSP** (`vite.config.ts`) — currently `script-src 'self'`,
  `connect-src 'self'`, and **no `frame-src`**, so it inherits
  `default-src 'self'`: external iframes are *already blocked* in the
  production build. Both features must touch this.

**One correction to a common assumption:** Phase 13's backend (**A1**,
Appendix A.3) is an auth + fs-ops + blob + WebSocket-delta service. A
header-stripping browsing proxy is a *different* workload with different
scaling and abuse characteristics. It can share A1's deployment scaffolding
but is not the same service, and must not be conflated with it (see §B.3).

---

## Feature A — Sandboxed third-party app ecosystem

### A.1 Manifest & registry changes: two app *kinds* side by side

Make `AppManifest` a discriminated union on a new `kind` field, defaulting to
today's behavior so no first-party manifest changes:

```ts
type AppManifest = ReactAppManifest | SandboxAppManifest;

interface ReactAppManifest extends AppManifestBase {
  kind?: "react"; // default; component required for this kind
  component: LazyExoticComponent<ComponentType<AppWindowProps>>;
}

interface SandboxAppManifest extends AppManifestBase {
  kind: "sandbox";
  entry: { url: string } | { srcdoc: string };
  capabilities: Capability[];
  version: string;
  installOrigin?: string; // remote apps only; used for frame-src + which URL to load
}
```

`AppManifestBase` keeps every shell-facing field the dock, menu bar, and
window manager already render generically — `id/name/icon/tileGradient/
defaultSize/minSize/menus/singleInstance/dockZone/pinned`. **Only the body
differs**, so the manifest seam holds: the shell keeps treating apps as data.

`serializePayload`/`restorePayload` stay available, but a sandbox app can't
run JS at save time, so for it these are a plain JSON passthrough the shell
performs — not an app-supplied hook.

**Registry** (`system/apps/registry.ts`): keep the static `apps` array for
first-party. Add a second source — a persisted `useInstalledAppsStore`
holding installed sandbox manifests — and have the apps list + `getApp` merge
both. `byId` becomes a live lookup over the union rather than a build-time
`Map`. This is the install seam (§A.5).

**Window mount** (`Window.tsx`): branch on `app.kind`:

```tsx
{app.kind === "sandbox"
  ? <SandboxHost app={app} win={win} focused={focused} />
  : <AppComponent windowId={win.id} focused={focused} payload={win.payload} />}
```

`SandboxHost` is a new **first-party** component owning the `<iframe>`, the
MessageChannel handshake, and bridge dispatch. It sits *inside* the existing
`WindowErrorBoundary` + `Suspense`, so a crashing/hanging iframe is contained
by machinery that already exists.

### A.2 The bridge: promise-based postMessage RPC

- **Transport: `MessageChannel`, not raw `window.postMessage`.** On iframe
  `load`, `SandboxHost` posts `{ type: "kagami:init", capabilities }` to
  `iframe.contentWindow` and **transfers `port2`**, keeping `port1`. All RPC
  then flows over the port. A port is unforgeable and bound to that exact
  frame — no other frame, extension, or nested content can send on it. This
  is what makes origin validation tractable under a null-origin sandbox
  (§A.3).
- **Message shape:** `{ id, method, params }` →
  `{ id, ok: true, result }` or `{ id, ok: false, error: { code, message } }`.
  A tiny SDK (`kagami.js`, which apps include) wraps this as
  `kagami.fs.readDir(path).then(...)`.
- **Method surface (v1):** a **path-based facade over `FileSystemProvider`
  scoped to the app's root** (§A.4) — `fs.readDir/readFile/writeFile/mkdir/
  move/rename/delete/stat`, plus `notifications.notify`, `window.setTitle`,
  and host-mediated `ui.pickFile`/`ui.saveFile`. **Not** in v1: clipboard,
  raw node-id access, network, other apps' data.
- Every call is validated and capability-checked **in the shell** before it
  reaches the provider. The iframe is never trusted to self-limit.

### A.3 Origin & message validation

- A sandbox with `allow-scripts` but **without** `allow-same-origin` runs at a
  **null origin**: its messages arrive with `event.origin === "null"`, and
  *every* null-origin frame shares that value — so origin allow-listing is
  useless and actively misleading. Hence the **MessageChannel handshake is
  mandatory**: trust comes from *who holds the port*, established during the
  one `load`-time `postMessage` where the target *can* be pinned
  (`iframe.contentWindow`, with `event.source === iframe.contentWindow`
  verified).
- **Inbound hardening on the port:** schema-validate every message
  (method in allow-list, params typed), enforce per-app capability grants,
  rate-limit (no `writeFile` spam), and cap payload sizes against the 64 KB
  inline / blob threshold (`fs/types.ts` `BLOB_INLINE_THRESHOLD`).
- **Remote apps** (§A.5) keep `allow-same-origin` **off** regardless, so they
  can't reach their own origin's cookies/storage; they still run null-origin
  and still use the port. `installOrigin` decides only *what URL to load* and
  the CSP `frame-src` entry — never a runtime trust signal.

### A.4 Capability & security model — the scoped-VFS question

Answer to "scoped subtree vs. per-app user grant": **both, layered.**

1. **Default: a per-app private data dir, no prompt.** On install, create
   `/Apps/<app-id>/` (hidden system folder; syncs like any file per Appendix
   A.5). The bridge exposes a **path-based facade rooted at that folder** —
   the app sees `/` as its own root; the facade resolves app-relative paths
   to real node ids *within the subtree only* and rejects anything resolving
   outside. **Essential because `FileSystemProvider` is id-based over the
   whole tree** — never expose it raw. New module `system/apps/sandboxFs.ts`
   does path→id resolution against a fixed root and re-checks
   `isDescendantOf(root)` on every op (helper already exists).
2. **Beyond its sandbox: explicit, per-path user grant.** Access to real user
   folders requires a manifest-declared capability (e.g.
   `fs.read:/Home/Documents`) shown on a **first-run consent screen**,
   revocable in Settings. Grants live in the installed-apps store.
3. **Prefer host-mediated pickers over standing grants.** `ui.pickFile` /
   `ui.saveFile` let an app touch a *user-chosen* file without holding
   blanket read — the ergonomic the File System Access API uses. This is the
   *encouraged* path; broad `fs.read:/Home` grants are the escape hatch.

Enforcement lives entirely shell-side, per-call on the port. The manifest's
declared capabilities are a **ceiling**; the user's grants are the **actual**
allowance.

### A.5 Installation / registration

**Start fixed-local, design for remote.**

- **v1 — curated/bundled set.** Register sandbox manifests the way
  `devCrashApp` is gated in `registry.ts`, loading from `entry.srcdoc` or
  same-origin bundled paths. No install UI, no network manifest fetch. This
  hardens the bridge against *friendly first-party* code first — Appendix
  A.5's "first consumers are first-party" (the D1 markdown renderer, D6 PDF
  viewer render in this sandbox before any external code does). **This is the
  right v1.**
- **v2 — manifest-URL install (Puter-style).** An "Install App" flow takes a
  manifest URL, fetches + validates the JSON (id uniqueness, capability
  sanity, version), shows the consent screen, writes the manifest into
  `useInstalledAppsStore`, and creates `/Apps/<id>/`. Bundles live in the VFS
  under `/Apps` so they sync for free. Uninstall removes the manifest, the
  data dir, and the grants.

### A.6 CSP interaction

- **Bundled/srcdoc apps (v1):** `frame-src 'self' blob:`. No `script-src`
  change — the *host* page still emits no inline scripts; the iframe's own
  scripts run under its `sandbox` attribute, not the host `script-src`.
- **Remote apps (v2):** add each app origin (or a single
  `apps.kagami.example`) to `frame-src`. A real widening — keep it behind the
  `third_party_apps` flag.
- The **`sandbox` attribute is the real containment**: `sandbox="allow-scripts"`
  only for v1 — no `allow-same-origin`, `allow-top-navigation`,
  `allow-popups`, `allow-forms` unless a specific app justifies each *and* the
  user consents. Grant those per-capability, never blanket.

### A.7 Phasing (Feature A)

1. Manifest union + `SandboxHost` + MessageChannel bridge + path-scoped
   `sandboxFs` facade, behind `third_party_apps`, with **one bundled
   first-party sandbox app** as the proving ground (a trivial "Hello FS", or
   the markdown preview). Unit-test the facade's path-scoping and capability
   checks as pure functions (node-env, framework-free — matches our test
   convention).
2. Consent screen + Settings revocation + `/Apps` data dirs + persisted
   installed-apps store.
3. Remote manifest-URL install + CSP `frame-src` widening — the point where
   "third-party" becomes literal.

---

## Feature B — In-app Browser

### B.0 Recommendation up front

**Ship a bare-iframe Browser as v1, honestly scoped, with a clear "this site
can't be embedded" fallback. Do not build the proxy now.** A bare iframe is
*not* a non-starter — a meaningful slice of the web frames fine, and the
honest failure state reads as a deliberate limitation rather than a bug *if*
presented well. The proxy is a genuine architecture change (breaks "runs
entirely client-side"), carries real legal/security/abuse weight, and belongs
to a later, explicit decision.

### B.1 What actually breaks with a bare iframe

Three buckets:

- **Frame fine:** most docs sites, many blogs, embeddable widgets, some
  wikis (Wikipedia frames), anything we host. The reference-y web largely
  works.
- **Blocked outright:** anything with `X-Frame-Options: DENY/SAMEORIGIN` or
  CSP `frame-ancestors 'none'/self` — i.e. *most* high-value interactive
  sites (Google, most banks, most social, GitHub; YouTube main site, though
  `youtube.com/embed/` works). The frame loads blank/errored.
- **Loads but degrades:** `SameSite` cookie loss breaks many third-party
  logins; `postMessage` features, popups, and top-navigating OAuth flows
  misbehave.

**Detection is the UX problem:** you generally can't read *why* a cross-origin
frame failed (no reliable error event for XFO; the frame's content is
opaque). Practical approach: a **load-timeout heuristic** (no `onload` within
N seconds, or a blank/inaccessible document → show the fallback), paired with
a small curated hint list of known-blocked domains for instant, non-flaky
messaging.

**Verdict:** a v1 scoped to "sites that allow framing," with a
**"This site blocks embedding — Open in new tab ↗"** fallback card, is a
reasonable, honestly-scoped start. Message it as *"Kagami Browser embeds
sites that permit it,"* not as full browsing.

### B.2 What a bare iframe still needs (no proxy)

Real work, independent of any proxy:

- **`sandbox`:** to let real sites function this is far more permissive than
  Feature A — realistically `allow-scripts allow-same-origin allow-forms
  allow-popups allow-popups-to-escape-sandbox
  allow-top-navigation-by-user-activation`. Note `allow-scripts
  allow-same-origin` means the framed site runs with its origin's full
  powers. That is expected for a browser, but it makes **the Browser app
  categorically less contained than Feature A's apps — keep them as separate
  trust models.**
- **`allow` (Permissions Policy):** per-feature —
  `camera; microphone; geolocation; fullscreen; clipboard-write`. Default-deny
  the sensitive ones (camera/mic/geo); a per-site prompt can come later.
- **CSP `frame-src`:** the blocker — today there is none, so external frames
  are blocked in production. v1 needs either `frame-src https:` (any https
  site — broad, but this *is* a browser) or a **user-managed origin
  allow-list** compiled into `frame-src`. Recommend starting with
  `frame-src https:` behind the `browser` flag, then revisit narrowing.
- **Navigation/history plumbing:** you **cannot read a cross-origin iframe's
  URL** after in-frame navigation (SOP), so the address bar can't track where
  the user browsed to. What you *do* control, host-side: Back/Forward over the
  URLs the user explicitly entered (a `browserStore` history array), reload
  (re-assign `iframe.src`), stop. In-frame link clicks that stay in the frame
  are invisible in v1 — accept this; don't try to intercept in-frame
  navigation without the proxy, you can't do it cleanly.

This (sandbox tuning, permissions policy, CSP entry, host-side history, the
fallback card) is a shippable, coherent app on its own.

### B.3 The proxy path — later, and deliberately

Only if bare-iframe scope proves too limiting:

- **Piggyback Phase 13, or separate service? Separate** (verified against
  ROADMAP): A1 is auth + fs-ops + blob + WebSocket deltas; a browsing proxy is
  a different workload (arbitrary egress, HTML/header rewriting, an abuse
  magnet per R5). It can *deploy alongside* A1 and reuse its auth/rate-limit
  scaffolding, but should be its **own minimal service on its own origin** —
  which you want anyway for isolation. Building it *before* A1 means standing
  up backend infra early, against the roadmap's "local desktop excellent
  before backend" ordering — another reason to defer.
- **Security tradeoffs (the serious part):** a header-stripping proxy relays
  arbitrary third-party HTML+JS into a context you control. Served
  **same-origin as the desktop, that content can read the desktop's
  `localStorage`, IndexedDB (the entire VFS), and cookies — a total
  compromise.** Containment, strongest last:
  - **Dedicated origin (mandatory):** serve proxied content from
    `browser-proxy.kagami.example`, never the app origin. SOP then isolates
    cookies/storage.
  - **Nested sandbox:** still frame the proxied page in a `sandbox`ed iframe
    on that dedicated origin.
  - **Scope the proxy itself:** strongest is a **read-mostly,
    script-stripped** proxy (strip `<script>`, serve inert HTML) behind an
    **origin allow-list** — closer to reader-mode than a browser. Kills most
    interactivity but removes the "arbitrary script relayed through our infra"
    risk. A general-purpose, script-executing, arbitrary-URL proxy is the most
    dangerous option and should not ship without a dedicated origin *and*
    strong abuse controls.
- **Legal / ethical — a real consideration, not an implementation detail:** a
  header-stripping proxy deliberately overrides sites' explicit
  `X-Frame-Options` / `frame-ancestors` directives — the operator saying "do
  not embed me," circumvented — while relaying their content through our
  origin. This raises ToS-violation, clickjacking-facilitation, and
  CFAA-adjacent concerns, plus the R5 abuse surface (piracy/malware relay,
  surprise egress bills). **This belongs in ROADMAP §6 Open Decisions with an
  explicit sign-off, not a quiet merge.**
- **CSP impact:** proxied → `frame-src https://browser-proxy.kagami.example`
  only (the proxy origin carries its own strict CSP); bare-iframe → as §B.2.

### B.4 Where to draw the Browser line

- **Now:** bare-iframe Browser (manifest, address bar over user-entered URLs,
  host-side history/back/forward/reload, tuned `sandbox` + `allow`,
  `frame-src https:` behind the `browser` flag, honest "can't embed → open
  externally" fallback). Fully client-side; no roadmap violation.
- **Later (own decision, needs sign-off):** if scope proves too tight, a
  **dedicated-origin, allow-listed, script-stripped reader proxy** as a
  sibling service reusing A1's infra — *after* Phase 13, gated, with the legal
  question answered first. A general header-stripping browsing proxy:
  recommend against, or at minimum treat as a separate product decision with
  its own risk review.

---

## Cross-cutting

- **Shared iframe scaffolding, separate trust models.** `SandboxHost`
  (null-origin, capability-bridged, no `allow-same-origin`) and the Browser
  frame (permissive, no bridge) must **not** share a component, but can share
  the low-level "managed iframe in a window" piece (lifecycle, load/timeout
  handling, `WindowErrorBoundary` integration). Build that thin piece once.
- **Flags:** add `third_party_apps` and `browser` to `flags.ts` `FlagId`; gate
  manifests in `registry.ts` like `e2e_crash`.
- **Testing** (node-env, framework-free — our convention): the high-value pure
  units are the path-scoping/capability facade (`sandboxFs`), the RPC message
  validator, and the browser history store. E2E: a bundled sandbox app doing
  an fs round-trip through the bridge; a Browser load of an embeddable fixture
  plus the fallback card on a blocked one.
- **File layout:** `src/apps/browser/` (Feature B), `src/system/apps/sandbox/`
  (SandboxHost, bridge, `sandboxFs` facade, SDK),
  `system/apps/installedAppsStore.ts`. Update `ARCHITECTURE.md`'s
  app-manifest and CSP sections when the manifest becomes a union — that's a
  seam change the doc explicitly tracks.
- **Roadmap placement:** Feature A = D8 + G2 (already Phase 15+); this note
  sequences its sub-steps. Feature B is unlisted — slot the bare-iframe
  version as a Phase 15 D-series item (backend-independent), and the proxy as
  a post-Phase-13, sign-off-gated addendum.

---

## Open decisions (need sign-off before the affected work)

1. **Feature B v1 CSP breadth** — `frame-src https:` (any site, simplest,
   "it's a browser") vs. a user-managed origin allow-list (safer, more
   friction). Leaning `https:` behind the `browser` flag.
2. **The proxy question at all** — whether a header-stripping proxy is even on
   the table given the legal/abuse weight; the answer shapes how the Browser's
   scope is messaged to users (§B.3).
3. **Remote app distribution (A.5 v2)** — manifest-URL install vs. a curated
   registry only; determines whether `frame-src` ever admits arbitrary
   external origins.
