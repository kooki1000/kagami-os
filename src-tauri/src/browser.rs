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
    window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn get_browser_webview(app: &AppHandle, id: &str) -> Result<tauri::Webview, String> {
    app.get_webview(&webview_label(id))
        .ok_or_else(|| format!("no browser webview open for {id}"))
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, id: String, url: String) -> Result<(), String> {
    get_browser_webview(&app, &id)?
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
    let webview = get_browser_webview(&app, &id)?;
    webview
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    webview
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_set_visible(app: AppHandle, id: String, visible: bool) -> Result<(), String> {
    let webview = get_browser_webview(&app, &id)?;
    let result = if visible {
        webview.show()
    } else {
        webview.hide()
    };
    result.map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_close(app: AppHandle, id: String) -> Result<(), String> {
    get_browser_webview(&app, &id)?
        .close()
        .map_err(|error| error.to_string())
}
