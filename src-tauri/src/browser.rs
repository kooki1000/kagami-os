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

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};

const HOST_WINDOW: &str = "main";

fn webview_label(id: &str) -> String {
    format!("browser-{id}")
}

fn parse_url(url: String) -> Result<tauri::Url, String> {
    url.parse::<tauri::Url>().map_err(|error| error.to_string())
}

// The frontend's create/reposition/hide/close calls are React-effect-driven,
// not user-gated, so they can legitimately fire before `browser_open`'s
// (async) webview creation has landed, or land twice for the same id (React
// StrictMode double-invokes effects in dev). Every command below is
// idempotent against that — "ensure open"/"no-op if not open" — rather than
// erroring on a benign ordering race, so the frontend doesn't need its own
// cancellation bookkeeping to paper over it.

#[tauri::command]
pub async fn browser_open(
    app: AppHandle,
    id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_window(HOST_WINDOW)
        .ok_or_else(|| "main window not found".to_string())?;
    let builder = WebviewBuilder::new(webview_label(&id), WebviewUrl::External(parse_url(url)?));
    match window.add_child(
        builder,
        LogicalPosition::new(x, y),
        LogicalSize::new(width, height),
    ) {
        Ok(_) => Ok(()),
        // Tauri dispatches async commands onto its multi-thread runtime, so
        // two near-simultaneous `browser_open` calls for the same id (React
        // StrictMode's dev-only double-effect-invoke) can both pass a
        // pre-check before either finishes creating — the loser lands here,
        // not in a real failure. A pre-check-then-create would still race;
        // catching this specific error after attempting creation doesn't.
        Err(tauri::Error::WebviewLabelAlreadyExists(_)) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, id: String, url: String) -> Result<(), String> {
    let Some(webview) = app.get_webview(&webview_label(&id)) else {
        return Err(format!("no browser webview open for {id}"));
    };
    webview
        .navigate(parse_url(url)?)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_set_bounds(
    app: AppHandle,
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let Some(webview) = app.get_webview(&webview_label(&id)) else {
        return Ok(());
    };
    webview
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    webview
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_set_visible(app: AppHandle, id: String, visible: bool) -> Result<(), String> {
    let Some(webview) = app.get_webview(&webview_label(&id)) else {
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
    let Some(webview) = app.get_webview(&webview_label(&id)) else {
        return Ok(());
    };
    webview.close().map_err(|error| error.to_string())
}
