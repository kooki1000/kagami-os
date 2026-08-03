# Browser depth pass (U17)

**Status:** shipped 2026-08-03, step 15. Native-only — the web build renders
the "available in the desktop app" state and none of this applies to it.

What landed is in `ROADMAP.md`'s U17 row. This note covers the parts that
aren't obvious from the diff: the one constraint that shaped every decision,
and the three things a user will notice are missing, with the reason each one
is missing rather than merely unfinished.

## The constraint: the page is not in the DOM

Each Browser window is a React chrome strip with a **native child webview**
layered over the content region by the Rust side (`src-tauri/src/browser.rs`).
That webview is a real OS webview painted _on top of_ the main webview — it has
no z-order relationship to our DOM at all. Three consequences run through the
whole feature set:

1. **No React UI can overlay the page.** A find bar, a bookmark dropdown and a
   download popover all have to live in the chrome above the content region,
   not floating over it. This is why `chromeHeight()` in `BrowserApp.tsx` is a
   function rather than the constant it used to be: showing the bookmarks bar
   or the find bar moves the content region's top edge, and the webview is
   positioned by that arithmetic, not by layout. A strip the function doesn't
   know about renders _underneath_ the page.

   Anything that opens through `system/overlay/overlayRegistry` is exempt —
   registering an overlay hides the child webview, which is why the bookmarks
   bar's right-click `ContextMenu` works as an ordinary portal.

   The same rule governs when the page is shown at all. It is _not_ "while the
   window is focused" — that was the original approximation, and it blanked
   the page in background windows nothing was covering, which is the ordinary
   two-windows-side-by-side case. `browserVisibility.ts` asks the narrower
   question the constraint actually poses: does any non-minimized window
   stacked above this one overlap the content region? Two things are left out
   of that test on purpose, both documented there — window drop shadows (a
   shadow crossing the page gets clipped; blanking a page to protect a shadow
   is the wrong trade) and the dock and menu bar (a focused Browser window
   already paints over both, so counting them would make an unfocused window
   hide where a focused one doesn't).

   What remains unavoidable: a window overlapping by a single pixel hides the
   whole page, because occlusion isn't rectangular in general and a native
   view can't be partially clipped to an arbitrary shape.

2. **The page's content is not ours to walk.** Find can't query the DOM,
   highlight matches, or count them; it drives the page's own `window.find`.

3. **Keyboard focus is genuinely elsewhere.** While the user is interacting
   with the page, key events go to the OS webview and the shell's global
   handler in `system/shortcuts.ts` never sees them.

## The three visible limits

### Find shows "Not found", never "3 of 12"

`window.find` returns a bare boolean: it moved to a match, or it didn't. A
count means injecting a highlighter script into the page, walking its text
nodes, wrapping matches in marks, and keeping all of that in sync with a
document that can rewrite itself at any moment. That is a much larger piece of
work than the rest of this pass combined, and it mutates a third-party page to
do it. The honest hit/miss is what the platform actually knows.

`window.find` is non-standard but implemented by every engine wry runs on
(WKWebView on macOS, WebKit2GTK on Linux, Chromium/WebView2 on Windows).

### Downloads have no progress

wry's `on_download` hook has exactly two edges, `Requested` and `Finished` —
there is no progress callback to subscribe to. The UI shows a "Downloading"
notification at the start and a "Download saved" one at the end, which is all
the information that exists.

### Chords don't work while the page has focus

⌘F, ⌘+ and the rest reach the app only when the _shell_ holds key focus (right
after opening a window, or after clicking any chrome control). Click into the
page and they stop arriving. The menu-bar items keep working, because clicking
a menu moves focus back to the shell.

The obvious fix — inject an `initialization_script` into the child webview that
forwards those chords over IPC — **does not work, and shouldn't**. Tauri's ACL
grants capabilities per origin, and `capabilities/default.json` deliberately
declares no `remote` section, so a remote page has no IPC access whatsoever.
That's the protection stopping arbitrary sites from calling `browser_*`
commands; routing our own keystrokes through it would mean opening the same
door to every page the user visits. The alternatives (a `kagami-cmd://`
navigation intercepted by `on_navigation`, or native menu accelerators) either
hijack page navigation or put a second, native menu bar on screen next to the
one the design already draws.

Left as a known limit rather than worked around.

## Security notes

Three places take input that isn't ours and are written accordingly:

- **The address bar** (`browserUrl.ts`) navigates only to `http`, `https`,
  `file` and `about`. Anything else — notably `javascript:` and `data:` — is
  handed to the search engine instead. A `javascript:` URL from the address bar
  would execute against whatever origin the child webview currently holds,
  which is the classic self-XSS delivery route.
- **Restored sessions and bookmarks** are re-validated through the same
  `navigableUrl` check on the way _in_ and on the way back _out_. Both live in
  localStorage, which is editable, and both are navigated to on a click long
  after they were created.
- **`browser_take_download`** is the only command that takes a real filesystem
  path from the frontend. It canonicalizes the argument and rejects anything
  outside the staging root, so `..` in an IPC argument can't reach the user's
  actual files.

The find query is embedded into its script through `serde_json::to_string`
rather than `format!`, for the same reason: it's user text becoming JS source.

## Where downloads go

The OS webview writes downloads to a real filesystem path; Kagami's "disk" is
the VFS. `on_download` redirects each one into its own numbered subdirectory
under `$TMPDIR/kagami-browser-downloads` — a subdirectory rather than a
mangled filename, because two downloads of `report.pdf` must not collide and
the original name has to survive intact to become the node's name. The frontend
then reads the bytes across into the VFS's Downloads folder and deletes the
staged copy, so nothing is left outside the disk the user can see.

Downloads carry no mime type of their own (unlike an upload, where the browser
fills in `File.type`), so it's inferred from the extension in `downloads.ts`.
A node with no mime type can't be routed by "Open with" at all.
