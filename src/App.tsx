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
    // Bring the virtual file system up as part of boot (idempotent). Once
    // it's ready, honor the "auto-empty Trash after 30 days" preference.
    void useFsStore.getState().init().then(() => {
      if (useSettingsStore.getState().autoEmptyTrash)
        useFsStore.getState().purgeExpiredTrash();
    });
    // Boot experience: greet with the Welcome window. Guarded so React
    // StrictMode's double-invoked effects don't open it twice.
    if (useWindowStore.getState().windows.length === 0) {
      launchApp("welcome");
      notify({
        title: "Welcome to Kagami OS",
        body: "Open apps from the dock. Try ⌘W to close a window.",
      });
    }
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
