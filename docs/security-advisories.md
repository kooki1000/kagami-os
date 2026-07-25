# Security advisories — accepted / tracked

Dependency vulnerability alerts that were investigated and deliberately left
open rather than patched, with the reasoning recorded so nobody re-derives it
(or accidentally re-dismisses something that actually needs fixing).

---

## GHSA-wrw7-89jp-8q8g — `glib` `VariantStrIter` unsoundness

**Dismissed as tolerable risk · 2026-07-24 · `src-tauri/Cargo.lock`**

Dependabot alert #3. `glib::VariantStrIter::impl_get` passed an immutable
reference to an out-argument pointer expected by a variadic C function
(`g_variant_get_child`), which recent rustc optimizations can turn into a
null-pointer dereference. Fixed upstream in `gtk-rs-core` v0.20.0
([gtk-rs/gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343)).

**Why it's not patched:**

- `glib` isn't a direct dependency. It's pulled in transitively by `gtk
0.18.2`, which `wry 0.55.1` (Tauri's webview crate) requires for its Linux
  backend (`webkit2gtk`). The whole `gtk-rs-core` family (`glib`, `gio`,
  `gdk`, `gtk`, `cairo-rs`, `pango`) is released in lockstep, so getting
  `glib >= 0.20` means the entire stack has to move together.
- No patched `0.18.x` release exists — the fix only ever shipped starting in
  `0.20.0`. `wry 0.55.1` is the newest published version of `wry` (verified
  against crates.io) and still requires `gtk-rs-core ~0.18`, so there is
  nothing to `cargo update` to yet.
- Linux-only exposure: this only affects the `webkit2gtk` backend used on
  Linux Tauri builds. macOS (`WKWebView`) and Windows (`WebView2`) builds
  never pull in `glib`.
- Not reachable from our own code — nothing under `src-tauri/src` or `src/`
  touches `VariantStrIter`/`Variant` iteration directly; the only call sites
  would be internal to `wry`/`gtk-rs`.
- Not covered by CI either way: `.github/workflows/ci.yml` only builds/audits
  the web bundle (`pnpm audit`, lint, typecheck, unit + e2e tests) — it does
  not build the Tauri native shell for any platform, so this was never
  gating anything.

**Revisit when:** `wry` bumps its `gtk-rs-core` requirement to `>= 0.20`
(watch [wry releases](https://github.com/tauri-apps/wry/releases) or the
`tauri` Cargo.toml requirement in `src-tauri/Cargo.toml`); then `cargo
update -p glib` and confirm the Dependabot alert closes on its own.

---

## GHSA-mh99-v99m-4gvg — `brace-expansion` unbounded expansion DoS

**Ignored, temporary · 2026-07-25 · `pnpm-workspace.yaml`**

`brace-expansion <=5.0.7` (pulled in transitively via `@antfu/eslint-config`
→ `eslint`/`@eslint/config-array` → `minimatch`, ~100 paths per `pnpm why
brace-expansion`) is vulnerable to a DoS via unbounded expansion length. Fix
is published: `brace-expansion@5.0.8`.

**Why it's not patched yet:** `5.0.8` was published 2026-07-23 — inside this
workspace's own `minimumReleaseAge: 10080` (7-day) cutoff. `pnpm install`
refuses to resolve it (`ERR_PNPM_NO_MATURE_MATCHING_VERSION`) until it clears
that window, the same policy that has blocked other packages before (see the
`idb` precedent in `ARCHITECTURE.md`'s `StorageAdapter` section). Lowering
the global policy to let this one version through would weaken the same
supply-chain guard for every dependency, not just this one, so
`pnpm-workspace.yaml`'s `auditConfig.ignoreGhsas` carries this one specific
advisory instead — `pnpm audit` (and CI's unmodified `pnpm audit
--audit-level=high`) honors it natively, rather than the fix being skipped
silently.

Lint/eslint-tooling-only exposure: `brace-expansion` is pulled in by
devDependencies (ESLint's dependency graph) — it never ships in the built
app.

**Revisit after 2026-07-30** (7 days from `5.0.8`'s publish date): add
`postcss`'s neighbor entry — `brace-expansion: ^5.0.8` — to
`pnpm-workspace.yaml`'s `overrides`, run `pnpm install`, confirm
`pnpm audit --audit-level=high` is clean on its own, then remove the
`auditConfig.ignoreGhsas` entry and this section.
