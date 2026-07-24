# Known issue: Browser child webview lands too high (N4, macOS)

**Status: open (2026-07-24).** Investigated this session, then reverted:
`fix/browser-webview-bounds` is back at `main`, so the three commits referenced
below (`9298823`, `ea31c79`, `76266ff`) survive only in the reflog — use
`git show <sha>` to read them. Two fixed adjacent bugs; the third is the
unverified offset compensation. The vertical offset itself remains unresolved.
This doc records the evidence, suspected cause, and what was tried so the next
attempt doesn't start from zero.

## Symptom

With a Browser window focused, the native child webview renders ~28–40 logical
px higher than its intended slot:

- it covers most or all of the 40px address bar (back/forward/reload + URL
  input), so the bar "disappears" the moment the window is focused (the
  webview is only shown while focused — by design, see the module doc in
  `src-tauri/src/browser.rs`);
- a dead band of the same height shows between the page's bottom edge and the
  window's bottom edge.

Width, height, and x placement are all correct — the error is a pure vertical
translation.

## Repro

`pnpm tauri dev` (needs Rust; web-only `pnpm dev` is unaffected — the DOM
fallback browser has no child webview), open Browser from the dock, focus the
window. Present on macOS 15 (Darwin 25.5.0), retina display (`scale_factor
= 2`), Tauri 2.11.3 / tao 0.35.3 / wry 0.55.1.

## What is verified (don't re-litigate these)

1. **The frontend sends correct bounds.** Confirmed by temporary Rust-side
   logging: for a 900×640 window at rect `(158, 52)` the frontend sends
   `(x=158, y=132, w=900, h=560)` — exactly `rect` plus the 40px window title
   bar and 40px address bar (`CHROME_HEIGHT` in
   `src/apps/browser/BrowserApp.tsx`). Main window `inner_size` was
   1280×800 logical at the time.
2. **Store `rect` is true DOM viewport coordinates.** `WindowLayer` is
   `absolute inset-0`; windows position with `left/top = rect.x/y`. The shell
   menu bar is a `fixed` overlay, not a layout offset.
3. **Two other bugs produced overlapping symptoms and were fixed this session
   (reverted with the rest — see Status; SHAs are in the reflog):**
   - `9298823` — bounds were measured via `getBoundingClientRect()` during the
     window enter animation (`transform: scale(0.96)` gets folded into the
     measurement, ~4% shrunken bounds, never re-measured). Bounds now derive
     from the store rect.
   - `ea31c79` — the visibility/bounds sync effects skipped their first run,
     dropping any change that landed between the open render and the first
     effect execution. During session restore this reliably left a stale
     webview visible over the focused window (offset by the 28px cascade
     step, which mimicked this offset bug). Effects now re-send every run.

   After both fixes, unfocused windows correctly show no webview and sizes
   are exact — but the focused window's webview still sits high.

## Suspected cause

Tauri's `Window::add_child` / `Webview::set_position` on macOS resolving `y`
against the wrong parent extent. wry's placement math for an **unflipped**
parent `NSView` is `y_bottom_left = parent_frame.height − y − height`; if the
`parent_frame` it reads includes the native title bar (window frame / root
view) while our coordinates are relative to the content view below it, the
webview lands exactly one title-bar-height (~28pt) too high — matching the
observed direction and rough magnitude.

**Unconfirmed alternative:** screenshot measurements of the shift ranged
~26–40px, and 40 happens to equal the *DOM* `TITLE_BAR_HEIGHT`. If the true
shift is exactly 40, the frontend's chrome accounting would be suspect
instead (e.g. the webview being placed relative to the window's *content*
element rather than the viewport). The measurements were eyeballed from
retina screenshots with ±10px slop, so 28-vs-40 was never settled.

## Tried and failed (or unverified)

The two commits above (`9298823`, `ea31c79`) fixed adjacent bugs, not the
offset. The one attempt aimed at the offset itself:

**Rust-side decoration compensation** — add
`(outer_size.height − inner_size.height) / scale_factor` (≈ native title bar
height, macOS-gated, zero elsewhere) to `y` in `browser_open` /
`browser_set_bounds`. Implemented in `src-tauri/src/browser.rs`
(`decoration_offset`) as commit `76266ff`, now **reverted (reflog only)**. A
post-change test still showed the offset, **but the test is not trustworthy**:
the screenshot was taken ~2 minutes after the edit and the binary may never
have rebuilt (no `Compiling app` was confirmed, and a rebuild takes ~45s). It
remains the leading candidate — never tested under controlled conditions.

## Next steps

1. **Retest the compensation properly.** Restore it (`git cherry-pick 76266ff`
   or reapply `decoration_offset`), kill any running `pnpm tauri dev`, start it
   fresh, wait for `Compiling app ...` then `Running target/debug/app` in the
   output, open a single Browser window, screenshot. If the bar shows and the
   bottom band is gone, keep the commit and close this.
2. **Settle 28 vs 40 from source, not screenshots.** Read the pinned sources
   (`~/.cargo/registry/src/index.crates.io-*/tao-0.35.3`, `wry-0.55.1`):
   does tao's content `NSView` override `isFlipped` (flipped ⇒ wry uses
   top-left `y` directly ⇒ no decoration offset possible, look at the
   frontend instead), and which view does Tauri pass as the child's parent?
   This was started but not finished.
3. **A diagnostic that removes screenshot ambiguity:** temporarily navigate
   the child webview to a `data:` URL that renders a red top-anchored ruler,
   and compare its origin against the address bar on screen. Note that
   logging `webview.position()` read-back is *not* decisive — it may invert
   the same (possibly wrong) transform and read back clean.
4. **Check upstream:** search tauri/wry issues for child-webview y-offset on
   decorated macOS windows (`add_child` + title bar). If it's a known bug,
   pin the workaround to the affected versions in a comment; a version bump
   may also simply fix it.
5. If the offset turns out to be the *DOM* 40px instead: audit where the
   Browser app's content actually renders relative to `rect` (`Window.tsx`
   title bar composition) before touching native code.
