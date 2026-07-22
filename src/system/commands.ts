import type { CommandId } from "./apps/types";
import { launchApp } from "./apps/launch";
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
  }
}
