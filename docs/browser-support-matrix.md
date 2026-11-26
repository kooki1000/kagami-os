# Browser support matrix (F4)

Written in Phase 12 to record what was already true; it added no CI. The
`e2e` job in `.github/workflows/ci.yml` runs the full Playwright suite once
per engine (`playwright.config.ts`).

## Supported

| Engine   | Playwright project | Represents             |
| -------- | ------------------ | ---------------------- |
| Chromium | `chromium`         | Chrome, Edge, Brave, … |
| Firefox  | `firefox`          | Firefox                |
| WebKit   | `webkit`           | Safari (macOS, iOS)    |

All three run every spec on every PR. A change that passes on only one or two
engines is a regression unless the gap is listed below.

## Differences the code already handles

- **No IndexedDB** (Safari private browsing, storage disabled).
  `idbAdapter.ts` and `idbBlobStore.ts` fall back to in-memory stores. The OS
  boots and works but doesn't persist across a reload. Covered by
  `e2e/private-mode.spec.ts`.
- **Window drag and resize** use Pointer Events with explicit
  `setPointerCapture` (`Window.tsx`), not a library, so they behave the same
  on all three engines. `pointercancel` is handled explicitly for when the
  browser takes over a gesture.
- **`navigator.storage.persist()`** is feature-detected. Browsers that don't
  implement it, or refuse, show "best-effort" in Settings › About.

## Accepted gaps

**PWA install differs by engine, so never claim parity.** Chromium offers an
install prompt and honours the manifest as written. Firefox desktop has no
install UI at all. Safari's only path is "Add to Home Screen" (or "Add to
Dock"), which reads a narrower part of the manifest and prefers
`apple-touch-icon`, which is why `index.html` sets both. Copy should say
"install" generically. Chromium-only features planned in `ROADMAP.md` (F5's
file handler, B18's backup folder, F7's drag-out) follow the same rule: each
has a fallback, and nothing promises them on Firefox or Safari.

**Specs skipped on some engines.** Each is a test-driver limit, not a
runtime bug in the browser:

| Spec                                        | Runs on           | Why                                                                                                                            |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `files.spec.ts`, native drag-and-drop       | Chromium          | HTML5 drag-and-drop synthesis is unreliable in Playwright's Firefox and WebKit drivers                                         |
| `a11y-reduced-motion.spec.ts`               | Chromium          | `emulateMedia`'s `prefers-reduced-motion` is unreliable on Firefox and WebKit                                                  |
| `notes.spec.ts`, paste                      | Chromium          | Synthetic paste events aren't delivered on the other engines                                                                   |
| `offline.spec.ts`, airplane-mode boot       | Chromium, Firefox | WebKit's driver throws reloading against `setOffline(true)` with an active service worker; the mid-session offline case passes |
| `export-import.spec.ts`, download read-back | Chromium, Firefox | WebKit's driver can't read a finished download's bytes back                                                                    |

## Revisit when

- A Playwright release fixes WebKit's reload-while-offline or
  download-read-back errors: try dropping those `test.skip` calls.
- Firefox or Safari ship real install UI: update the PWA note.
