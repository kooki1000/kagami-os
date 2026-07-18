# Review backlog

Open findings from the full-scale review on `review/full-audit` (2026-07-18).
Everything here was **left unfixed deliberately** — the fixes that shipped are
in commits `a9a6546`, `399993c`, `dfa2fa3`, `164eca2`.

Each entry records where the bug is, how to reproduce it, and a concrete fix.
Severity is about user impact, not effort. "Verified" means someone drove the
repro (browser or test); "by reading" means the code path is unambiguous but
nobody executed it.

Suggested order: §1 → §4 → §5 → §2 → §7. Those are the ones a user actually
hits.

---

## 1. Context menus clip off the bottom of the viewport

**HIGH · verified in Chromium at 1280×800 · `src/components/ui/ContextMenu.tsx:96,111-112`**

The only vertical logic is a hardcoded guess:

```ts
const openUpward = y > window.innerHeight - 200;
```

200px is smaller than the real menu. A Files item menu measures **229.5px**
(`Open | Copy | Cut | Download as Zip | Get Info | Rename | Move to Trash`),
and ~255px with `Open With ▸`. So for any click in roughly
`(innerHeight - 230, innerHeight - 200]` the menu opens _downward_ and runs off
the screen. Measured: right-click at y≈595 → menu box `top=597, bottom=826.5`;
"Move to Trash" lands at y 794–821.5, clipped and unclickable.

There is no clamping, no scroll container, and no measure-after-mount
correction. The same 200px constant drives the submenu flip at
`ContextMenu.tsx:55`.

**Fix.** Measure after mount instead of guessing. Render at the requested
point, then in a layout effect read `ref.current.getBoundingClientRect()` and
clamp:

```ts
const [pos, setPos] = useState({ x, y });
useLayoutEffect(() => {
  const el = ref.current;
  if (!el)
    return;
  const { width, height } = el.getBoundingClientRect();
  setPos({
    x: Math.min(x, window.innerWidth - width - 8),
    y: Math.min(y, window.innerHeight - height - 8),
  });
}, [x, y]);
```

This subsumes the existing `openUpward`/`overflowsRight` flips — a clamp is
strictly better than a flip, since it also handles a menu taller than the
viewport. Apply the same treatment to the submenu path so both stop depending
on the magic number. Consider `max-height` + `overflow-y: auto` for the case
where the menu genuinely can't fit.

---

## 2. Dock context menu has no clamping at all

**MEDIUM · verified · `src/components/shell/Dock.tsx:208`**

```tsx
<div style={{ left: menu.x, top: menu.y - 8, transform: "translateY(-100%)" }} />
```

Unlike `ContextMenu`, there is no horizontal bound and the upward flip is
unconditional.

- **Horizontal:** Settings › Dock › Position = **Right**, then right-click any
  tile. Tile at `x:1207,w:46` → menu at `x:1230,w:160` → right edge **1390** in
  a 1280px viewport. 110px is off-screen, including the right half of every
  label.
- **Vertical:** dock Left/Right on a short viewport (verified at 900×420),
  right-click the top tile → `top = -7.5`. The app-name header is clipped off
  the top, and `translateY(-100%)` never flips downward.

**Fix.** Reuse the clamped positioning from §1 rather than reimplementing it —
ideally by having the dock menu use `ContextMenu` outright, which also gets it
Escape handling (§9) for free. If it has to stay bespoke, apply the same
measure-then-clamp on both axes.

---

## 3. Suppressed toasts resurrect ~6s later instead of expiring

**MEDIUM · verified · `src/components/shell/ToastStack.tsx:66-68` (`MAX_VISIBLE = 4`)**

```ts
const visible = items.filter(/* in toastIds */).slice(0, MAX_VISIBLE);
```

Toasts past the 4th are simply not rendered, so their `Toast` never mounts, its
5s timer never starts, and their ids sit in `toastIds` indefinitely. When the
visible four expire, the next batch mounts _fresh_ and runs a full 5s.

Repro: Files → New folder → type `a/b` → press Enter 8 times (the rename field
stays open — see §4 — so each Enter fires a "Can't rename" notification).
Observed: 4 toasts; at +5.9s still 4 (the _older_ four, previously invisible);
they clear only at +11.5s. Notifications from ~12 seconds ago pop up as if new,
and the stack drains newest-first, so the oldest message is shown last.

**Fix.** Expiry must be owned by the store, not by whether a component happened
to mount. Either:

- stamp each toast with an `expiresAt` at `notify()` time and have `ToastStack`
  drop ids past it (a single interval, or a timer for the nearest deadline); or
- keep the render cap but have `notify()` evict the oldest overflow id
  immediately, so `toastIds` never holds more than `MAX_VISIBLE`.

The first preserves "you'll see every notification"; the second is simpler and
matches what users actually perceive. Either way, render newest-last so the
stack drains in arrival order.

---

## 4. An invalid rename leaves a stuck, unfocused field and double-fires the error

**MEDIUM · verified · `src/components/ui/RenameInput.tsx:38`**

```tsx
<input onBlur={e => onCommit(e.target.value)} />
```

Every caller — `FilesApp.tsx:859-870`, `NotesApp.tsx:189-201`, and the
equivalent in `Desktop.tsx` — returns early on an invalid name _without_
clearing `renamingId`, so the input stays mounted. Blur then re-runs the same
rejected commit.

Repro: Files → New folder → type `a/b` → Enter (1 toast, field stays open —
correct) → click outside. Observed: a **second** identical toast, the rename
input still present, and `document.activeElement === BODY`. The user is left
with an editing field they didn't ask to keep, which no longer has focus, so
Escape does nothing until they click back into it. Every subsequent stray blur
re-fires the toast.

**Fix.** The commit-on-blur contract gives the caller no way to say "rejected".
Make `onCommit` return a boolean and have `RenameInput` treat `false` as
"stay open and refocus":

```ts
interface RenameInputProps {
  /** Return `false` to reject the name and keep editing. */
  onCommit: (name: string) => boolean;
}
```

```tsx
<input
  onBlur={(e) => {
    if (!onCommit(e.target.value))
      e.target.focus();
  }}
/>
```

Then the three callers return `false` on an invalid name instead of bare
`return`. Also worth de-duplicating the identical validate-and-toast block that
currently exists in all three.

---

## 5. `nodeSize` is quadratic and recomputed every render

**MEDIUM · measured · `src/apps/files/fileMeta.ts:68-77`**

```ts
export function nodeSize(nodes: NodeMap, node: FsNode): number {
  // …Object.values(nodes).filter(...) then recurse per child folder
}
```

Every folder row does a full scan of the whole node map and recurses, so a
folder with `k` descendants costs `O(k · n)`. Nothing memoizes it — the value
is computed inline during render at `FilesView.tsx:378` (per row) and
`FilesApp.tsx:695`.

Measured with a standalone benchmark of the same algorithm: **2041 nodes, 40
folder rows in list view → 16.6 ms per render**, growing ~4× per doubling of
tree size. Every filter keystroke and every marquee `mousemove` re-pays it —
visible input lag and a stuttering marquee.

**Fix.** Exactly the `collectSubtrees` treatment already applied in
`fsStore.ts` (see `ARCHITECTURE.md`): build one `parentId → children[]` index
and walk iteratively.

```ts
export function folderSizes(nodes: NodeMap): Map<string, number> {
  // one pass over the whole map, reused by every row
}
```

Memoize per `nodes` identity (`useMemo` in `FilesApp`, passed down), so a whole
listing costs one traversal instead of one per row. Related: `nodeSize`
recurses unguarded, so a corrupt `parentId` cycle stack-overflows where
`collectSubtrees` deliberately terminates — the index rewrite fixes both.

---

## 6. The Get Info panel isn't modal to the keyboard

**MEDIUM · by reading · `src/apps/files/NodeInfoPanel.tsx` + `FilesApp.tsx:511-578` (the window-level `keydown`)**

The panel renders a pointer-blocking overlay but installs no key handler, no
focus move, and no `aria-modal`. `FilesApp`'s window-level `keydown` listener
only bails on `INPUT`/`TEXTAREA`/`contentEditable` and on window focus — it has
no idea the panel is open.

With the panel open on a selected file:

- **Delete** trashes the very file the panel is describing. The panel keeps
  rendering the stale snapshot, including the old "Location", because
  `infoNode` is a snapshot object rather than a live lookup.
- **F2** sets `renamingId` on a row hidden behind the overlay; `RenameInput`
  autofocuses, so typing goes into an invisible field.
- **Arrows / printable characters** move the selection and run type-ahead
  invisibly behind the overlay.
- **Escape** clears the selection instead of closing the panel. Keyboard-only
  users have no way out — nothing is focused on open.

**Fix.** Two parts.

1. Make it a real dialog: `role="dialog"`, `aria-modal="true"`, move focus to
   the panel on open, restore it on close, trap Tab within it, and close on
   Escape.
2. Gate the window-level handler while it's open. Cleanest is a small
   "modal open" flag in `FilesApp` state that the handler checks first,
   rather than having the panel try to `stopPropagation` on a listener bound
   to `window`.

Separately, look `infoNode` up from `nodes` by id on each render instead of
holding a snapshot, so the panel reflects renames/moves and can close itself if
the node disappears.

---

## 7. Reopening a track focuses a Player window playing something else

**MEDIUM · by reading · `src/apps/player/PlayerApp.tsx:18` + `src/system/apps/openFile.ts:76-87`**

```ts
const [activeId, setActiveId] = useState<string | null>(() => payloadFileId(payload));
```

`activeId` is seeded only in the initializer, so it never re-syncs when the
window's `payload` changes.

Repro: double-click `a.mp3` → Player window W opens (`payload={fileId:"a"}`,
`activeId="a"`). Click **Next** → `activeId="b"`, payload still `"a"`. Now
double-click `a.mp3` again. `launchFileInApp` matches W on
`payloadFileId(w.payload) === "a"`, takes the `existing` branch, and only
focuses it. W comes to the front **still playing `b.mp3`**; `a.mp3` never
opens, and no new window is created either.

**Fix.** `NotesApp.tsx:95-101` already solves this exact problem — adopt the
same render-phase payload adoption, comparing payload identity rather than
`fileId` so re-opening the same file after skipping still re-selects it:

```ts
const [lastPayload, setLastPayload] = useState(payload);
if (payload !== lastPayload) {
  setLastPayload(payload);
  const id = payloadFileId(payload);
  if (id)
    setActiveId(id);
}
```

For that to fire, `launchFileInApp` must also refresh the existing window's
payload before focusing it (the `singleInstance` branch of `openWindow`
already does this; the multi-instance branch doesn't).

---

## 8. Files view has no selection semantics for assistive tech

**LOW-MEDIUM · by reading · `src/apps/files/FilesView.tsx:182-212,286-291,344-351`**

Items are bare `<div>`/`<tr>` with no `role`, no `tabIndex`, no
`aria-selected`; containers have no `role="listbox"`/`"grid"`. Selection is
conveyed purely by Tailwind background classes. Nothing in the view is
reachable by Tab, and the keyboard nav that does exist lives in a
`window`-level handler in `FilesApp`, which is invisible to a screen reader.
`NodeGlyph.tsx:11` also renders decorative icons with no `aria-hidden`.

**Fix.** `role="listbox"` + `aria-multiselectable` on the container,
`role="option"` + `aria-selected` per item, roving `tabIndex` (0 on the cursor
item, -1 elsewhere) so the list is a single tab stop, and move the key handler
onto the container so it fires from real focus rather than a window listener.
`aria-hidden="true"` on `NodeGlyph`.

---

## 9. Escape doesn't close context menus or the notification center

**LOW · verified · `ContextMenu.tsx:95-126`, `Dock.tsx:196-235`, `NotificationCenter.tsx:20`**

Right-click a Files item → Escape → menu still present. Same for the
notification center. Only an outside pointerdown dismisses either. Unusual for
a desktop metaphor and inaccessible by keyboard.

**Fix.** A `keydown` listener on each while open. Best folded into §1/§2 —
one properly-behaved menu component gets clamping, Escape, and focus handling
in one place.

---

## 10. Notification center backdrop covers the menu bar

**LOW · verified · `NotificationCenter.tsx:20` (`z-45`) vs `MenuBar.tsx:169` (`z-40`)**

With the center open, the backdrop intercepts pointer events on the bell, so
`MenuBar.tsx:221`'s `centerOpen ? closeCenter() : openCenter()` branch is
unreachable — the whole menu bar is inert while the center is open. The visible
outcome is still correct (pointerdown closes via the backdrop), so this is dead
code plus an interaction dead zone rather than a broken flow.

**Fix.** Either lower the backdrop below the menu bar (`z-35`) so the bell
genuinely toggles, or simplify the bell to `openCenter` only and delete the
unreachable branch. Prefer the former — toggling from the bell is what users
expect.

---

## 11. `provider.writeFile` bypasses the inline-content size contract

**LOW (latent — no in-tree consumers) · verified · `src/system/fs/provider.ts`**

`FsNode.content` is documented as "kept only for small text
(≤ `BLOB_INLINE_THRESHOLD`)", but `writeFile` stores whatever string it's
given inline. `writeFile(..., "x".repeat(200_000))` yields a node with
`content.length === 200000` and no `contentRef`. That 200 KB string lands in
the `nodes` object store and is re-read on every `loadAll` — exactly what B1
was built to prevent.

This does **not** break the `content` xor `contentRef` invariant (only one is
ever set); it breaks the size contract.

**This one is a design question, not a mechanical fix** — which is why it was
deferred rather than patched:

- Routing oversized writes to `createBlobFile` is easy on the _create_ path,
  but overwriting an existing node needs a store action that replaces inline
  content with a blob ref (the mirror of what `updateFileContent` now does).
  That action doesn't exist yet.
- Delete-then-recreate would avoid the new action but changes the node id on
  every oversized save, which breaks any window holding that file open.

Recommendation: add `setFileBlob(id, blob)` to `fsStore` — symmetric with
`updateFileContent`, ~10 lines, and independently useful for Notes saving a
large document. Then `writeFile` picks a path on `content.length`.

---

## 12. Persisted stores have no `version` / `migrate`

**LOW (latent) · `settingsStore.ts:47`, `viewPrefsStore.ts:26`, `themeStore.ts:43`**

None declares a `version`, so there is no migration hook when a shape changes.
All three are safe _today_ only because every consumer validates —
`accentById`/`wallpaperById` fall back to `ACCENTS[0]`, `sortForFolder` falls
back to `DEFAULT_SORT`, `appIdForFile` guards with `getApp(override)`. None
would survive an actual shape change.

`dockStore` had the live instance of this class of bug (new apps never
appearing) and was fixed in `164eca2`; treat that as the template.

**Fix.** Add `version: 1` to each now, so a future change has somewhere to hang
a `migrate`. Cheap insurance; no behavior change.

---

## 13. `viewPrefsStore.sortByFolder` grows without bound

**LOW · verified · `src/system/settings/viewPrefsStore.ts:8-24`**

Every `setSort(folderId, …)` adds a key that is never removed. Deleting the
folder — even Empty Trash, which permanently removes the node — leaves the
entry behind, since nothing in `fsStore`'s delete path touches this store.
Repro: create a folder, change its sort, Move to Trash, Empty Trash →
`localStorage["kagami-view-prefs"]` still holds that uuid. Over a long-lived
install with churn this grows monotonically, unlike blobs, which have
`sweepUnreferencedBlobs`.

**Fix.** Prune on boot: after `fsStore.init()` resolves, drop any
`sortByFolder` key with no corresponding node — the same idle-sweep shape as
the blob GC. A cap (keep the N most recent) would also work but silently
forgets real preferences.

---

## 14. The flag toggle can pin an override but never clear one

**LOW · verified · `src/apps/settings/SettingsApp.tsx:266` + `src/system/flags.ts:79`**

`onChange` always calls `setFlagOverride(flag.id, value)`, so toggling a
default-off flag on and then back off writes `"off"` rather than removing the
key. Repro: Settings › About → toggle "Online mode" on, then off. The row shows
`(overridden)` permanently and the flag is pinned off _per device_ — a future
change to the registered default, or a `VITE_FLAG_ONLINE` build value, is
silently ignored, with no UI to clear it short of `localStorage.removeItem`.

**Fix.** The store API already supports this — `setFlagOverride(id, value)`
takes `boolean | null` and clears the key on `null` (`flags.ts:78-88`). Only
the UI never passes it. Clear when the toggle returns to the underlying value:

```tsx
<Toggle
  onChange={(value) => {
    setFlagOverride(flag.id, value === effectiveDefault(flag.id) ? null : value);
    setTick(n => n + 1);
  }}
/>
```

`flags.ts` needs to expose that comparison — `FLAG_BY_ID` is module-private and
`isFlagEnabled` already folds the override in, so neither works from the UI as-is.
Add a small `effectiveDefault(id)` export returning `envValue(id) ?? FLAG_BY_ID[id].default`,
so the override is dropped when it merely restates a build-time flag rather than
only when it matches the registered default. Also add a "Reset to default"
affordance on rows where `hasFlagOverride` is true — a user who has pinned a
value that matches the default currently can't tell it's pinned.

---

## 15. About panel shows a hardcoded, stale version

**LOW · verified · `src/apps/settings/SettingsApp.tsx:282-283`**

```ts
const rows = [
  ["Version", "0.6.0 — “Lagoon”"],
  ["Build", "Phase 6 · Settings"],
];
```

`package.json` says `0.1.0`, and the project is well past Phase 6 (Player,
blob storage, and desktop icons have all shipped). Users see a wrong version.

**Fix.** Inject at build time — `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`
in `vite.config.ts` — and drop the phase string, which will always drift.

---

## 16. IndexedDB `open()` handles neither `onblocked` nor `versionchange`

**LOW (latent, unreachable today) · `src/system/fs/idbAdapter.ts:7-16`, `src/system/fs/idbBlobStore.ts:12-20`**

With `DB_VERSION = 1` and no `deleteDatabase` anywhere, this cannot fire today.
It is a trap primed for the first schema bump: a second open tab holding a v1
connection makes the new tab's `open()` fire `onblocked`, and **neither
`onsuccess` nor `onerror` ever fires**, so the promise never settles.
`fsStore.init` awaits `loadAll()` inside a `try` that only catches
_rejections_, so `ready` stays `false` and the boot spinner hangs forever —
precisely the failure the persistence-hardening work was meant to eliminate.

**Fix.** Now, while it's free:

```ts
request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
// and on the resolved connection:
db.onversionchange = () => db.close();
```

The existing seed fallback in `init` then handles the rejection gracefully.

---

## 17. Storage write failures are console-only

**LOW · path confirmed by reading; quota trigger unverified · `src/system/fs/idbAdapter.ts:61-79`**

`StorageAdapter` has no error-signalling seam, and every call site is
`adapter.putMany(...).catch(logPersistError)` → a bare `console.error`. On
`QuotaExceededError` — reachable, since `createBlobFile` writes uploads with no
size ceiling — the in-memory store keeps the node and the UI shows the file as
saved. The bytes are gone on reload, with nothing shown to the user.

**Fix.** The app already has `notify()` for this. Surface a danger-tone
notification from the persistence error path, and special-case
`QuotaExceededError` with actionable text ("Storage is full — empty the Trash
or remove large files"). A pre-flight `navigator.storage.estimate()` check
before large uploads would be a further improvement.

---

## 18. Smaller items

Noticed during review, each small and independent:

| Where                                    | Issue                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FilesView.tsx:107,143,217`              | `suppressClickRef` is only cleared inside the container's `onClick`. End a marquee drag outside the container (over the sidebar, another window, off-browser) and no click reaches it, so the flag stays `true` and the _next_ background click is silently swallowed. Clear it in `onUp` instead. |
| `FilesView.tsx:135` + `FilesApp.tsx:855` | `onMarqueeSelect` is wired straight to `setSelectedIds`, so unlike `handleSelectNode` it never updates `anchorId`/`cursorId`. Click item 1, marquee items 5–8, press ArrowRight → selection collapses to item **2**. Route marquee selection through the same anchor/cursor update.                |
| `FilesView.tsx:152-153`                  | Marquee `mousemove`/`mouseup` listeners are added to `document` from an event handler with no `useEffect` cleanup. If `FilesView` unmounts mid-drag (⌘W with the button held) they survive until the next `mouseup` anywhere. Bounded, but the drag is also not abortable by Escape or blur.       |
| `FilesView.tsx:193-209`                  | `onContextMenu` selects an unselected item first; `onDragStart` doesn't. Select A/B/C, drag D onto a folder → only D moves but A/B/C stay highlighted. Align the two.                                                                                                                              |
| `FilesApp.tsx` (`confirmEmpty`)          | `window.setTimeout(setConfirmEmpty, 3000, false)` is never cleared on unmount.                                                                                                                                                                                                                     |
| `FilesApp.tsx:142-151`                   | Render-phase `setState` when `nodes[cwd]` is missing converges only because `HOME_ID` always exists. If `HOME_ID` were ever absent it's an infinite render loop. Worth an explicit guard.                                                                                                          |
| `ViewerApp.tsx:129`                      | `hasSource` is true whenever `contentRef` is set, so a node whose blob is missing from the store shows the loading spinner **forever** rather than "no longer available". Needs a resolved-but-empty state from `useBlobUrl`.                                                                      |
| `MenuBar.tsx`                            | `fromSections` keys menus `app-${section.title}` and `DropMenu` keys items by `item.label` — duplicate titles/labels collide.                                                                                                                                                                      |
| `openFile.ts:111-115`                    | `openFileWithApp` persists the association even when the launch subsequently fails.                                                                                                                                                                                                                |
| `shell.ts` (`ls`, `cd`)                  | `nodes[targetId].type` is unguarded. Unreachable today because `TerminalApp` falls back to `ROOT_ID` when `cwd` vanishes, but the engine shouldn't rely on its caller for that.                                                                                                                    |
| `windowStore.ts` (`resizeWindow`)        | Sets `mode: "normal"` without clearing `restoreRect`. Harmless today; stale state.                                                                                                                                                                                                                 |
| `Window.tsx` (`onTitlePointerMove`)      | Reads `window.innerWidth` for the snap-zone test while everything else uses the store's `viewport`.                                                                                                                                                                                                |
| `NotesApp.tsx:111`                       | `n.parentId !== TRASH_ID` is redundant — `isDescendantOf(nodes, n.id, TRASH_ID)` on the next line already covers direct children.                                                                                                                                                                  |

---

## Verified clean

Checked during the review and found correct — recorded so nobody re-derives it:

- **CSP, apart from the missing `media-src`** (fixed in `164eca2`):
  `script-src 'self'` with no `unsafe-inline`/`unsafe-eval`, `object-src
'none'`, `base-uri`/`form-action` locked. `style-src 'unsafe-inline'` is
  genuinely required by React inline styles plus the runtime accent/wallpaper
  custom properties on `<html>`.
- **`pnpm audit --audit-level=high`** — no known vulnerabilities.
- **`content` xor `contentRef`** — no path in `provider.ts`, `idbAdapter.ts`,
  `seed.ts`, `blobStore.ts`, or `blobHash.ts` sets both. The
  `updateFileContent` bug fixed in `a9a6546` was not repeated elsewhere.
- **`idbAdapter.loadAll`** reading `request.result` after `await done(tx)` is
  valid — the result stays readable once the transaction completes.
- **`blobHash.ts`** — the `slice().buffer` handling of `SharedArrayBuffer`-backed
  and subarray views is correct; hex encoding is properly zero-padded.
- **`themeStore`'s `matchMedia` listener** does track OS changes in `auto`
  mode. Module-scope and intentionally never removed (singleton). No hydration
  race: zustand's `toThenable` makes localStorage rehydration synchronous, so
  `resolved` is correct before first paint.
- **`useBlobUrl`** revokes object URLs correctly on hash change and unmount;
  `PlayerApp`'s `key={activeId}` remounts the media element so no stale `src`
  survives.
- **`WindowErrorBoundary`** genuinely recovers — `<Fragment key={resetKey}>`
  forces a remount, and a re-throw during reset just re-shows the card.
- **`Toast`'s `setTimeout` cleanup** is correct on unmount and pause toggle.
- **`ContextMenu`'s submenu portal** to `<body>` is correct; React portals keep
  propagation on the React tree, so the backdrop doesn't swallow clicks.
- **`dnd.ts`, `clipboardStore.ts`, `zipWorker.ts`, `registry.ts`, `launch.ts`,
  `seed.ts`, `WelcomeApp`, `palettes.ts`, `NotificationGlyph`** — no findings.

## Not reviewed

`src/styles/global.css`, `src/design/tokens.ts`, `src/lib/format.ts`,
`src/main.tsx`, `src/apps/files/FilesSidebar.tsx`, `src/apps/devcrash/`,
`src/apps/shared/ComingSoon.tsx`, and `e2e/` beyond the specs touched here.

## Known coverage gap

Two fixes shipped without regression tests, both recorded in their commit
messages: the `Window` minimize-timer cleanup (`399993c`) and the
`pointercancel` handlers (`dfa2fa3`). Neither has observable behavior that a
test can distinguish — React 18 makes the stray `setState` a no-op, and
Playwright's synthetic `pointercancel` does not reproduce a real gesture
takeover. Every test written for them passed against the unfixed code, so they
were removed rather than kept as false assurance. If these paths regress,
nothing will catch it.
