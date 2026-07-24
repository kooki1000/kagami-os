# Resolved: Browser child webview landed too high (N4, macOS)

**Status: fixed (2026-07-24).** The vertical offset is resolved on
`fix/browser-webview-offset`. Root cause and fix are below; the original
investigation notes follow for context.

## Symptom (as reported)

With a Browser window focused, the native child webview rendered ~32px higher
than its slot: it covered the 40px address bar (which "disappeared" the moment
the window was focused), and a dead band of the same height showed between the
page's bottom edge and the window's bottom edge. Width, height, and x were
correct — a pure vertical translation. Unfocused windows looked correct because
the child webview is hidden then, exposing the DOM's own (correctly placed)
address bar.

## Root cause (settled from AppKit, not screenshots)

The host (`main`) window renders with a **full-size content view** — the native
title bar overlaps the web content rather than sitting above it. Measured live
via `NSView`/`NSWindow` frame introspection:

- content view (wry's `WryWebViewParent`) frame = 1280×**800**;
- the main webview fills it exactly (1280×800 `NSView`);
- but the main webview's **DOM viewport is 1280×768** — WebKit insets the DOM
  downward by the title-bar height (~32px), so **DOM `(0,0)` sits ~32px below
  the content view's top**.

The frontend measures child-webview bounds in **DOM** coordinates, while wry
positions child webviews in the **content view's** coordinate space
(`window_position` flips `y` against `WryWebViewParent.frame().height`, which is
unflipped — confirmed in `wry-0.55.1/src/wkwebview/mod.rs`). Those two spaces
differ by the title-bar inset, so a child sent at DOM `y=122` was placed at
content-view `y=122` — ~32px too high.

This also explains two earlier red herrings:

- `inner_position == outer_position` (so "native title bar = 0"): a full-size
  content view spans the whole window, so Tauri reports equal inner/outer
  positions on macOS (cf. tauri-apps/tauri#10021). There _is_ a native title
  bar (the standard traffic lights are visible); the API just doesn't reflect
  it.
- The reverted `decoration_offset` (`outer_size − inner_size`) was a **no-op**
  here — with a full-size content view, outer == inner — which is why the one
  prior attempt "still showed the offset."

All read-back paths were confounded and should not be trusted for this:
`window.screenX/Y` from a child webview reports the shared `NSWindow`'s position
(identical for every webview in the window), and wry's `webview.bounds()`
inverts the same transform it set. The decisive measurements were the raw
`NSView` frames plus the main webview's DOM `innerHeight`.

## Fix

`src-tauri/src/browser.rs` shifts the child's `y` down by the content-view
inset before positioning:

```
inset = contentView.frame.height − NSWindow.contentLayoutRect.height
```

`contentLayoutRect` is the title-bar-excluded safe area, so this equals the
inset exactly, and is **0 for normal and borderless windows** — the
compensation is a no-op except precisely when the inset exists. The value never
changes for a given window chrome, so it's read once on the main thread (AppKit
frame reads are not thread-safe; computed from `browser_open`, which runs off
the main thread, so the round-trip can't deadlock) and cached in a `OnceLock`.
Applied in both `browser_open` and `browser_set_bounds`.

Deps added (macOS only, pinned to the versions wry/tao already pull in to avoid
a duplicate `objc2` in the tree): `raw-window-handle`, `objc2-app-kit`,
`objc2-foundation`.

### Verified

`pnpm tauri dev`, Browser focused: address bar visible, page starts directly
below it, no bottom dead band; drag/resize keeps the webview aligned (exercises
`browser_set_bounds`).

## Two adjacent bugs fixed alongside (were live on `main`)

Both were reverted with the earlier attempt and are restored on this branch;
they produced overlapping symptoms and are correct independent of the offset:

- `9298823` — bounds were measured via `getBoundingClientRect()` during the
  window enter animation (`transform: scale(0.96)` folded into the measurement,
  never re-measured). Bounds now derive from the store rect plus the
  title-bar/address-bar chrome (`CHROME_HEIGHT` in `BrowserApp.tsx`).
- `ea31c79` — the visibility/bounds sync effects skipped their first run,
  dropping any change between the open render and the first effect execution.
  Effects now re-send every run (both Rust commands are idempotent).

## If it regresses

The inset is cached once and does not track chrome changes at runtime (e.g.
entering native fullscreen removes the title bar → inset should become 0 but the
cache holds the old value). This is out of scope for the reported bug; if a
fullscreen child-browser case ever matters, recompute per call (guard against
`browser_set_bounds` running on the main thread to avoid a `run_on_main_thread`
deadlock) or invalidate the cache on the relevant window events.
