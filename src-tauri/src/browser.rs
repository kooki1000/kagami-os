//! Native child-webview commands backing the Browser app (N4).
//!
//! Each Browser window gets one child `Webview` (label `browser-<id>`)
//! layered over the main window's content area — the mechanism that lets
//! Kagami render arbitrary third-party sites, which `frame-ancestors`/CORS
//! forbid embedding as an iframe in the main webview. `add_child`/multiwebview
//! is behind Tauri's `unstable` cargo feature (see `Cargo.toml`) and has no
//! z-order control relative to the main window's own DOM content, so it can
//! never render "behind" anything. The frontend decides when it may be shown:
//! whenever nothing the shell stacks above it covers its content region and
//! no overlay (menu, search, notification center) is open — see
//! `browserVisibility.ts`. That is deliberately *not* "while the window is
//! focused", which is what it used to be and blanked the page in background
//! windows nothing was covering.
//!
//! Call ordering for a given id is the frontend's job (a per-id queue in
//! `browserBridge.ts`); each command here is still idempotent against a
//! benign ordering slip — "ensure open"/"no-op if not open" — as cheap
//! insurance, not as the primary fix.
//!
//! Navigation state (current URL/title) is pushed to the frontend via the
//! `browser://nav-changed` event, fired from `on_page_load` — wry's only
//! reliable navigation signal (it doesn't fire for SPA `pushState`/hash
//! navigation). There's no native back/forward API, so `browser_back`/
//! `browser_forward` just `eval` `history.back()`/`history.forward()` and
//! let the resulting `on_page_load` report the outcome.

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, PageLoadEvent};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewBuilder, WebviewUrl,
};

const HOST_WINDOW: &str = "main";
const NAV_CHANGED_EVENT: &str = "browser://nav-changed";
const LOAD_STATE_EVENT: &str = "browser://load-state";
const FIND_RESULT_EVENT: &str = "browser://find-result";
const DOWNLOAD_STARTED_EVENT: &str = "browser://download-started";
const DOWNLOAD_FINISHED_EVENT: &str = "browser://download-finished";

/// Content-area bounds in logical (CSS) pixels — mirrors `BrowserBounds` in `browserBridge.ts`.
#[derive(Deserialize)]
pub struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Bounds {
    /// `inset_y` converts the frontend's DOM-viewport y into the host window's
    /// content-view coordinate space, which child webviews are positioned in.
    /// See [`content_inset_y`].
    fn position(&self, inset_y: f64) -> LogicalPosition<f64> {
        LogicalPosition::new(self.x, self.y + inset_y)
    }

    fn size(&self) -> LogicalSize<f64> {
        LogicalSize::new(self.width, self.height)
    }
}

/// Payload for `browser://nav-changed` — `title` needs a JS round-trip
/// (`document.title`) since Tauri has no native title getter.
#[derive(Clone, Serialize)]
struct NavChanged {
    id: String,
    url: String,
    title: String,
}

/// Payload for `browser://load-state`. Emitted from both edges of
/// `on_page_load`, so the frontend can show a page as loading and offer Stop
/// while it is. Separate from `NavChanged` because that one waits on an
/// `eval` round-trip for the title, and the loading edge must not.
#[derive(Clone, Serialize)]
struct LoadState {
    id: String,
    url: String,
    loading: bool,
}

/// Payload for `browser://find-result`. `found` is all `window.find` reports —
/// see [`browser_find`] for why there is no match count.
#[derive(Clone, Serialize)]
struct FindResult {
    id: String,
    found: bool,
}

/// Payloads for the two download events. The OS webview writes downloads to a
/// real filesystem path; Kagami's "disk" is the VFS, so a download is staged
/// to a temp directory and the frontend moves the bytes across with
/// [`browser_take_download`]. See the staging notes on [`download_staging_dir`].
#[derive(Clone, Serialize)]
struct DownloadStarted {
    id: String,
    filename: String,
}

#[derive(Clone, Serialize)]
struct DownloadFinished {
    id: String,
    filename: String,
    /// Absolute staging path, handed straight back to [`browser_take_download`].
    path: String,
    success: bool,
}

/// Where in-flight downloads land before the frontend moves them into the VFS.
///
/// Each download gets its own numbered subdirectory rather than a name-mangled
/// file: two downloads of `report.pdf` must not collide, and the original
/// filename has to survive intact — it becomes the VFS node's name.
fn download_staging_dir() -> std::path::PathBuf {
    std::env::temp_dir().join("kagami-browser-downloads")
}

/// A staging path is the one thing the frontend passes back that names a real
/// filesystem location, so it's checked against the staging root rather than
/// read as given — `..` in an IPC argument shouldn't be able to reach the
/// user's actual files.
fn staged_path(path: &str) -> Result<std::path::PathBuf, String> {
    let root = download_staging_dir()
        .canonicalize()
        .map_err(|error| format!("no staging directory: {error}"))?;
    let candidate = std::path::Path::new(path)
        .canonicalize()
        .map_err(|error| format!("no such download: {error}"))?;
    if !candidate.starts_with(&root) {
        return Err("path is outside the download staging directory".into());
    }
    Ok(candidate)
}

/// Full-size content view: the native title bar overlaps the web content, so
/// the main webview's DOM viewport sits a title-bar-height below the content
/// view's top. The frontend sends child bounds in DOM coordinates, but wry
/// positions children in content-view space, so without this shift the child
/// lands that far too high and hides the address bar (full rationale:
/// `docs/browser-webview-offset.md`). Measured as the content view minus its
/// title-bar-excluded safe area (`NSWindow.contentLayoutRect`): zero for
/// normal/borderless windows, so a no-op unless the inset exists. Computed once
/// on the main thread (AppKit reads aren't thread-safe) and cached.
static CONTENT_INSET_Y: std::sync::OnceLock<f64> = std::sync::OnceLock::new();

/// Cached content-view inset; computes it on first use (from `browser_open`,
/// which runs off the main thread so the main-thread round-trip can't deadlock).
fn content_inset_y(window: &tauri::Window) -> f64 {
    *CONTENT_INSET_Y.get_or_init(|| compute_content_inset_y(window))
}

/// Cached inset without triggering computation — for callers that may run on
/// the main thread (`browser_set_bounds`). `browser_open` always populates the
/// cache first, so this returns the real value in practice.
fn cached_content_inset_y() -> f64 {
    CONTENT_INSET_Y.get().copied().unwrap_or(0.0)
}

#[cfg(target_os = "macos")]
fn compute_content_inset_y(window: &tauri::Window) -> f64 {
    let (tx, rx) = std::sync::mpsc::channel();
    let window_for_closure = window.clone();
    if window
        .run_on_main_thread(move || {
            let _ = tx.send(macos_content_inset_y(&window_for_closure));
        })
        .is_err()
    {
        return 0.0;
    }
    rx.recv().unwrap_or(0.0)
}

/// Reads the host window's content-view height minus its title-bar-excluded
/// safe-area height. Must run on the main thread.
#[cfg(target_os = "macos")]
fn macos_content_inset_y(window: &tauri::Window) -> f64 {
    use objc2_app_kit::NSView;
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    let Ok(handle) = window.window_handle() else {
        return 0.0;
    };
    let RawWindowHandle::AppKit(h) = handle.as_raw() else {
        return 0.0;
    };
    // The handle's `ns_view` is the window's current content view.
    let content: &NSView = unsafe { &*(h.ns_view.as_ptr() as *const NSView) };
    let Some(ns_window) = content.window() else {
        return 0.0;
    };
    let content_height = content.frame().size.height;
    let safe_height = ns_window.contentLayoutRect().size.height;
    (content_height - safe_height).max(0.0)
}

#[cfg(not(target_os = "macos"))]
fn compute_content_inset_y(_window: &tauri::Window) -> f64 {
    0.0
}

/// Rounds the child webview's bottom corners to `radius`.
///
/// The webview is a real OS view painted over the window, so nothing in CSS
/// clips it: with square corners it squares off the window's own rounded
/// bottom edge the moment the window is focused (the webview is hidden when
/// it isn't, which is why the two states didn't match). Only the bottom two
/// corners are masked — the top edge meets the address bar and is interior.
///
/// `radius` comes from the frontend's `design/tokens.ts`, so the shell's
/// radius pairing stays the single source of truth rather than being
/// duplicated here.
#[cfg(target_os = "macos")]
fn round_bottom_corners(webview: &tauri::Webview, radius: f64) {
    use objc2_app_kit::NSView;
    use objc2_quartz_core::CACornerMask;

    // Runs on the main thread, which is where AppKit layer writes belong.
    let _ = webview.with_webview(move |platform| {
        // `inner()` is the WKWebView, which is an NSView subclass.
        let view: &NSView = unsafe { &*(platform.inner() as *const NSView) };
        let Some(layer) = view.layer() else {
            return;
        };
        layer.setCornerRadius(radius);
        // MaxY, not MinY: WKWebView's layer is geometry-flipped, so the Y axis
        // runs downward and the *bottom* corners are the MaxY pair. Masking
        // MinY here rounds the top edge instead — visible as two notches under
        // the address bar, with the bottom left square.
        layer.setMaskedCorners(
            CACornerMask::LayerMinXMaxYCorner | CACornerMask::LayerMaxXMaxYCorner,
        );
        layer.setMasksToBounds(true);
    });
}

#[cfg(not(target_os = "macos"))]
fn round_bottom_corners(_webview: &tauri::Webview, _radius: f64) {}

fn webview_label(id: &str) -> String {
    format!("browser-{id}")
}

fn find_webview(app: &AppHandle, id: &str) -> Option<Webview> {
    app.get_webview(&webview_label(id))
}

fn parse_url(url: String) -> Result<tauri::Url, String> {
    url.parse::<tauri::Url>().map_err(|error| error.to_string())
}

fn eval_on_webview(app: &AppHandle, id: &str, js: &str) -> Result<(), String> {
    let Some(webview) = find_webview(app, id) else {
        return Ok(());
    };
    webview.eval(js).map_err(|error| error.to_string())
}

/// Runs `f` against the webview for `id`, no-op if it isn't open — the shape
/// shared by every command below that doesn't need "not found" to be an error
/// (unlike [`browser_navigate`], which does).
fn with_webview<F>(app: &AppHandle, id: &str, f: F) -> Result<(), String>
where
    F: FnOnce(&Webview) -> Result<(), tauri::Error>,
{
    let Some(webview) = find_webview(app, id) else {
        return Ok(());
    };
    f(&webview).map_err(|error| error.to_string())
}

fn emit_load_state(webview: &Webview, id: String, url: String, loading: bool) {
    let _ = webview
        .app_handle()
        .emit(LOAD_STATE_EVENT, LoadState { id, url, loading });
}

fn emit_nav_changed(webview: &Webview, id: String, url: String) {
    let app = webview.app_handle().clone();
    // eval_with_callback is the only way to read page state (title) — its
    // result is JSON-encoded, so a bare string decodes back to the title.
    let _ = webview.eval_with_callback("document.title", move |title_json| {
        let title = serde_json::from_str(&title_json).unwrap_or(title_json);
        let _ = app.emit(
            NAV_CHANGED_EVENT,
            NavChanged {
                id: id.clone(),
                url: url.clone(),
                title,
            },
        );
    });
}

/// Redirects a download into its own staging directory and reports both edges
/// to the frontend, which is what turns it into a VFS file.
///
/// Returning `true` from `Requested` lets the download proceed. Nothing here
/// decides *whether* to download — the click already did — so there's no
/// prompt to gate it on.
fn on_download(webview: &Webview, id: &str, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { destination, .. } => {
            let filename = destination
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "download".to_string());
            // Nanoseconds, not a counter: this closure is shared across every
            // download in one webview and holds no state of its own.
            let unique = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let dir = download_staging_dir().join(unique.to_string());
            if std::fs::create_dir_all(&dir).is_err() {
                // Leaving `destination` alone lets the OS put it wherever it
                // would have; failing the download outright would be worse.
                return true;
            }
            *destination = dir.join(&filename);
            let _ = webview.app_handle().emit(
                DOWNLOAD_STARTED_EVENT,
                DownloadStarted {
                    id: id.to_string(),
                    filename,
                },
            );
            true
        }
        DownloadEvent::Finished { path, success, .. } => {
            let path = path.unwrap_or_default();
            let filename = path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "download".to_string());
            let _ = webview.app_handle().emit(
                DOWNLOAD_FINISHED_EVENT,
                DownloadFinished {
                    id: id.to_string(),
                    filename,
                    path: path.to_string_lossy().to_string(),
                    success,
                },
            );
            true
        }
        _ => true,
    }
}

/// Hands a finished download's bytes to the frontend and removes the staged
/// copy — a move into the VFS, not a copy, so nothing is left behind outside
/// the "disk" the user can actually see.
#[tauri::command]
pub fn browser_take_download(path: String) -> Result<tauri::ipc::Response, String> {
    let staged = staged_path(&path)?;
    let bytes = std::fs::read(&staged).map_err(|error| error.to_string())?;
    // Best-effort: the bytes are already in hand, and failing the whole
    // download because a temp file outlived it would be the wrong trade.
    let _ = std::fs::remove_file(&staged);
    if let Some(dir) = staged.parent() {
        let _ = std::fs::remove_dir(dir);
    }
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn browser_open(
    app: AppHandle,
    id: String,
    url: String,
    bounds: Bounds,
    visible: bool,
    radius: f64,
) -> Result<(), String> {
    let window = app
        .get_window(HOST_WINDOW)
        .ok_or_else(|| "main window not found".to_string())?;
    let nav_id = id.clone();
    let inset_y = content_inset_y(&window);

    let download_id = id.clone();
    let builder = WebviewBuilder::new(webview_label(&id), WebviewUrl::External(parse_url(url)?))
        .on_download(move |webview, event| on_download(&webview, &download_id, event))
        .on_page_load(move |webview, payload| {
            let url = payload.url().to_string();
            match payload.event() {
                PageLoadEvent::Started => {
                    emit_load_state(&webview, nav_id.clone(), url, true);
                }
                PageLoadEvent::Finished => {
                    emit_load_state(&webview, nav_id.clone(), url.clone(), false);
                    emit_nav_changed(&webview, nav_id.clone(), url);
                }
            }
        });
    let webview = match window.add_child(builder, bounds.position(inset_y), bounds.size()) {
        Ok(webview) => webview,
        // Loser of a create race (see module doc) — already open, not a failure.
        Err(tauri::Error::WebviewLabelAlreadyExists(_)) => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    round_bottom_corners(&webview, radius);
    if !visible {
        webview.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, id: String, url: String) -> Result<(), String> {
    let Some(webview) = find_webview(&app, &id) else {
        return Err(format!("no browser webview open for {id}"));
    };
    webview
        .navigate(parse_url(url)?)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_back(app: AppHandle, id: String) -> Result<(), String> {
    eval_on_webview(&app, &id, "history.back()")
}

#[tauri::command]
pub fn browser_forward(app: AppHandle, id: String) -> Result<(), String> {
    eval_on_webview(&app, &id, "history.forward()")
}

/// Halts an in-flight load. Like back/forward there's no native API, so this
/// goes through the page's own `window.stop()`. A stopped load may never reach
/// `PageLoadEvent::Finished`, so the frontend clears its own loading state
/// when it asks for this rather than waiting for an edge that may not come.
#[tauri::command]
pub fn browser_stop(app: AppHandle, id: String) -> Result<(), String> {
    eval_on_webview(&app, &id, "window.stop()")
}

/// Find-in-page (U17), on the page's own `window.find` — non-standard, but
/// implemented by every engine wry runs on (WKWebView, WebKit2GTK, WebView2),
/// and the only find that doesn't mean walking the DOM of a page we don't own.
///
/// It reports a bare hit/miss, which is why the find bar shows "Not found"
/// rather than "3 of 12": a count would mean injecting a highlighter and
/// keeping it in sync with a live document — a much larger job than this, and
/// one that mutates third-party pages.
///
/// `query` is embedded through `serde_json` rather than formatted in: it is
/// user text going into a JS source string, evaluated on whatever origin the
/// page currently holds.
#[tauri::command]
pub fn browser_find(
    app: AppHandle,
    id: String,
    query: String,
    forward: bool,
) -> Result<(), String> {
    let Some(webview) = find_webview(&app, &id) else {
        return Ok(());
    };
    let literal = serde_json::to_string(&query).map_err(|error| error.to_string())?;
    // (query, caseSensitive, backwards, wrapAround, wholeWord, searchInFrames, showDialog)
    let script = format!(
        "window.find({literal}, false, {}, true, false, true, false)",
        !forward
    );
    let app_handle = app.clone();
    webview
        .eval_with_callback(script, move |found_json| {
            let found = serde_json::from_str::<bool>(&found_json).unwrap_or(false);
            let _ = app_handle.emit(
                FIND_RESULT_EVENT,
                FindResult {
                    id: id.clone(),
                    found,
                },
            );
        })
        .map_err(|error| error.to_string())
}

/// Drops the selection `browser_find` left behind, so closing the find bar
/// doesn't leave the last match highlighted on the page.
#[tauri::command]
pub fn browser_find_clear(app: AppHandle, id: String) -> Result<(), String> {
    eval_on_webview(&app, &id, "window.getSelection()?.removeAllRanges()")
}

/// Page zoom (U17). Unlike back/forward/stop this one *is* native, so it
/// scales the page the way the OS browser would — layout included — rather
/// than by restyling content we don't own.
#[tauri::command]
pub fn browser_set_zoom(app: AppHandle, id: String, factor: f64) -> Result<(), String> {
    with_webview(&app, &id, |webview| webview.set_zoom(factor))
}

#[tauri::command]
pub fn browser_set_bounds(app: AppHandle, id: String, bounds: Bounds) -> Result<(), String> {
    with_webview(&app, &id, |webview| {
        webview.set_position(bounds.position(cached_content_inset_y()))?;
        webview.set_size(bounds.size())
    })
}

#[tauri::command]
pub fn browser_set_visible(app: AppHandle, id: String, visible: bool) -> Result<(), String> {
    with_webview(&app, &id, |webview| {
        if visible {
            webview.show()
        } else {
            webview.hide()
        }
    })
}

#[tauri::command]
pub fn browser_close(app: AppHandle, id: String) -> Result<(), String> {
    with_webview(&app, &id, |webview| webview.close())
}
