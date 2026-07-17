# E2E Test Plan — remaining scenarios

**Status:** draft · 2026-07-17
**Owner:** QA / platform
**Scope:** Playwright suite under `e2e/`, run against a production preview
build on Chromium + Firefox + WebKit (see `playwright.config.ts`).

This plan sequences the work to finish the **H5 "initial 15" scenario
catalog** (`ROADMAP.md` §9) plus the **Phase 10 additions** (upload /
download / multi-select). It is the follow-up to the three specs already
landed on `test/e2e-files-b4-b5-trash`.

---

## 1. Where coverage stands today

| Catalog # | Scenario | Spec | State |
| --- | --- | --- | --- |
| 1 | Cold boot renders, no console errors | `boot.spec.ts` | ✅ done |
| 4 | Create → rename → **move (DnD)** → trash → restore | `files.spec.ts` | ⚠️ partial — **DnD move step missing** |
| 5 | Trash → Empty (two-step confirm) → gone after reload | `files-trash.spec.ts` | ✅ done |
| 6 | Notes edit → autosave → reload persists | `notes.spec.ts` | ✅ done |
| — | B4 multi-select (click/⇧/⌘, marquee, bulk) | `files-multiselect.spec.ts` | ✅ done |
| — | B5 clipboard (Copy/Cut/Paste, dedupe) | `files-clipboard.spec.ts` | ✅ done |
| 2 | WM: drag → snap-left → restore-drag → close | — | ❌ todo |
| 3 | Shortcut routing: app chord beats shell; ⌘W closes | — | ❌ todo |
| 7 | Open file → Notes selects it; switch; re-open re-selects | — | ❌ todo |
| 8 | Viewer: zoom / fit / rotate; window resize refits | — | ❌ todo |
| 9 | Terminal: `mkdir`/`echo >`/`cat`/`rm` round-trip vs Files | — | ❌ todo |
| 10 | Theme: dark toggle + accent + wallpaper; reload persists | — | ❌ todo |
| 11 | Dock: pin/unpin, size/position relayout, running dots | — | ❌ todo |
| 12 | Notification: Undo action restores; center marks read | — | ❌ todo |
| 13 | Two windows: z-order, minimize→dock restore, ⌘Q all | — | ❌ todo |
| 14 | Private-mode boot (no IDB): in-memory, banner shown | — | ❌ **blocked — banner UI does not exist** |
| 15 | Forced app crash → error card; shell survives | — | ❌ **needs a crash-trigger hook** |
| P10 | B2 upload from host OS | — | ❌ todo |
| P10 | B3 download to host OS (file + folder-as-zip) | — | ❌ todo |

**Net:** 6 of the 15 catalog scenarios plus B4/B5 are covered; 9 catalog
scenarios and the 2 Phase-10 flows remain. Two of the remaining nine need a
source change before they can be written (see §5).

---

## 2. Guiding conventions (keep the suite lean and stable)

Derived from the specs already written and `ROADMAP.md` §9 ("happy paths,
data-loss paths, and regressions for shipped bugs — kept deliberately lean").

- **One user-visible seam per spec file**, named `<area>.spec.ts`.
- **Isolated state.** Each test gets its own browser context, so IndexedDB /
  localStorage start clean. Never rely on order between tests.
- **Assert on behavior, not styling.** Prefer item presence/counts, values,
  and download events over asserting Tailwind classes (class assertions are
  the flakiest and least meaningful).
- **Target roles/labels/text**, never CSS class chains. Where a stable hook
  is genuinely absent, add a `data-*` attribute mirroring the existing
  `data-dock-app` / `data-window-control` convention rather than reaching
  through the DOM.
- **Cross-platform chords** via the `ControlOrMeta` modifier — `shortcuts.ts`
  resolves both ⌘ and Ctrl to the same menu chord string.
- **Extract shared helpers first** (see §3) — `openApp`, `createFolder`,
  etc. are already duplicated across three files.

---

## 3. Prerequisite refactor — `e2e/helpers.ts`

Before adding nine more specs, lift the copy-pasted helpers into one module
so each new spec is a few lines of intent. Low risk, pure test code.

```ts
// e2e/helpers.ts
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("A desktop that lives in your browser")).toBeVisible();
}

export function openApp(page: Page, id: string) {
  return page.locator(`[data-dock-app="${id}"]`).click();
}

export async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New folder" }).click();
  const rename = page.locator("input:focus");
  await rename.fill(name);
  await rename.press("Enter");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/** Console/page errors collected for a "no errors" assertion. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", e => errors.push(e.message));
  return errors;
}
```

Then migrate `boot`, `files`, `notes`, and the three new Files specs onto it
in the same PR (no behavior change — the matrix must stay green).

---

## 4. Scenario specs — detailed designs

Each entry: the guard, the driving hooks (with any gap called out), the
steps, the assertions, and the cross-browser risk.

### 4.1 `windows.spec.ts` — WM drag / snap / restore / close (#2)

- **Guards:** pointer logic in `Window.tsx` + `windowStore` snap/restore.
- **Hooks:** title bar drag via `page.mouse` on the title bar region; window
  controls carry `aria-label` `"close window"` / `"minimize window"` /
  `"zoom window"` and live under `[data-window-control]`. Snap zones are a
  half-viewport edge drop; `windowStore` exposes `snap-left`/`snap-right`
  modes and `restoreRect`.
- **Steps:** open Files → read window bounding box → drag the title bar to
  the left screen edge (mouse down on title, move to `x≈2`, up) → assert the
  window width ≈ half the viewport (snapped-left) → drag the title bar back
  toward center → assert width returns to `restoreRect` → click the
  `"close window"` control → assert the window is gone.
- **Assertions:** window bounding box width/height at each phase (tolerance
  ±4px); window count via a window-root locator.
- **Risk (med):** pointer-drag timing differs across engines; use
  `page.mouse.move(..., { steps })` and assert on committed bounds, not
  mid-drag preview. Firefox needs the extra `steps`.

### 4.2 `shortcuts.spec.ts` — chord routing (#3)

- **Guards:** `shortcuts.ts` — the focused app's menu chord wins over the
  shell chord; native editing chords stay with inputs.
- **Steps:** (a) open Files, press **⇧⌘N** → a new folder enters rename mode
  (app `files.newFolder` beat any shell binding). (b) Focus the Filter input,
  press **⌘A** → text selects inside the field, folder selection does *not*
  change (native-editing guard). (c) Press **⌘W** → focused window closes
  (shell fallback).
- **Assertions:** rename input focused after ⇧⌘N; window count drops after
  ⌘W; Filter field selection unaffected app-side.
- **Risk (low):** use `ControlOrMeta`. WebKit ⌘A in an input is native.

### 4.3 `open-with.spec.ts` — Open file → Notes payload identity (#7)

- **Guards:** the payload-identity bug fixed earlier this session
  (`openFile.ts` reuse + Notes selection).
- **Steps:** open Files → into Documents → double-click `welcome.md` → assert
  Notes opens with that file's content in the editor → back in Files, open
  `ideas.md` → assert the **same** Notes window switches to `ideas.md`
  (reuse, not a second window) → re-open `welcome.md` → assert it re-selects.
- **Assertions:** editor value equals each file's content; exactly one Notes
  window exists throughout.
- **Risk (low):** seeded content is deterministic (`seed.ts`).

### 4.4 `viewer.spec.ts` — zoom / fit / rotate / refit (#8)

- **Guards:** Viewer's `ResizeObserver` fit-recompute path.
- **Hooks:** open a seeded image (`Pictures/lagoon-dusk.svg`) via Files
  double-click. **Verify Viewer control selectors first** — confirm the
  zoom/fit/rotate buttons expose `aria-label`s (add them if missing; this is
  the one likely small source touch here).
- **Steps:** open image → zoom in (assert transform/scale increases) →
  rotate (assert rotation state) → fit → resize the Viewer window (drag a
  resize handle) → assert the image refits to the new size.
- **Assertions:** prefer a data attribute or inline `style` transform read
  over class assertions; assert scale/rotation values change monotonically.
- **Risk (med):** SVG intrinsic sizing + `ResizeObserver` timing differ on
  WebKit; `await expect.poll(...)` on the computed transform.

### 4.5 `terminal.spec.ts` — engine ↔ store round-trip (#9)

- **Guards:** the pure `shell.ts` engine writing through to the same VFS
  Files renders.
- **Hooks:** Terminal REPL input (`TerminalApp.tsx`) — confirm the prompt
  input selector; type + Enter per command.
- **Steps:** open Terminal → `mkdir demo` → `echo hi > demo/note.txt` →
  `cat demo/note.txt` (assert `hi` in output) → `echo bye > demo/note.txt`
  (overwrite) → `cat` again (assert `bye`) → `rm demo/note.txt` → open Files,
  navigate to `demo`, assert the file is gone. Cross-check the folder created
  via Terminal is visible in Files.
- **Assertions:** REPL output lines; Files view reflects the same nodes.
- **Risk (low):** engine is deterministic; the only surface is typing speed —
  use `fill` + `press("Enter")`.

### 4.6 `theme.spec.ts` — appearance persistence (#10)

- **Guards:** `themeStore` / `settingsStore` localStorage persistence and the
  inline `<html>` var overrides.
- **Hooks:** Settings › Appearance controls; theme is stamped as
  `data-theme` on `:root` (already a known hook).
- **Steps:** open Settings → toggle Dark → assert `:root[data-theme="dark"]`
  → pick a non-default accent + wallpaper direction → assert the accent CSS
  var changed on `<html>` → reload → assert dark + accent survive.
- **Assertions:** `data-theme` attribute; computed `--accent` value; no need
  to screenshot.
- **Risk (low).**

### 4.7 `dock.spec.ts` — pin / relayout / running dots (#11)

- **Guards:** `dockStore` + dock UI.
- **Steps:** open an unpinned app → assert a running-indicator dot on its
  tile → pin it (context menu) → close the app → assert the tile persists
  (pinned) → change dock size/position in Settings → assert tiles relayout
  (position/size delta) → unpin → assert the tile leaves when not running.
- **Assertions:** presence of `[data-dock-app=...]`, running-dot element,
  tile geometry before/after size change.
- **Risk (med):** dot/relayout assertions may need a small `data-*` hook on
  the running indicator; add if the dot isn't otherwise addressable.

### 4.8 `notifications.spec.ts` — Undo action + mark read (#12)

- **Guards:** notification store toast actions + center read-state.
- **Steps:** trash a file → a "Moved to Trash" toast appears with an **Undo**
  button → click Undo → assert the file is restored to its folder → open the
  Notification Center (menu-bar bell) → assert the entry is listed → mark
  read → assert the unread state clears.
- **Assertions:** file presence after Undo; center entry text; unread badge
  count.
- **Risk (low–med):** toast auto-dismiss timing — assert/act on the toast
  promptly; the bell/center may need a stable label.

### 4.9 `multi-window.spec.ts` — z-order / minimize / ⌘Q (#13)

- **Guards:** window manager multi-instance + dock restore + quit-all.
- **Steps:** open Files → **File › New Window** (or ⌘N) → assert two Files
  windows → click each to bring-to-front (assert z-order via stacking / which
  receives input) → minimize one (fly-to-dock) → click its dock tile → assert
  it restores → press **⌘Q** → assert all Files windows close.
- **Assertions:** window count; focused/topmost identity; minimized→restored
  visibility.
- **Risk (med):** z-order is a `nextZ` counter, not DOM order — assert via
  which window is focused/receives the next click rather than DOM stacking.

### 4.10 `upload.spec.ts` — B2 upload from host OS (Phase 10)

- **Guards:** file import into the VFS + blob store.
- **Hooks:** the hidden `<input type="file">` behind the "Upload files"
  toolbar button — drive with `setInputFiles` (no OS dialog needed). Use a
  small fixture committed under `e2e/fixtures/`.
- **Steps:** open Files → `setInputFiles` a fixture text + image → assert the
  files appear in the current folder → open the image in Viewer to confirm
  bytes resolved via the blob store.
- **Assertions:** uploaded names visible; upload toast count; image renders.
- **Risk (low):** `setInputFiles` is deterministic and dialog-free.
- **Note:** OS drag-and-drop of real files can't be simulated in Playwright;
  cover the `<input>` path (the app's fallback), not the drag path.

### 4.11 `download.spec.ts` — B3 download to host OS (Phase 10)

- **Guards:** single-file download + folder-as-zip (Web Worker) path.
- **Hooks:** `page.waitForEvent("download")`; assert `suggestedFilename()`.
- **Steps:** open Files → context-menu **Download** on a seeded file → assert
  a download with the right filename → **Download as Zip** on a folder →
  assert a `.zip` download.
- **Assertions:** download filename + non-empty stream.
- **Risk (med):** WebKit download events are supported but occasionally need
  `acceptDownloads` (default on); zip worker adds latency — allow a longer
  `waitForEvent` timeout.

### 4.12 Complete #4 — add the DnD move step to `files.spec.ts`

- The current spec skips the "move via DnD" leg the catalog calls for. Add:
  create a target folder + an item, then drag the item onto the folder tile
  (`page.mouse` down/move/up over the drop target), assert it left the parent
  and now lives inside the target.
- **Risk (med):** HTML5 DnD across engines is the flakiest interaction;
  Playwright's `dragTo` helps but the app uses custom `dnd.ts` — may need
  manual `mouse` steps with `dragover` dispatch. Time-box; if flaky, keep it
  as a Chromium-only `@dnd` tagged test rather than blocking the matrix.

---

## 5. Blocked scenarios — need a source change first

### 5.1 #14 Private-mode boot — **banner UI does not exist**

`idbAdapter.ts` already degrades to an in-memory no-op when `indexedDB` is
undefined, so the OS *boots* without persistence — but there is **no banner**
telling the user their session won't be saved. The catalog asserts "banner
shown." Two options:

- **(A, recommended)** Build the banner first (small feature): when the fs
  store falls back to in-memory, surface a dismissible shell banner. Then the
  test asserts it. This closes a real UX gap, not just a test gap.
- **(B)** Scope the test to what exists: block IDB via
  `page.addInitScript(() => { delete window.indexedDB })`, assert the OS
  boots and is usable, and that a created file **does not** survive reload
  (proving in-memory). Drop the banner assertion until (A) ships.

Recommend shipping (A) and writing the full test; fall back to (B) if the
banner slips.

### 5.2 #15 Forced app crash — **needs a crash-trigger hook**

The `WindowErrorBoundary` exists and renders a card ("*{app} stopped
working*", "Reload app", "Close window") — but nothing can make an app throw
on demand from a test. Add a **flag-gated crash trigger** (via
`src/system/flags.ts`, e.g. `VITE_FLAG_e2e_crash` / a query param): when set,
a tiny hidden dev app (or an appCommand) throws during render. Then:

- **Steps:** enable the flag → launch the crash app → assert the in-window
  error card renders → assert the dock, menu bar, and a second (healthy)
  window are unaffected → click "Reload app" → assert the card clears.
- **Risk (low)** once the hook exists; keep the trigger out of production
  builds (flag defaults off).

---

## 6. Sequencing & sizing

Ordered by value-to-effort, front-loading the shared refactor and the
regression-guard scenarios.

| Step | Work | Size | Notes |
| --- | --- | --- | --- |
| 1 | `e2e/helpers.ts` + migrate existing 6 specs | S | No behavior change; unblocks the rest |
| 2 | #9 Terminal, #7 Open-with, #10 Theme | M | Deterministic, low-risk, high regression value |
| 3 | #3 Shortcuts, #13 Multi-window | M | Core shell seams |
| 4 | #12 Notifications, #11 Dock | M | May add 1–2 small `data-*` hooks |
| 5 | #2 WM snap, #8 Viewer refit | M | Pointer/observer timing — budget for flakiness |
| 6 | B2 upload, B3 download + complete #4 DnD | M | Add `e2e/fixtures/`; DnD may be Chromium-tagged |
| 7 | #14 banner (feature + test), #15 crash hook + test | M | **Source changes** — see §5 |

**Rough total:** ~2 focused engineering days for steps 1–6; steps 7 add ~0.5
day plus the banner feature.

---

## 7. CI & flakiness policy

- The full matrix is 3 engines × N specs; current runtime is ~30s for 9 test
  cases. Keep total E2E under the "< a few minutes" bar by staying lean —
  don't test the same seam twice at different altitudes.
- **Tag genuinely flaky interactions** (`@dnd`, pointer snap) so they can run
  Chromium-only or be quarantined without dropping the whole scenario. CI
  already sets `retries: 2`; do not let retries paper over a real race —
  investigate any spec that only passes on retry.
- **Fixtures** live in `e2e/fixtures/` (committed); keep them tiny.
- New shell/app interaction seams land with an E2E scenario in the same PR,
  mirroring the unit-test rule in `ROADMAP.md` §9.

---

## 8. Open questions for sign-off

1. **#14:** build the persistence banner now (option A), or ship the test
   scoped to in-memory behavior (option B) and file the banner separately?
2. **#15:** acceptable to add a flag-gated crash trigger to the app, or
   prefer a test-only entry point kept entirely out of `src/`?
3. **DnD (#4 move, #2 snap):** if these prove flaky on Firefox/WebKit, is
   Chromium-only coverage acceptable for the drag interactions, given the
   underlying store logic is already unit-tested?
