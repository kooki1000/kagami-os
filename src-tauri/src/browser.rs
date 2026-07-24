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
//! `browser://nav-changed` event, fired from `on_page_load` — the only
//! reliable cross-platform navigation signal wry exposes (it does not fire
//! for in-page SPA `pushState`/hash navigation). There is no native
//! back/forward API in Tauri/wry, so `browser_back`/`browser_forward` fall
//! back to `history.back()`/`history.forward()` via `eval` — the frontend
//! then learns the result the same way, through the next `on_page_load`.

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
    fn position(&self) -> LogicalPosition<f64> {
        LogicalPosition::new(self.x, self.y)
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

fn webview_label(id: &str) -> String {
    format!("browser-{id}")
}

fn find_webview(app: &AppHandle, id: &str) -> Option<Webview> {
    app.get_webview(&webview_label(id))
}

fn parse_url(url: String) -> Result<tauri::Url, String> {
    url.parse::<tauri::Url>().map_err(|error| error.to_string())
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
    let builder = WebviewBuilder::new(webview_label(&id), WebviewUrl::External(parse_url(url)?))
        .on_page_load(move |webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                emit_nav_changed(&webview, nav_id.clone(), payload.url().to_string());
            }
        });
    let webview = match window.add_child(builder, bounds.position(), bounds.size()) {
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
    let Some(webview) = find_webview(&app, &id) else {
        return Ok(());
    };
    webview
        .eval("history.back()")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_forward(app: AppHandle, id: String) -> Result<(), String> {
    let Some(webview) = find_webview(&app, &id) else {
        return Ok(());
    };
    webview
        .eval("history.forward()")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_set_bounds(app: AppHandle, id: String, bounds: Bounds) -> Result<(), String> {
    let Some(webview) = find_webview(&app, &id) else {
        return Ok(());
    };
    webview
        .set_position(bounds.position())
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
