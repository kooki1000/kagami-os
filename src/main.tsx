import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { isTauri } from "./system/platform";
import "@fontsource-variable/inter/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Web-only (routed through the isTauri() gate, DIRECTION.md §4): the native
// build serves its own assets and has no use for an HTTP-cache-style
// service worker. Production-build only too — the dev server's HMR and a
// caching worker don't mix, and there's nothing meaningful to cache before
// a real build exists anyway.
if (import.meta.env.PROD && !isTauri() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
