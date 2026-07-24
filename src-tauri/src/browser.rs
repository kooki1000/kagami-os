//! Native child-webview commands backing the Browser app (N4).
//!
//! Each Browser window gets one child `Webview` (label `browser-<id>`)
//! layered over the main window's content area — the mechanism that lets
//! Kagami render arbitrary third-party sites, which `frame-ancestors`/CORS
//! forbid embedding as an iframe in the main webview. `add_child`/multiwebview
//! is behind Tauri's `unstable` cargo feature (see `Cargo.toml`) and has no
//! z-order control relative to the main window's own DOM content — by design
//! the frontend only shows this webview while its window is focused,
//! unminimized, and no shell overlay (menu, search, notification center) is
//! open, so it never needs to render "behind" anything.
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
use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewBuilder, WebviewUrl,
};

const HOST_WINDOW: &str = "main";
const NAV_CHANGED_EVENT: &str = "browser://nav-changed";

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

#[tauri::command]
pub async fn browser_open(
    app: AppHandle,
    id: String,
    url: String,
    bounds: Bounds,
    visible: bool,
) -> Result<(), String> {
    let window = app
        .get_window(HOST_WINDOW)
        .ok_or_else(|| "main window not found".to_string())?;
    let nav_id = id.clone();
    let inset_y = content_inset_y(&window);

    let builder = WebviewBuilder::new(webview_label(&id), WebviewUrl::External(parse_url(url)?))
        .on_page_load(move |webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                emit_nav_changed(&webview, nav_id.clone(), payload.url().to_string());
            }
        });
    let webview = match window.add_child(builder, bounds.position(inset_y), bounds.size()) {
        Ok(webview) => webview,
        // Loser of a create race (see module doc) — already open, not a failure.
        Err(tauri::Error::WebviewLabelAlreadyExists(_)) => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
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

#[tauri::command]
pub fn browser_set_bounds(app: AppHandle, id: String, bounds: Bounds) -> Result<(), String> {
    let Some(webview) = find_webview(&app, &id) else {
        return Ok(());
    };
    webview
        .set_position(bounds.position(cached_content_inset_y()))
        .map_err(|error| error.to_string())?;
    webview
        .set_size(bounds.size())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_set_visible(app: AppHandle, id: String, visible: bool) -> Result<(), String> {
    let Some(webview) = find_webview(&app, &id) else {
        return Ok(());
    };
    let result = if visible {
        webview.show()
    } else {
        webview.hide()
    };
    result.map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_close(app: AppHandle, id: String) -> Result<(), String> {
    let Some(webview) = find_webview(&app, &id) else {
        return Ok(());
    };
    webview.close().map_err(|error| error.to_string())
}
