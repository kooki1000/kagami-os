import type { ComponentType, LazyExoticComponent } from "react";

/** Props every app window component receives from the shell. */
export interface AppWindowProps {
  windowId: string;
  focused: boolean;
  /** Launch data delivered by the opener (see `openFile.ts`'s FilePayload). */
  payload?: unknown;
}

/** Commands the shell knows how to execute on behalf of menu items. */
export type CommandId
  = | "app.newWindow"
    | "app.quit"
    | "app.hide"
    | "window.close"
    | "window.minimize"
    | "window.zoom"
    | "system.about";

export interface MenuItem {
  label: string;
  command?: CommandId;
  /**
   * App-defined command delivered to the focused window via the
   *  app-command bus (`useAppCommand`) instead of the shell.
   */
  appCommand?: string;
  shortcut?: string;
  disabled?: boolean;
  dividerAfter?: boolean;
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
}

export interface AppManifest {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number | string; size?: number | string }>;
  /** Dock/desktop tile background, [from, to] of a 135° gradient. */
  tileGradient: [string, string];
  defaultSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  component: LazyExoticComponent<ComponentType<AppWindowProps>>;
  menus?: MenuSection[];
  singleInstance?: boolean;
  /** Pinned to the dock by default. */
  pinned?: boolean;
  /** 'system' apps (e.g. Settings) sit after the dock separator. */
  dockZone?: "apps" | "system";
  /**
   * Session restore (C1) opt-in. An app whose windows carry launch data
   * worth reopening (e.g. "which file") implements both: `serializePayload`
   * turns the live payload into JSON-safe data at save time, `restorePayload`
   * turns it back at boot (returning `undefined` drops the restore, e.g. if
   * the referenced file no longer exists). An app that implements neither
   * still gets its window position/mode restored — it just reopens bare.
   */
  serializePayload?: (payload: unknown) => unknown;
  restorePayload?: (json: unknown) => unknown;
}
