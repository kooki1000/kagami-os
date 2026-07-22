import type { ContextMenuEntry } from "@/components/ui/ContextMenu";
import type { AppManifest } from "@/system/apps/types";
import type { DockPosition } from "@/system/dock/dockStore";
import type { OsWindow } from "@/system/windows/windowStore";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { launchApp } from "@/system/apps/launch";
import { getApp } from "@/system/apps/registry";
import { DOCK_TILE_PX, useDockStore } from "@/system/dock/dockStore";
import { useWindowStore } from "@/system/windows/windowStore";

interface ContextMenuState {
  appId: string;
  x: number;
  y: number;
}

/** Per-position layout fragments (container placement + hover direction). */
const POSITION: Record<DockPosition, {
  container: string;
  hover: string;
  tooltip: string;
  dot: string;
  separator: string;
}> = {
  bottom: {
    container: "bottom-3.5 left-1/2 -translate-x-1/2 flex-row items-end",
    hover: "hover:-translate-y-3.25",
    tooltip: "-top-8.5 left-1/2 -translate-x-1/2",
    dot: "-bottom-1.5 left-1/2 -translate-x-1/2",
    separator: "h-8.5 w-px",
  },
  left: {
    container: "left-3.5 top-1/2 -translate-y-1/2 flex-col items-start",
    hover: "hover:translate-x-3.25",
    tooltip: "left-full top-1/2 ml-2.5 -translate-y-1/2",
    dot: "-left-1.5 top-1/2 -translate-y-1/2",
    separator: "w-8.5 h-px",
  },
  right: {
    container: "right-3.5 top-1/2 -translate-y-1/2 flex-col items-end",
    hover: "hover:-translate-x-3.25",
    tooltip: "right-full top-1/2 mr-2.5 -translate-y-1/2",
    dot: "-right-1.5 top-1/2 -translate-y-1/2",
    separator: "w-8.5 h-px",
  },
};

function topOf(windows: OsWindow[]): OsWindow | null {
  return windows.reduce<OsWindow | null>(
    (top, w) => (!top || w.zIndex > top.zIndex ? w : top),
    null,
  );
}

export function Dock() {
  const pinnedIds = useDockStore(s => s.pinnedIds);
  const size = useDockStore(s => s.size);
  const position = useDockStore(s => s.position);
  const pin = useDockStore(s => s.pin);
  const unpin = useDockStore(s => s.unpin);
  // Only the set of running app ids is reactive here — Dock renders an
  // "app is running" dot, not window geometry, so it must not re-render
  // on every drag/resize frame of an unrelated window.
  const runningIds = useWindowStore(useShallow(s => [...new Set(s.windows.map(w => w.appId))]));
  const focusWindow = useWindowStore(s => s.focusWindow);
  const restoreWindow = useWindowStore(s => s.restoreWindow);
  const closeApp = useWindowStore(s => s.closeApp);

  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuApp = menu ? getApp(menu.appId) : undefined;

  const layout = POSITION[position];
  const tilePx = DOCK_TILE_PX[size];
  const iconPx = Math.round(tilePx * 0.46);

  const itemIds = [
    ...pinnedIds,
    ...runningIds.filter(id => !pinnedIds.includes(id)),
  ];
  const items = itemIds
    .map(getApp)
    .filter((app): app is AppManifest => app !== undefined);
  const appZone = items.filter(a => a.dockZone !== "system");
  const systemZone = items.filter(a => a.dockZone === "system");

  function dockMenuEntries(app: AppManifest): ContextMenuEntry[] {
    const running = runningIds.includes(app.id);
    const pinned = pinnedIds.includes(app.id);
    return [
      {
        label: "New Window",
        run: () => launchApp(app.id),
        disabled: Boolean(app.singleInstance && running),
      },
      {
        label: pinned ? "Unpin from Dock" : "Pin to Dock",
        run: () => (pinned ? unpin(app.id) : pin(app.id)),
        // Unpinning a non-running app would just vanish it mid-click; allow
        // it, but keep at least the interaction predictable by allowing both.
      },
      ...(running ? [{ label: "Quit", run: () => closeApp(app.id) }] : []),
    ];
  }

  function onTileClick(appId: string) {
    const appWindows = useWindowStore.getState().windows.filter(w => w.appId === appId);
    if (appWindows.length === 0) {
      launchApp(appId);
      return;
    }
    const visible = appWindows.filter(w => !w.minimized);
    if (visible.length > 0) {
      focusWindow(topOf(visible)!.id);
    }
    else {
      restoreWindow(topOf(appWindows)!.id);
    }
  }

  function renderTile(app: AppManifest) {
    const Icon = app.icon;
    const running = runningIds.includes(app.id);
    return (
      <button
        key={app.id}
        type="button"
        data-dock-app={app.id}
        aria-label={app.name}
        className={`group relative grid cursor-pointer place-items-center rounded-tile border-[0.5px] border-white/20 text-white shadow-[0_5px_12px_-4px_rgba(0,0,0,.42)] transition-[transform,box-shadow] duration-180 ease-[cubic-bezier(.2,.9,.25,1.4)] hover:scale-[1.06] hover:shadow-[0_16px_30px_-8px_rgba(0,0,0,.5)] ${layout.hover}`}
        style={{
          width: tilePx,
          height: tilePx,
          background: `linear-gradient(135deg, ${app.tileGradient[0]}, ${app.tileGradient[1]})`,
        }}
        onClick={() => onTileClick(app.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ appId: app.id, x: e.clientX, y: e.clientY });
        }}
      >
        <Icon size={iconPx} strokeWidth={1.8} />
        <span
          className={`pointer-events-none absolute z-10 rounded-btn bg-[rgba(20,18,15,.92)] px-2.25 py-0.75 text-[11px] font-medium whitespace-nowrap text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${layout.tooltip}`}
        >
          {app.name}
        </span>
        {running && (
          <span data-dock-running className={`absolute size-1 rounded-full bg-ink opacity-55 ${layout.dot}`} />
        )}
      </button>
    );
  }

  return (
    <>
      {menu && menuApp && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          header={menuApp.name}
          entries={dockMenuEntries(menuApp)}
          onClose={() => setMenu(null)}
        />
      )}
      <div
        className={`fixed z-30 flex gap-2.75 rounded-[19px] px-3 py-2.25 shadow-[0_12px_34px_-10px_rgba(0,0,0,.4)] chrome-2 select-none hairline ${layout.container}`}
      >
        {appZone.map(renderTile)}
        {appZone.length > 0 && systemZone.length > 0 && (
          <div className={`self-center bg-hairline ${layout.separator}`} />
        )}
        {systemZone.map(renderTile)}
      </div>
    </>
  );
}
