# Review backlog (closed)

Findings from the full review on `review/full-audit`, 2026-07-18. **Every
entry is resolved.** Nothing in this file is open work. It stays as a record
of what was wrong and where the fix landed, so nobody re-investigates a
closed bug.

The original write-up (repro steps, measurements, proposed patches) is in
git history; see this file at commit `d5fc414`. The fixes that shipped with
the review itself are in `a9a6546`, `399993c`, `dfa2fa3` and `164eca2`.

## What was fixed, and where

`fix/persistence-hardening` and `fix/ui-interaction-backlog` were step 14;
`feat/notes-depth` and `feat/appearance-looks` were step 15.

| §   | Severity | Problem                                                                                                                                                                | Fix                                                                                                                                                          | Landed                       |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 1   | High     | Context menus opened downward past the viewport, because a hardcoded 200px guess was smaller than the real menu                                                        | Measure after mount and clamp (`useClampedPosition` in `ContextMenu.tsx`)                                                                                    | Phase 11                     |
| 2   | Medium   | The dock's context menu had no clamping on either axis                                                                                                                 | `Dock` reuses `ContextMenu`                                                                                                                                  | Phase 11                     |
| 3   | Medium   | Toasts past the fourth never started their timer and popped up ~6s later as if new                                                                                     | `notify()` stamps `expiresAt`; `ToastStack` prunes on one interval and renders oldest first. Closed T4 too                                                   | `fix/persistence-hardening`  |
| 4   | Medium   | An invalid rename left an unfocused field open and re-fired the error on every blur                                                                                    | `RenameInput`'s `onCommit` returns `boolean`; `false` keeps it open and refocuses. Shared validation in `system/fs/renameCommit.ts`                          | `fix/ui-interaction-backlog` |
| 5   | Medium   | `nodeSize` scanned the whole tree per folder row, quadratic and recomputed every render                                                                                | `folderSizes(nodes)`, one linear pass, memoized per `nodes` identity. Also stops a corrupt parent cycle from overflowing the stack                           | `fix/ui-interaction-backlog` |
| 6   | Medium   | Get Info wasn't modal to the keyboard: Delete, F2 and arrows acted on items behind it                                                                                  | Focus trap, and `FilesApp`'s window key handler is gated while it's open                                                                                     | Phase 11                     |
| 7   | Medium   | Reopening a track focused a Player window that had skipped to a different one                                                                                          | `PlayerApp` adopts a changed `payload` at render time; `openFile.ts` refreshes an existing window's payload before focusing                                  | `fix/ui-interaction-backlog` |
| 8   | Low–Med  | Files items had no roles, `tabIndex` or `aria-selected`                                                                                                                | Roving `tabIndex` and listbox semantics in `FilesView`                                                                                                       | Phase 11                     |
| 9   | Low      | Escape didn't close context menus or the notification center                                                                                                           | `useFocusTrap` handles Escape                                                                                                                                | Phase 11                     |
| 10  | Low      | The notification center's backdrop covered the menu bar, so the bell couldn't toggle it closed                                                                         | Backdrop moved from `z-45` to `z-35`, under the menu bar                                                                                                     | `fix/ui-interaction-backlog` |
| 11  | Low      | `provider.writeFile` stored strings of any size inline, breaking the 64 KB contract                                                                                    | New `fsStore.setFileBlob`; `writeFile` and the Notes editor both switch paths on `BLOB_INLINE_THRESHOLD` in either direction                                 | `feat/notes-depth`           |
| 12  | Low      | Persisted stores had no `version` or `migrate`                                                                                                                         | `version: 1` everywhere; `settingsStore` got a real v1→v2 `migrate` in step 15. `viewPrefsStore` and `themeStore` still have no `migrate` (`ROADMAP.md` T12) | `fix/persistence-hardening`  |
| 13  | Low      | `viewPrefsStore.sortByFolder` kept entries for deleted folders forever                                                                                                 | `pruneSortByFolder()` after `fsStore.init()`                                                                                                                 | `fix/ui-interaction-backlog` |
| 14  | Low      | The flag toggle could pin an override but never clear one                                                                                                              | `effectiveDefault(id)`; the toggle clears the override when it matches, and overridden rows get "Reset to default"                                           | `fix/ui-interaction-backlog` |
| 15  | Low      | The About panel showed a hardcoded, wrong version                                                                                                                      | `__APP_VERSION__` injected from `package.json` by `vite.config.ts`                                                                                           | `fix/ui-interaction-backlog` |
| 16  | Low      | IndexedDB `open()` handled neither `onblocked` nor `versionchange`, so the first schema bump could hang boot                                                           | `openIdbDatabase` in `idbShared.ts` rejects on `onblocked` and closes on `versionchange`                                                                     | `fix/persistence-hardening`  |
| 17  | Low      | Storage write failures only reached the console                                                                                                                        | `logPersistError` raises a danger notification, with specific copy for `QuotaExceededError`                                                                  | `fix/persistence-hardening`  |
| 18  | Low      | Thirteen small items: marquee and drag selection edge cases, uncleared timers, an unguarded type read in the Terminal engine, stale `restoreRect`, colliding menu keys | All fixed in `fix/ui-interaction-backlog`, except the `MenuBar.tsx` keys (`76678b2`) and `Window.tsx`'s viewport read, which were already fixed on `main`    | step 14                      |

## Checked and found correct

Recorded so nobody re-derives it:

- **CSP.** `script-src 'self'` with no `unsafe-inline` or `unsafe-eval`,
  `object-src 'none'`, `base-uri` and `form-action` locked. The missing
  `media-src` was fixed in `164eca2`. `style-src 'unsafe-inline'` is needed
  for React inline styles and the runtime appearance variables on `<html>`.
- **`content` xor `contentRef`.** No path sets both.
- **`idbAdapter.loadAll`** reads `request.result` after the transaction
  completes, which is valid.
- **`blobHash.ts`** handles `SharedArrayBuffer`-backed and subarray views
  correctly.
- **`themeStore`** tracks OS changes in `auto` mode, with no hydration race
  (zustand rehydrates `localStorage` synchronously).
- **`useBlobUrl`** revokes object URLs on hash change and unmount.
- **`WindowErrorBoundary`** really recovers: `<Fragment key={resetKey}>`
  forces a remount.
- **No findings** in `dnd.ts`, `clipboardStore.ts`, `zipWorker.ts`,
  `registry.ts`, `launch.ts`, `seed.ts`, `WelcomeApp`, `palettes.ts` or
  `NotificationGlyph`.

## Known coverage gap

Two fixes from the review have no regression test: the `Window`
minimize-timer cleanup (`399993c`) and the `pointercancel` handlers
(`dfa2fa3`). Every test written for them also passed against the unfixed
code (React makes the stray `setState` a no-op, and Playwright's synthetic
`pointercancel` doesn't reproduce a real gesture takeover), so they were
removed rather than kept as false assurance. Nothing will catch a regression
in either.
