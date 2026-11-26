# Security advisories: accepted and tracked

Dependency alerts that were investigated and deliberately left open, with
the reasoning, so nobody re-derives it or re-dismisses something that does
need fixing.

## GHSA-wrw7-89jp-8q8g — `glib` `VariantStrIter` unsoundness

**Dismissed as tolerable risk · 2026-07-24, rechecked 2026-11-26 ·
`src-tauri/Cargo.lock`**

Dependabot alert #3. `glib::VariantStrIter::impl_get` passed an immutable
reference to an out-argument pointer that `g_variant_get_child` writes to,
which recent rustc optimizations can turn into a null-pointer dereference.
Fixed upstream in `gtk-rs-core` 0.20.0
([gtk-rs/gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343)).

**Why it isn't patched:**

- `glib` comes in transitively: Tauri's webview crate `wry` needs `gtk` for
  its Linux backend (`webkit2gtk`). The `gtk-rs-core` family is released in
  lockstep, so getting `glib >= 0.20` means the whole stack moving together.
- No patched 0.18 or 0.19 release exists. As of the 2026-11-26 recheck,
  `wry` 0.58.1 requires `gtk ^0.19`, which pulls `glib` 0.19. Still short of
  the fix, and there's nothing to `cargo update` to.
- Linux only. macOS (`WKWebView`) and Windows (`WebView2`) builds never pull
  in `glib`.
- Not reachable from our code. Nothing under `src-tauri/src` or `src/` uses
  `Variant` iteration; any call site would be inside `wry` or `gtk-rs`.
- CI doesn't build the Tauri shell for any platform, so this gates nothing.

**Revisit when** `wry` (or the `tauri` requirement in `src-tauri/Cargo.toml`)
moves to `gtk-rs-core >= 0.20`. Then run `cargo update -p glib` and confirm
the alert closes on its own. Watch
[wry releases](https://github.com/tauri-apps/wry/releases).
