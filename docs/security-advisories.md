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
