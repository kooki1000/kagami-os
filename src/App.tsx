import { useEffect } from "react";
import { AppSwitcherOverlay } from "./components/shell/AppSwitcherOverlay";
import { Desktop } from "./components/shell/Desktop";
import { Dock } from "./components/shell/Dock";
import { MenuBar } from "./components/shell/MenuBar";
import { NotificationCenter } from "./components/shell/NotificationCenter";
import { SearchOverlay } from "./components/shell/SearchOverlay";
import { ToastStack } from "./components/shell/ToastStack";
import { WindowLayer } from "./components/shell/WindowLayer";
import { uiScaleMultipliers } from "./design/tokens";
import { launchApp } from "./system/apps/launch";
import { useFsStore } from "./system/fs/fsStore";
import { notify } from "./system/notifications/notificationStore";
import { lookById, themeVariables } from "./system/settings/palettes";
import { useSettingsStore } from "./system/settings/settingsStore";
import { ensureWallpaperUrl, useWallpaperUrl } from "./system/settings/wallpaperBlobUrl";
import { useGlobalShortcuts } from "./system/shortcuts";
import { requestPersistentStorage } from "./system/storage/persistence";
import { useThemeStore } from "./system/theme/themeStore";
import { restoreSession, watchSessionForSave } from "./system/windows/sessionStore";
import { useWindowManagementShortcuts } from "./system/windows/windowShortcuts";
import { useWindowStore } from "./system/windows/windowStore";

export default function App() {
  const resolved = useThemeStore(s => s.resolved);
  const lookId = useSettingsStore(s => s.lookId);
  const wallpaperStyleId = useSettingsStore(s => s.wallpaperStyleId);
  const materialLevel = useSettingsStore(s => s.materialLevel);
  const uiScale = useSettingsStore(s => s.uiScale);
  const customAccentHex = useSettingsStore(s => s.customAccentHex);
  const wallpaperFileId = useSettingsStore(s => s.wallpaperFileId);
  const wallpaperFit = useSettingsStore(s => s.wallpaperFit);
  const fsReady = useFsStore(s => s.ready);
  const setViewport = useWindowStore(s => s.setViewport);

  useGlobalShortcuts();
  useWindowManagementShortcuts();

  // U1: keep each theme's resolved wallpaper blob URL in sync with its
  // chosen VFS file id. Gated on `fsReady` — the fs store isn't hydrated
  // yet on first mount, so resolving against it early would just resolve
  // to "missing"; the effect re-runs once `init()` (below) flips `ready`.
  useEffect(() => {
    void ensureWallpaperUrl("light", fsReady ? wallpaperFileId.light : null);
  }, [wallpaperFileId.light, fsReady]);
  useEffect(() => {
    void ensureWallpaperUrl("dark", fsReady ? wallpaperFileId.dark : null);
  }, [wallpaperFileId.dark, fsReady]);

  // Reactive read of the *active* theme's resolved custom-wallpaper URL —
  // re-renders once the effects above settle it.
  const customWallpaperUrl = useWallpaperUrl(resolved);

  // Reflect the whole appearance onto the document root. Inline custom
  // properties override global.css's static defaults, so the UI re-tints live
  // as any of these change; each override layers onto the chosen look the
  // same "set wins, null inherits" way (see palettes.ts).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    const vars = themeVariables(lookById(lookId), resolved, {
      customAccentHex,
      wallpaperStyleId,
      customWallpaperUrl,
      wallpaperFit,
      materialLevel,
    });
    for (const [key, value] of Object.entries(vars))
      root.style.setProperty(key, value);
  }, [resolved, lookId, wallpaperStyleId, materialLevel, customAccentHex, customWallpaperUrl, wallpaperFit]);

  // Interface density (U4): same inline-override mechanism as above, kept
  // as its own effect since it's an independent axis from theme/accent.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ui-scale",
      String(uiScaleMultipliers[uiScale]),
    );
  }, [uiScale]);

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

    // Ask for durable storage (F1/R1) — independent of the fs boot below,
    // so a slow/unsupported browser never blocks it.
    void requestPersistentStorage();

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
      // U9: restoreSessionOnBoot (default on) gates the restore call itself —
      // off, this is exactly like `?fresh`, a boot with no prior session.
      const restoreOnBoot = useSettingsStore.getState().restoreSessionOnBoot;
      const hadSession = (fresh || !restoreOnBoot) ? false : restoreSession();

      // First-ever boot (no session was ever saved, even an empty one):
      // greet with the Welcome tour. A session that restored to zero
      // windows means the user closed everything on purpose — don't
      // resurrect Welcome every time they do that. `tourDismissed` (U16's
      // "don't show this again") is a second, independent gate — it can
      // replay later from Settings › About regardless of either check here.
      if (
        useWindowStore.getState().windows.length === 0
        && !hadSession
        && !useSettingsStore.getState().tourDismissed
      ) {
        launchApp("welcome");
        notify({
          title: "Welcome to Kagami OS",
          body: "Open apps from the dock. Try ⌘W to close a window.",
        });
      }

      // U9: apps the user has chosen to always launch at boot, in addition
      // to whatever session restore brought back (empty by default, so this
      // is a no-op for everyone who hasn't opted in).
      for (const appId of useSettingsStore.getState().startupApps)
        launchApp(appId);

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
      <SearchOverlay />
      <AppSwitcherOverlay />
    </div>
  );
}
