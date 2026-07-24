# Browser support matrix (F4)

**Status:** Phase 12. This documents what's already true today; it doesn't
add new CI — `.github/workflows/ci.yml`'s `e2e` job already runs the full
Playwright suite as three parallel per-engine jobs
(`chromium`/`firefox`/`webkit`, `playwright.config.ts`), so the "CI-test
Chromium/Firefox/Safari" half of F4 was met before this phase started.

## Officially supported

| Engine   | Playwright project | Represents            |
| -------- | ------------------- | ---------------------- |
| Chromium | `chromium`           | Chrome, Edge, Brave, … |
| Firefox  | `firefox`            | Firefox                |
| WebKit   | `webkit`             | Safari (macOS/iOS)     |

All three run the full E2E suite on every PR. A change that only passes on
one or two engines is a regression, not a platform quirk, unless it's
recorded below.

## Known-handled cross-engine differences

- **IndexedDB unavailable (Safari private browsing, or any browser with
  storage disabled).** `idbAdapter.ts`/`idbBlobStore.ts` detect
  `typeof indexedDB === "undefined"` and degrade to an in-memory
  `StorageAdapter`/`BlobStore` — the OS still boots and is fully usable,
  it just doesn't persist across a reload. Covered by
  `e2e/private-mode.spec.ts` (scenario #14 in `ARCHITECTURE.md`'s catalog).
- **Window drag/resize** is implemented on the standard Pointer Events API
  with explicit `setPointerCapture` (`Window.tsx`) rather than a
  library — chosen specifically so drag/resize/snap behave the same on all
  three engines without engine-specific branches. `pointercancel` (fired
  instead of `pointerup` when the browser itself takes over a gesture, e.g.
  a native drag) is handled explicitly for the same reason.
- **`navigator.storage.persist()`** (F1) is fully feature-detected —
  browsers that don't implement it (or refuse the grant) fall back to
  showing "best-effort" in Settings › About rather than throwing.

## Known engine-specific gaps (accepted, not bugs)

- **PWA installability differs — don't claim parity.** Chromium exposes a
  real install prompt (`beforeinstallprompt`) and installs `manifest.webmanifest`
  as written. Firefox desktop has no install UI for the manifest at all.
  Safari has no `beforeinstallprompt` either — the only path is manual
  "Add to Home Screen", which reads a narrower, non-standard subset of the
  manifest (notably: no `display: "standalone"` chrome control the way
  Chromium honors it, and it prefers `apple-touch-icon` over the manifest's
  icon list, which is why `index.html` sets both). UI copy and docs should
  say "install" generically and never promise a native prompt on Safari or
  Firefox.
- **Playwright's WebKit driver cannot reload a page against
  `context.setOffline(true)` while a service worker is active** — throws
  "WebKit encountered an internal error" (confirmed reproducible, not a
  timing flake). This is a Playwright/WebKit **test-driver** limitation, not
  a real-Safari runtime bug — the equivalent mid-session offline scenario
  (no reload involved) passes on WebKit fine. `e2e/offline.spec.ts`'s
  airplane-mode-boot test is scoped to Chromium/Firefox only, same pattern
  already used for `files.spec.ts`'s native drag-and-drop and
  `a11y-reduced-motion.spec.ts`'s `prefers-reduced-motion` emulation.

## Revisit when

- A future Playwright/WebKit release fixes the reload+offline+SW driver
  error above — try dropping the `test.skip` in `e2e/offline.spec.ts`.
- Safari or Firefox ship `beforeinstallprompt`-equivalent install UI — the
  "don't claim parity" note above would need updating.
