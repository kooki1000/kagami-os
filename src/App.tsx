import { useEffect } from "react";
import { Desktop } from "./components/shell/Desktop";
import { Dock } from "./components/shell/Dock";
import { MenuBar } from "./components/shell/MenuBar";
import { NotificationCenter } from "./components/shell/NotificationCenter";
import { ToastStack } from "./components/shell/ToastStack";
import { WindowLayer } from "./components/shell/WindowLayer";
import { launchApp } from "./system/apps/launch";
import { useFsStore } from "./system/fs/fsStore";
import { notify } from "./system/notifications/notificationStore";
import { accentById, themeVariables, wallpaperById } from "./system/settings/palettes";
import { useSettingsStore } from "./system/settings/settingsStore";
import { useGlobalShortcuts } from "./system/shortcuts";
import { useThemeStore } from "./system/theme/themeStore";
import { restoreSession, watchSessionForSave } from "./system/windows/sessionStore";
import { useWindowStore } from "./system/windows/windowStore";

export default function App() {
  const resolved = useThemeStore(s => s.resolved);
  const accentId = useSettingsStore(s => s.accentId);
  const wallpaperId = useSettingsStore(s => s.wallpaperId);
  const setViewport = useWindowStore(s => s.setViewport);

  useGlobalShortcuts();

  // Reflect theme + accent + wallpaper onto the document root. Inline
  // custom properties override the static defaults in global.css, so the
  // whole UI re-tints live when any of these change.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    const vars = themeVariables(
      accentById(accentId),
      wallpaperById(wallpaperId),
      resolved,
    );
    for (const [key, value] of Object.entries(vars))
      root.style.setProperty(key, value);
  }, [resolved, accentId, wallpaperId]);

  useEffect(() => {
    const update = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [setViewport]);

  useEffect(() => {
    // Guards the restore-session/launch-welcome tail below against React
    // StrictMode's double-invoked effects: the first invocation's cleanup
    // runs (in dev) before this promise settles, so bail rather than
    // hydrate/launch twice from two overlapping boots.
    let cancelled = false;
    let unwatch: (() => void) | null = null;

    // Bring the virtual file system up as part of boot (idempotent). Once
    // it's ready, honor the "auto-empty Trash after 30 days" preference,
    // then restore the previous session's windows (C1) — a `?fresh` query
    // param bypasses restore as a recovery hatch if a bad session ever
    // wedges boot.
    void useFsStore.getState().init().then(() => {
      if (cancelled)
        return;
      if (useSettingsStore.getState().autoEmptyTrash)
        useFsStore.getState().purgeExpiredTrash();

      const url = new URL(window.location.href);
      const fresh = url.searchParams.has("fresh");
      if (fresh) {
        // One-shot: strip it from the address bar so a later plain reload
        // (no one typed `?fresh` again) goes back to restoring normally,
        // rather than every reload from here on silently skipping it.
        url.searchParams.delete("fresh");
        window.history.replaceState(null, "", url);
      }
      const hadSession = fresh ? false : restoreSession();

      // First-ever boot (no session was ever saved, even an empty one):
      // greet with the Welcome window. A session that restored to zero
      // windows means the user closed everything on purpose — don't
      // resurrect Welcome every time they do that.
      if (useWindowStore.getState().windows.length === 0 && !hadSession) {
        launchApp("welcome");
        notify({
          title: "Welcome to Kagami OS",
          body: "Open apps from the dock. Try ⌘W to close a window.",
        });
      }

      unwatch = watchSessionForSave();
    });

    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, []);

  return (
    <div className="relative h-full overflow-hidden">
      <Desktop />
      <WindowLayer />
      <Dock />
      <MenuBar />
      <ToastStack />
      <NotificationCenter />
    </div>
  );
}
