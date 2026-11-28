# Writing an app for Kagami OS

An app is a zip with a manifest and one JavaScript file. Kagami runs it in a
sandboxed frame that can't touch the desktop, the network or any storage of
its own. Everything it does goes through a small set of calls to the shell, and
the shell checks each one against what the user approved when they installed
it.

This document is the whole contract. `sdk/kagami-client.js` is the client you
paste into your app, and `examples/scratchpad/` is a complete app built on it.

**Contents**

1. [Your first app](#your-first-app)
2. [The bundle](#the-bundle)
3. [Capabilities](#capabilities)
4. [The client](#the-client)
5. [Calls](#calls)
6. [Files an app can reach](#files-an-app-can-reach)
7. [Menus and the dock badge](#menus-and-the-dock-badge)
8. [Errors](#errors)
9. [Security model](#security-model)
10. [Limits](#limits)

## Your first app

You need two files. `manifest.json`:

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "1.0.0",
  "entry": "entry.js",
  "capabilities": ["notifications"]
}
```

And `entry.js`. Start it with the whole of `sdk/kagami-client.js`, unchanged,
then write your app below it:

```js
document.body.textContent = "Hello from my first app.";

document.body.addEventListener("click", async () => {
  try {
    await kagami.notify("Hello", "You clicked the page.");
  }
  catch (error) {
    document.body.textContent = `Refused: ${error.code}`;
  }
});
```

Zip the two files together (`zip hello.zip manifest.json entry.js`), then in
Kagami:

1. Turn on the **Third-party apps** flag in Settings › About (or run
   `localStorage.setItem("kagami:flag:third_party_apps", "on")` and reload).
2. Open Settings › Apps and choose **Install App**, then pick the zip.
3. Read the consent screen. It lists exactly what the manifest asks for.
   Choose **Install**.
4. Open it from the toast, or find it in the dock. It's pinned only if you pin
   it.

To remove it, use Settings › Apps › Uninstall. That closes its windows and
deletes the bundle, its data folder, its grants and every preference that
named it.

## The bundle

A zip archive with `manifest.json` and the file `entry` names, at the top
level. Other files are ignored: an app is one script, with its own CSS and
data inlined.

The **entry is always JavaScript, never HTML.** The shell's content security
policy has no `'unsafe-inline'`, so a script the shell supplies is the only
kind that runs. Build your own DOM from it.

### `manifest.json`

| Field             | Type     | Notes                                                                                                                                                                                                            |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | string   | Required. Becomes the folder name under `/Apps` and the app's key everywhere. No `/` or `\`, at most 128 characters. A built-in's id (`notes`, `files`, …) is refused, and so is an id that's already installed. |
| `name`            | string   | Required. Shown in the dock, the menu bar and the consent screen.                                                                                                                                                |
| `version`         | string   | Required. Free-form.                                                                                                                                                                                             |
| `entry`           | string   | Required. The script's file name, under the same rules as `id`.                                                                                                                                                  |
| `capabilities`    | string[] | Required, may be empty. What you ask the user for. See [Capabilities](#capabilities).                                                                                                                            |
| `fileTypes`       | string[] | Optional. MIME types the app opens: exact (`"text/markdown"`) or a family (`"image/*"`), at most 32. See [Files an app can reach](#files-an-app-can-reach).                                                      |
| `icon`            | string   | Accepted and ignored: every installed app uses one shared icon.                                                                                                                                                  |
| `minShellVersion` | string   | Accepted and ignored.                                                                                                                                                                                            |

A manifest that is missing a required field, has a field of the wrong type, or
has an invalid `fileTypes` entry is rejected whole. Unknown fields are
dropped. What the consent screen shows, and what's written to disk, is the
parsed manifest, never the raw bytes.

## Capabilities

A capability is a string, `verb` or `verb:scope`. You list the ones you want in
the manifest; the user approves them at install and can switch any of them off
later in Settings › Apps. A switch takes effect on the app's very next call,
even in an open window. A grant can be narrowed and restored, never widened
past the manifest.

| Capability          | Lets you                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `notifications`     | Show a notification (`kagami.notify`).                                                                                               |
| `fs.read:<nodeId>`  | Read that file or folder and everything under it (`fs.read`, `fs.list`).                                                             |
| `fs.write:<nodeId>` | Write files into that folder or below it, and delete what's inside it (`fs.write`, `fs.delete`). The folder itself can't be deleted. |

`<nodeId>` is a file system node id. Seeded folders have stable ids: `home`,
`desktop`, `documents`, `downloads` and `pictures`. Any other node's id is
generated on the device, so an app gets at those through the data folder, the
picker, or by listing a folder it already holds.

Some access needs no capability, because the shell hands it out itself:

- **Your private data folder**, read and write. See below.
- **The file you were opened with**, and **a file the user picks**, read-only.
- Window and dock chrome: the title, menus and badge.

A call outside what's granted is refused with `capability_denied`. It never
throws in the shell and never reaches the file system.

## The client

`sdk/kagami-client.js` defines two names in the frame: `kagami` and
`KagamiError`. It's plain JavaScript with JSDoc types, so `// @ts-check` gives
you completion and checking without a build step.

Every call returns a promise. It resolves with the method's data, or rejects
with a `KagamiError` whose `code` says why. If you'd rather not use the client,
the wire format is below.

### Wire format

A request is `postMessage`d to `window.parent`:

```json
{ "kind": "kagami.sandbox.request", "id": "1", "method": "fs.read", "params": { "id": "abc" } }
```

The shell answers the same frame, matching `id`:

```json
{ "kind": "kagami.sandbox.response", "id": "1", "ok": true, "data": {} }
```

or, when it refuses:

```json
{ "kind": "kagami.sandbox.response", "id": "1", "ok": false, "error": { "code": "capability_denied", "message": "…" } }
```

Only trust messages whose `event.source` is `window.parent`: your origin is
opaque, so `event.origin` tells you nothing. The shell can also push
`{ "kind": "kagami.sandbox.event", "type": "appCommand", "command": "…" }`
when the user picks one of your menu items.

## Calls

| Client call                                           | Method                 | Needs                                    | Resolves with                                                     |
| ----------------------------------------------------- | ---------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `kagami.info()`                                       | `app.info`             | nothing                                  | `{ appId, dataFolderId, fileId }`                                 |
| `kagami.fs.read(id)`                                  | `fs.read`              | `fs.read:` on the file or an ancestor    | `{ id, name, mimeType, size, bytes, isText }`                     |
| `kagami.fs.readText(id)`                              | `fs.read`              | same                                     | the file's text, decoded as UTF-8                                 |
| `kagami.fs.list(id)`                                  | `fs.list`              | `fs.read:` on the folder or an ancestor  | `[{ id, name, type, mimeType, size, modifiedAt }]`, folders first |
| `kagami.fs.write(parentId, name, content, mimeType?)` | `fs.write`             | `fs.write:` on the folder or an ancestor | `{ id, name, size, modifiedAt }`                                  |
| `kagami.fs.delete(id)`                                | `fs.delete`            | `fs.write:` on a folder above `id`       | `null`                                                            |
| `kagami.fs.pick(accept?)`                             | `fs.pick`              | nothing                                  | the chosen file's entry, or `null`                                |
| `kagami.notify(title, body?)`                         | `notifications.notify` | `notifications`                          | `null`                                                            |
| `kagami.setTitle(title)`                              | `window.setTitle`      | nothing                                  | `null`                                                            |
| `kagami.setMenus(sections)`                           | `menus.set`            | nothing                                  | `null`                                                            |
| `kagami.setBadge(badge)`                              | `dock.setBadge`        | nothing                                  | `null`                                                            |
| `kagami.onCommand(handler)`                           | event `appCommand`     | nothing                                  | calls `handler(command)` for each menu choice                     |

Details that matter:

- **`fs.write` replaces a same-named file** in that folder rather than making
  `name 2`. `content` is a string; `mimeType` is optional. A write that isn't
  into an existing folder is `not_found`.
- **`fs.delete` moves to the Trash**, and only deletes for good something
  that's already there. An app can't bypass the Trash.
- **`fs.read` returns bytes** as an `ArrayBuffer`. `isText` is true for text
  files; `readText` is `fs.read` plus a decode.
- **`fs.list` is one level**, not recursive.
- **`fs.pick`'s `accept`** is a list of MIME types or `family/*` patterns,
  such as `["text/*", "application/json"]`. Omit it for any file.
- **`notify`** shows a toast and an entry in the notification center, with your
  app's id. It carries no action button.
- **`setTitle`** sets this window's title. A window opened with a file starts
  titled with its name.

## Files an app can reach

An app has three ways to reach a file, and no others.

**Its data folder.** Every installed app owns `Apps/<id>/data`, with read and
write and no consent prompt. `kagami.info()` returns its id as `dataFolderId`.
It's the place for settings, drafts and caches, and it survives reloads. The
user can see it in Files like any other folder, it travels with a backup, and
uninstalling the app deletes it.

```js
const { dataFolderId } = await kagami.info();
await kagami.fs.write(dataFolderId, "settings.json", JSON.stringify({ zoom: 2 }));

const entries = await kagami.fs.list(dataFolderId);
const saved = entries.find(entry => entry.name === "settings.json");
const settings = saved ? JSON.parse(await kagami.fs.readText(saved.id)) : {};
```

**The file it was opened with.** List MIME types in `fileTypes` and the app
appears under **Open With** and as a choice in Settings › Default Apps for
those types. Installing an app never makes it
the default: the user has to choose it. When they open a file with it, the
window is handed that one file: `kagami.info()` returns its id as `fileId`,
and `fs.read` on it works for as long as the window does, with no capability
in the manifest. A second file opens in a second window.

**A file the user picks.** `kagami.fs.pick(["text/*"])` makes the shell draw a
file picker, headed with your app's name. The user chooses a file or cancels
(`null`). If they choose, that window can read that one file until it closes.
Your app never sees the folder tree: it learns the one file's entry, nothing
else. If a picker is already open, a second request resolves `null`.

Access from opening or picking is **read-only** and covers exactly one file. It
isn't a grant to the folder it's in: `fs.list` on the parent, `fs.write` beside
it and `fs.delete` of it are all refused. There is no write-back to a handed
file yet.

## Menus and the dock badge

`kagami.setMenus` replaces the menus shown in the menu bar while your window is
focused. Each item carries an `appCommand` string; choosing it (or its chord)
calls the handlers you registered with `kagami.onCommand`.

```js
void kagami.setMenus([
  {
    title: "Draft",
    items: [
      { label: "Clear Draft", appCommand: "draft.clear", shortcut: "⇧⌘K" },
      { label: "Save", appCommand: "draft.save", shortcut: "⌘S", dividerAfter: true },
    ],
  },
]);

kagami.onCommand((command) => {
  if (command === "draft.clear")
    document.body.textContent = "";
});
```

The shell validates what you send, and refuses the whole call with
`invalid_request` if any of it is wrong:

- at most 8 sections of at most 24 items; titles up to 40 characters, labels up
  to 60, `appCommand` up to 64
- an item needs a `label` and an `appCommand`, and may add `shortcut`,
  `disabled` and `dividerAfter`
- an item can't name a shell `command`: a menu can only send a string back to
  your own frame
- a `shortcut` is `⌘` plus one key (`A`–`Z`, `0`–`9`, `[`, `]`, `−`, `+`, an
  arrow, `⏎`, `⌫`, `⌦`), optionally with `⇧`. `⌘W`, `⌘M`, `⌘Q` and `⌘K` belong
  to the shell
- menus are per window and last until it closes. `[]` clears them

`kagami.setBadge(3)` or `kagami.setBadge("new")` puts a short badge on your dock
tile while the app is running. Counts above 99 show as `99+`, text is at most
four characters, and `null` clears it. A badge can't carry a message: it's drawn
on a tile the user trusts. It goes away when your last window closes.

## Errors

A rejected call is a `KagamiError` with one of:

| `code`              | Meaning                                                        |
| ------------------- | -------------------------------------------------------------- |
| `capability_denied` | You weren't granted this, or the user revoked it. Nothing ran. |
| `invalid_request`   | A parameter is missing, the wrong type, or fails validation.   |
| `not_found`         | The id isn't a file or folder the call can use.                |
| `internal`          | The shell failed unexpectedly.                                 |

`capability_denied` comes first: asking about an id you hold no grant for
doesn't tell you whether it exists.

## Security model

The frame is `<iframe sandbox="allow-scripts">`, with no `allow-same-origin`.
That makes its origin opaque, so it has:

- no access to the shell's DOM, cookies, `localStorage`, IndexedDB or service
  worker
- no network: the shell's CSP is `connect-src 'self'`, which never matches an
  opaque origin
- no top-level navigation, no popups, no forms
- no way to read another app's files or its own bundle through any call

Every check happens in the shell, outside the frame:

- A request is authenticated by which window it came from, never by anything
  it says. The app id, window id, data folder and handed file in `app.info` are
  the shell's own record.
- Capabilities are looked up from `appGrantsStore` on every call, so a revoked
  grant can't be used again. Malformed capability strings never match.
- A file is addressed by id, so there are no paths to escape. Scopes are
  ancestors in the node tree.
- Replies carry narrow shapes, never an internal file record.
- The bridge never reaches `deleteForever`, so the Trash can't be skipped.

What the sandbox doesn't do: it can't stop an app from using its granted
capabilities badly. An app with `fs.write:documents` can overwrite a document
it can see. That's what the consent screen is for, and why you should ask for
the narrowest scope you can: a folder you create, the data folder, or the
picker usually does the job.

## Limits

These are the current edges, so you don't build around something that isn't
there:

- **One script.** No multi-file bundles, no `import`, no `fetch`.
- **No update flow.** An id that's already installed is refused, so updating
  means uninstalling first, which deletes the data folder. Don't keep anything
  there you can't recreate.
- **Text in, text out.** `fs.write` takes a string. Binary writes aren't
  supported yet.
- **No write-back to a handed file**, and no way to create a file the user
  names (a save dialog). Write into your data folder or a granted folder.
- **No theme push.** The frame doesn't receive the shell's colours, so an
  installed app draws its own.
- **Behind a flag.** Installing apps is off by default until the SDK ships.
