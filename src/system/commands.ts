import type { CommandId } from "./apps/types";
import { launchApp } from "./apps/launch";
import { getApp } from "./apps/registry";
import { notify } from "./notifications/notificationStore";
import { useSettingsStore } from "./settings/settingsStore";
import { useWindowStore } from "./windows/windowStore";

/**
 * Executes shell-level commands fired from menu items. Commands always
 * act on the currently focused window / its app.
 */
export function executeCommand(command: CommandId): void {
  const store = useWindowStore.getState();
  const focused = store.windows.find(w => w.id === store.focusedId);

  switch (command) {
    case "system.about":
      launchApp("welcome");
      break;
    case "app.newWindow":
      if (focused)
        launchApp(focused.appId);
      break;
    case "app.quit":
      if (focused)
        store.closeApp(focused.appId);
      break;
    case "app.hide":
      if (focused)
        store.hideApp(focused.appId);
      break;
    case "window.close":
      if (focused)
        store.closeWindow(focused.id);
      break;
    case "window.minimize":
      if (focused)
        store.minimizeWindow(focused.id);
      break;
    case "window.zoom":
      if (focused)
        store.toggleMaximize(focused.id);
      break;
    case "window.rememberSize": {
      // A window mid-maximize/snap has a `rect` that reflects that mode, not
      // a size worth remembering as the app's future default — fall back to
      // `restoreRect` (the pre-maximize/snap bounds) whenever one exists.
      if (!focused)
        break;
      const size = focused.mode === "normal" ? focused.rect : (focused.restoreRect ?? focused.rect);
      useSettingsStore.getState().setDefaultWindowSize(focused.appId, {
        width: size.width,
        height: size.height,
      });
      notify({
        title: "Window size remembered",
        body: `${getApp(focused.appId)?.name ?? focused.appId} will open at this size from now on.`,
      });
      break;
    }
  }
}
