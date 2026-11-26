# Improvement proposals

**Written:** 2026-11-26, against `main` at `d5fc414`.
**Scope:** suggestions for making Kagami more useful day to day, and the order
I'd do them in.

This is a proposal, not a plan of record. `ROADMAP.md` is still the plan, and
nothing here overrides it. Where an idea is already in the roadmap, I point
at the existing ID instead of inventing a new one. Every item stays inside the
project's fixed lines: no server, the D-area app list stays closed (§6.2), and
the sandbox boundary follows §6.8 and §6.9.

Items carry `P` IDs so they don't collide with the roadmap's `B`/`C`/`D`/`U`
IDs. Sizes use the roadmap's legend (`S` half a day, `M` 1–3 days, `L` 1–2
weeks).

## Contents

1. [How I read the project](#1-how-i-read-the-project)
2. [Protecting the user's only copy](#2-protecting-the-users-only-copy)
3. [Finding things and undoing mistakes](#3-finding-things-and-undoing-mistakes)
4. [Working alongside the host OS](#4-working-alongside-the-host-os)
5. [Notes that link to each other](#5-notes-that-link-to-each-other)
6. [An SDK someone outside the repo can use](#6-an-sdk-someone-outside-the-repo-can-use)
7. [Housekeeping](#7-housekeeping)
8. [What I left out on purpose](#8-what-i-left-out-on-purpose)
9. [Implementation roadmap](#9-implementation-roadmap)

## 1. How I read the project

The shell is mature, and steps 15 and 16 closed most of the "first pass"
complaints the roadmap made about the apps. Notes has an inline editor,
templates and find-and-replace. Files has Recents, Favourites, Quick Look and a
virtualized view. The Player has shuffle, repeat and its own transport. Step 17
is half shipped: D8.1 to D8.5 are in, and D8.6 to D8.8 (the Apps pane,
revocation, and the reference app) are left.

So the remaining gaps are less about any one app and more about three things
that cut across all of them:

- **The disk is the user's only copy, and the safety net around it is thin.**
  With sync retired, the zip export in Settings › General is the whole backup
  story. It is manual, it leaves out half of what a user would call "my
  desktop", and nothing reminds anyone to use it.
- **The desktop is an island.** Files come in through Upload and leave through
  Download. The installed PWA doesn't register for any file types, so the
  host OS doesn't know Kagami can open a `.md` file.
- **The SDK works, but only for someone who has read the source.** There are
  no authoring docs, and a third-party app can't be the "Open With" target for
  anything, which is most of what makes an installable app worth installing.

The sections below take these in turn, then a few smaller ones.

## 2. Protecting the user's only copy

`ROADMAP.md` R1 names the risk: Safari evicts IndexedDB for sites that aren't
installed after about seven days of disuse, and there is no server-side copy to
fall back on. `system/storage/persistence.ts` already asks for persistent
storage and Settings shows whether it was granted. These items build on that.

### P1. Back up the whole desktop, not only the disk — `M`

`exportDisk` zips the VFS tree and its blobs. The comment above
`BackupSection` (`src/apps/settings/SettingsApp.tsx:1130`) says so directly:
"not settings/theme/dock state". The stores that live in `localStorage` are
left out:

- `settingsStore` (look, accent, wallpaper, default apps, startup behaviour)
- `dockStore` (pins, size, position)
- `desktopLayoutStore` (icon positions on the desktop)
- `themeStore`, `viewPrefsStore`, and the per-app prefs stores
- `appGrantsStore`, the capabilities a user granted to installed apps

The last one is the sharpest problem. Third-party bundles live under `/Apps`,
so they survive an export and import. Their grants don't, so after a restore
every installed app is present but has lost its permissions, and the user has
no way to know why.

Proposal: add a `settings.json` entry next to `.kagami-export-manifest.json`
holding each persisted store's serialized state and its zustand `version`.
On import, run each store's own `migrate` on the way in, so an old backup
restores into a newer build. Bump `EXPORT_MANIFEST_VERSION` to 2 and keep
reading version 1 zips as disk-only.

Keep the session-scoped stores (notifications, search) out of it.

### P2. Remember when the last backup happened, and say so — `S`

Nothing records an export. Store `lastBackupAt` in `settingsStore`, show it
under the Backup row ("Last backup: 12 days ago"), and send one notification
when it passes a threshold the user can change (default 7 days, matching
Safari's eviction window). Skip the reminder in the native build, where the
disk is a real folder under `$APPDATA` and eviction doesn't apply.

### P3. A storage meter — `S` (roadmap C5)

Nothing in `src/` calls `navigator.storage.estimate()`. C5 has been open since
Phase 12 and its own note says the meter "matters more now that R1 has no
server-side backstop". A row in Settings › General and an optional menu-bar
status item is enough. Show usage against quota, and warn before a write
would fail rather than after.

### P4. Import into a folder instead of over the disk — `M`

`importDisk` is wipe-then-restore. That is right for "restore my backup" and
wrong for "bring over the notes from my other machine", which is the common
case now that the roadmap's answer to multi-device use is "export a zip"
(§2). Add a second action, "Import into a folder…", that unpacks the zip
under `Home/Imported <date>` using the existing `uniqueChildName`. System
folder ids in the export manifest get ignored in this mode, so an imported
`Desktop` becomes a plain folder named Desktop.

### P5. Version history for text files — `L`

Notes and the code editor both save as you type. That is good until someone
selects all and types over a note, or a bad find-and-replace runs across a
file. There is no way back. The Trash protects against deletion and nothing
protects against overwriting.

The blob store makes this cheap. Content is already addressed by SHA-256, so
keeping old versions means keeping old hashes alive:

- On save, if the previous content is older than a few minutes, push its
  hash onto a small per-node history list (cap of 20, say).
- The blob GC treats those hashes as referenced.
- Get Info and the editors' File menus get "Revert to…" with a list of
  timestamps and a read-only preview.

This needs T11 first (see P19). Otherwise the save-path change gets made
twice, once in `NoteEditor.tsx` and once in `CodeEditor.tsx`.

### P6. Automatic backup to a folder the user picks — `M`/`L`

P2 nags. This one removes the need to nag. On Chromium, the File System
Access API's `showDirectoryPicker` hands back a handle that can be stored in
IndexedDB and reused across sessions. Kagami can write a rolling backup zip
into, say, a folder inside the user's Dropbox, on a schedule or after a
number of changes, and keep the last few.

This is one-way and never reads back, so it isn't the parked sync of §3.X.2.
It has no merge, no tombstones and no conflicts. Firefox and Safari don't have
the API and keep P2's reminder. The native build can do the same through
Tauri on all three platforms.

## 3. Finding things and undoing mistakes

### P7. Search file contents from ⌘K — `M`/`L` (roadmap B9, second half)

`searchNodes` (`src/system/search/searchNodes.ts`) matches names only. B9 said
"content search later, post-B1", and B1 shipped in Phase 10. Once a user has a
few hundred notes, searching by name stops being enough.

Build a small inverted index in a Web Worker over text content: inline
`FsNode.content`, plus blob-backed text files under a size cap. Update it
incrementally from the same `commit()` path the store already funnels writes
through. Results show a one-line snippet with the match. Keep the index in
memory and rebuild it at boot; persisting it is an optimization for later, if
boot time shows it's needed.

### P8. Commands in ⌘K, not just files — `S`/`M`

Every app's menus are already data (`AppManifest.menus`), and
`system/shortcuts.ts` already maps chords to the commands those menus run.
The search overlay could list them too: "New Note", "Empty Trash", "Toggle
Dark Mode", "Open Settings › Default Apps". It's the cheapest way to make a
feature people can't find reachable, and it needs no new command model.

Only list commands that would be enabled for the window focused when ⌘K
opened, the same rule the menu bar uses.

### P9. Undo for file operations, not only Trash — `M`

Trashing has an Undo button in its toast (`FilesApp.tsx:262`,
`Desktop.tsx:132`). Moving, renaming, drag-and-drop and paste don't. A drag
that lands in the wrong folder of a deep tree is easy to do and annoying to
reverse.

Add a short undo stack of inverse operations in the fs store (move back,
rename back, delete what a paste created) and wire ⌘Z in Files and on the
desktop when focus isn't in a text field. The trash toasts can then use the
same stack instead of their own closures.

## 4. Working alongside the host OS

### P10. Register the installed PWA as a file handler — `M`

`public/manifest.webmanifest` has no `file_handlers` entry. Adding one, plus a
`launchQueue` consumer at boot, means a user who installed Kagami can
right-click a `.md`, `.txt`, image or PDF in Finder or Explorer and open it in
Kagami. The file gets copied into the VFS (under `Downloads`, or an `Opened`
folder) and handed to `openFile`, so it opens in whatever app the Default Apps
pane says.

Chromium only. On other browsers the manifest field is ignored, so it costs
nothing there. Check the CSP's `manifest-src` stays as-is. The native build's
equivalent is a Tauri file association, which belongs with N5 and can wait.

### P11. Paste from the host clipboard into Files — `S`/`M`

Pasting a screenshot into Files or onto the desktop should create
`Pasted image <time>.png` in that folder through `createBlobFile`, the same
call Paint uses. Pasted plain text can become a `.txt` file. Files already has
⌘V for its own clipboard, so the rule is simple: if Kagami's own clipboard
store is empty, read the system one.

### P12. Drag a file out to the host desktop — `S`

Chromium supports a `DownloadURL` drag type, so dragging a file from Files to
the host's desktop saves it there. It's a small change to `dnd.ts` with a blob
URL already produced by `useBlobUrl`. Other engines keep using Download.

## 5. Notes that link to each other

### P13. `[[Note]]` links between notes — `M`/`L`

The biggest step from "a folder of text files" to a notes tool is linking
notes together. Decision 8 deliberately keeps any node with a URL out of the
editor schema, and this proposal keeps it that way.

The link node's only attribute is a VFS node id. It never holds an `href`.
Clicking it calls `openFile` on that id, inside the shell. On disk it stays
plain markdown as `[[Note name]]`, resolved by name within the scope the
sidebar already computes (`fileScope.ts`), and re-pointed by id when the
target is renamed. A "Linked from" list at the bottom of a note gives
backlinks almost for free once P7's index exists.

This still changes the schema, so it needs the PR that §6 decision 8 asks
for: one that argues in `editorSchema.ts` why an id-only, shell-resolved link
can't reach the network or run anything, plus an update to
`editorSchema.test.ts` asserting no node carries `href` or `src`.

Images in notes are a different case. A `blob:` URL is a URL, so embedding
one reopens decision 8 for real, and I've left it out.

## 6. An SDK someone outside the repo can use

Step 17's exit criterion is "an app written outside this repository". D8.8's
reference app proves the mechanics. These items are about whether a person
who has never seen `src/system/sandbox/` can write one.

### P14. Authoring docs, a typed client, and a starter bundle — `M`

There is no SDK document in `docs/`, and `src/system/sandbox/client.ts` is
internal. Write `docs/app-sdk.md` covering the bundle format (one entry
script, why never inline HTML), `manifest.json` fields, every bridge method
and its capability, the error codes, and the security model in plain terms.
Publish the client as a single file a developer can copy into their bundle,
with the request and event types. Make D8.8's reference app the starter
template, so the docs and the test fixture can't drift apart.

### P15. Let installed apps open files — `M`

`manifestSchema.ts` has no field for file types, so a third-party app can't
appear in "Open With" or in the Default Apps pane, and can't receive a file
payload. An installed Markdown previewer or a hex viewer is useless without
that.

Two parts:

- A `fileTypes` manifest field (mime patterns plus extensions), fed into the
  same resolution `openFile.ts` and `system/fs/mimeTypes.ts` use. Installed
  apps never become the default on install. The user picks them.
- A **per-file grant**: when the user opens a file with an installed app, the
  shell grants `fs.read` (and `fs.write`, if the manifest asked) on that one
  node for that window's lifetime. The app doesn't need a folder-wide scope
  just to edit the file it was handed. A shell-drawn "Open…" dialog
  (`fs.pick`) gives the same kind of grant when the app asks for a file
  itself.

### P16. A private data folder per app — `S`

The step 17 sketch mentions `fs.write:<own-data-dir>`. Make that automatic:
every installed app gets `Apps/<id>/data`, readable and writable with no
consent prompt, and uninstall (D8.6) removes it. Most apps need somewhere to
keep settings and state, and asking the user to approve that is consent noise.

### P17. Menus and dock badges over the bridge — `S`/`M`

Step 16a's scope listed "menu declaration reusing the existing `MenuSection`
shape" and "dock badges". `SANDBOX_METHODS` has neither today. `appCommand`
events already flow from shell to frame, so the missing half is a
`menus.set` method whose items carry `appCommand` strings, validated against
the existing `MenuSection` type. Without it, a sandboxed app's menu bar shows
only the shell's own menus.

## 7. Housekeeping

### P18. Add a LICENSE — `S` (roadmap §6.3, §10 item 1)

Still missing. It's the first item in `ROADMAP.md` §10, and it blocks step 17
more than it used to: nobody can legally build an app against an SDK whose
source carries no license. This is a decision for the owner, not something I
can pick. The roadmap's default suggestion is MIT, or Apache-2.0 if an
explicit patent grant matters.

### P19. Pay down T10 and T11 before touching either editor again — `M`

`NoteEditor.tsx` and `CodeEditor.tsx` still both carry their own copy of the
5 MB cap, the blob load, the unmount flush and the `BLOB_INLINE_THRESHOLD`
migration. The roadmap deferred the shared hook because it rewrites both
editors' save path. P5 and P13 rewrite that path anyway, so do T11 first and
the refactor stops being a cost of its own. T10 (the shared sidebar) is the
same argument for P13's backlinks.

### P20. String extraction for i18n — `M` (roadmap H2), later

Formatting already goes through `navigator.language` in `lib/format.ts`. UI
strings are inline English. This becomes more expensive with every app, but
it isn't what limits usefulness today, so I'd keep it at the end of the list.

## 8. What I left out on purpose

- **Sync of any kind.** P4 and P6 cover moving data between machines by hand
  and backing it up automatically. Two-way sync stays parked in §3.X.2.
- **New built-in apps.** A calendar or a to-do app would be the obvious
  candidates, but §6.2 closed the list, and P14 to P17 are a better route:
  they make it possible for those apps to exist without being in the repo.
- **Anything deployment-shaped.** A public demo is being worked on separately
  (`feat/github-pages-demo`), and releases stay below the line.
- **Mobile layouts.** §6.1 settled this as desktop-first.

## 9. Implementation roadmap

The ordering follows three rules. Data loss can't be undone, so the cheap
data-safety work goes first. Step 17 is already in flight and shouldn't be
interrupted for long. And where two items touch the same code, the refactor
goes before both of them.

| Order | Phase                   | Items                      | Size      | Why here                                                           |
| ----- | ----------------------- | -------------------------- | --------- | ------------------------------------------------------------------ |
| 1     | Quick safety wins       | P18, P3, P2                | ≈ 2 days  | Small, independent, and P2/P3 address R1 directly                  |
| 2     | Complete backups        | P1, P4                     | ≈ 1 week  | A restore that loses grants and settings is a broken restore       |
| 3     | Finish step 17          | D8.6, D8.7, D8.8 (planned) | ≈ 1–2 wks | Already scoped in `ROADMAP.md`; nothing here changes it            |
| 4     | SDK usable from outside | P14, P16, P15, P17         | ≈ 2–3 wks | Must land before anyone is told the SDK exists                     |
| 5     | Editor groundwork       | P19                        | ≈ 3 days  | Unblocks P5 and P13 without doing the save path twice              |
| 6     | Safety for edits        | P5, P9                     | ≈ 2 weeks | Covers the two common mistakes nothing protects against today      |
| 7     | Finding things          | P8, P7                     | ≈ 1–2 wks | P8 is cheap and immediate; P7's index is reused by P13             |
| 8     | Linked notes            | P13                        | ≈ 1 week  | Needs P19 and P7, plus its own decision-8 PR                       |
| 9     | Host integration        | P10, P11, P12, P6          | ≈ 1–2 wks | Useful, but mostly Chromium-only, so behind the cross-browser work |
| 10    | Later                   | P20                        | ≈ 1 week  | Grows in cost slowly; doesn't limit usefulness yet                 |

A few notes on the order:

- **P18 is first because it's a blocker, not because it's big.** It is also
  the only item that needs the owner's decision rather than code.
- **Phase 2 could move after step 17**, if finishing the SDK matters more
  right now. I wouldn't push it further than that. Every week without P1 is a
  week where a restored backup silently drops app grants.
- **Within phase 4, P14 goes first.** Writing the docs is how the gaps in P15
  to P17 get confirmed, and it may turn up others.
- **P6 sits late** because P2 already covers most of its value cheaply, and
  it only helps Chromium users. If a user reports losing data, move it up.

Each phase should end the way `ROADMAP.md` steps do: demoable, with e2e
coverage across the three engines where the feature exists in all three, and
with `ARCHITECTURE.md` updated if it touches one of the seams (P1 and P4
touch the storage seam; P15 to P17 touch the app manifest seam).
