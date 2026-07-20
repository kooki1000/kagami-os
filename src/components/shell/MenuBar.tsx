import type { MenuItem, MenuSection } from "@/system/apps/types";
import type { ThemePreference } from "@/system/theme/themeStore";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { formatShortcut } from "@/lib/format";
import { emitAppCommand } from "@/system/appCommands";
import { getApp } from "@/system/apps/registry";
import { executeCommand } from "@/system/commands";
import {
  selectUnreadCount,
  useNotificationStore,
} from "@/system/notifications/notificationStore";
import { useSearchStore } from "@/system/search/searchStore";
import { useThemeStore } from "@/system/theme/themeStore";
import { MENU_BAR_HEIGHT, useWindowStore } from "@/system/windows/windowStore";

interface BarMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  dividerAfter?: boolean;
  action?: () => void;
}

interface BarMenu {
  key: string;
  title: string;
  bold?: boolean;
  items: BarMenuItem[];
}

function runAppCommand(command: string): void {
  const focusedId = useWindowStore.getState().focusedId;
  if (focusedId)
    emitAppCommand(focusedId, command);
}

function itemAction(item: MenuItem): (() => void) | undefined {
  if (item.command) {
    const command = item.command;
    return () => executeCommand(command);
  }
  if (item.appCommand) {
    const command = item.appCommand;
    return () => runAppCommand(command);
  }
  return undefined;
}

function fromSections(sections: MenuSection[]): BarMenu[] {
  return sections.map(section => ({
    key: `app-${section.title}`,
    title: section.title,
    items: section.items.map(item => ({
      label: item.label,
      shortcut: item.shortcut,
      disabled: item.disabled || (!item.command && !item.appCommand),
      dividerAfter: item.dividerAfter,
      action: itemAction(item),
    })),
  }));
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const hours = ((now.getHours() + 11) % 12) + 1;
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return (
    <span className="tabular-nums">
      {weekday}
      {" "}
      {hours}
      :
      {minutes}
    </span>
  );
}

export function MenuBar() {
  const focusedId = useWindowStore(s => s.focusedId);
  // Select just the appId (a primitive), not the window object — the menu
  // bar only needs to know *which app* is focused, so it shouldn't
  // re-render on every drag/resize frame of the focused window.
  const focusedAppId = useWindowStore((s) => {
    const w = s.windows.find(win => win.id === s.focusedId && !win.minimized);
    return w?.appId;
  });
  const preference = useThemeStore(s => s.preference);
  const resolved = useThemeStore(s => s.resolved);
  const setPreference = useThemeStore(s => s.setPreference);
  const toggleResolved = useThemeStore(s => s.toggleResolved);
  const unreadCount = useNotificationStore(selectUnreadCount);
  const centerOpen = useNotificationStore(s => s.centerOpen);
  const openCenter = useNotificationStore(s => s.openCenter);
  const closeCenter = useNotificationStore(s => s.closeCenter);
  const openSearch = useSearchStore(s => s.openSearch);

  const [openKey, setOpenKey] = useState<string | null>(null);

  // Close any open menu when focus moves to another window/desktop
  // (state adjustment during render instead of an effect).
  const [lastFocusedId, setLastFocusedId] = useState(focusedId);
  if (lastFocusedId !== focusedId) {
    setLastFocusedId(focusedId);
    setOpenKey(null);
  }

  const app = focusedAppId ? getApp(focusedAppId) : undefined;

  const appearanceItem = (label: string, pref: ThemePreference): BarMenuItem => ({
    label,
    checked: preference === pref,
    action: () => setPreference(pref),
  });

  const systemMenu: BarMenu = {
    key: "system",
    title: "Kagami",
    bold: true,
    items: [
      {
        label: "About Kagami OS",
        action: () => executeCommand("system.about"),
        dividerAfter: true,
      },
      appearanceItem("Light Appearance", "light"),
      appearanceItem("Dark Appearance", "dark"),
      appearanceItem("Auto Appearance", "auto"),
    ],
  };

  const appMenus: BarMenu[] = app
    ? [
        {
          key: "app-name",
          title: app.name,
          bold: true,
          items: [
            ...(!app.singleInstance
              ? [
                  {
                    label: `New ${app.name} Window`,
                    action: () => executeCommand("app.newWindow"),
                  },
                ]
              : []),
            {
              label: `Quit ${app.name}`,
              shortcut: "⌘Q",
              action: () => executeCommand("app.quit"),
            },
          ],
        },
        ...fromSections(app.menus ?? []),
      ]
    : [];

  const menus = [systemMenu, ...appMenus];

  return (
    <>
      {openKey && (
        <div className="fixed inset-0 z-30" onPointerDown={() => setOpenKey(null)} />
      )}
      <div
        className="fixed inset-x-0 top-0 z-40 flex items-center px-3.75 text-[13px] text-ink chrome select-none hairline-b"
        style={{ height: MENU_BAR_HEIGHT }}
      >
        <div className="flex items-center">
          {menus.map((menu, i) => (
            <div key={menu.key} className="relative">
              <button
                type="button"
                className={`flex items-center gap-1.75 rounded-btn px-2 py-0.5 ${
                  menu.bold ? "font-semibold" : "opacity-80"
                } ${openKey === menu.key ? "bg-ph-2" : "hover:bg-ph"}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setOpenKey(openKey === menu.key ? null : menu.key);
                }}
                onPointerEnter={() => {
                  if (openKey && openKey !== menu.key)
                    setOpenKey(menu.key);
                }}
              >
                {i === 0 && (
                  <span className="size-3 rotate-45 rounded-[3px] bg-accent" />
                )}
                {menu.title}
              </button>
              {openKey === menu.key && (
                <DropMenu items={menu.items} onClose={() => setOpenKey(null)} />
              )}
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3.5 text-[12.5px] opacity-80">
          <button
            type="button"
            aria-label="Search"
            className="grid place-items-center rounded-md p-0.5 hover:bg-ph"
            onClick={openSearch}
          >
            <Search className="size-3.25" />
          </button>
          <button
            type="button"
            aria-label="Toggle appearance"
            className="grid place-items-center rounded-md p-0.5 hover:bg-ph"
            onClick={toggleResolved}
          >
            {resolved === "dark"
              ? (
                  <Sun className="size-3.25" />
                )
              : (
                  <Moon className="size-3.25" />
                )}
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="relative grid place-items-center rounded-md p-0.5 hover:bg-ph"
            onClick={() => (centerOpen ? closeCenter() : openCenter())}
          >
            <Bell className="size-3.25" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-3 rounded-full bg-accent-2 px-0.75 text-center text-[8px]/3 font-bold text-white tabular-nums">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <Clock />
        </div>
      </div>
    </>
  );
}

function DropMenu({ items, onClose }: { items: BarMenuItem[]; onClose: () => void }) {
  return (
    <div
      className="absolute top-full left-0 z-50 mt-1 min-w-52 rounded-[10px] p-1 shadow-(--shadow-deep) chrome hairline"
      onPointerDown={e => e.stopPropagation()}
    >
      {items.map(item => (
        <div key={item.label}>
          <button
            type="button"
            disabled={item.disabled}
            className={`flex w-full items-center justify-between gap-6 rounded-btn px-2.5 py-1 text-left text-[13px] ${
              item.disabled
                ? "text-ink-2 opacity-50"
                : "text-ink hover:bg-accent hover:text-white"
            }`}
            onClick={() => {
              if (item.disabled)
                return;
              item.action?.();
              onClose();
            }}
          >
            <span className="flex items-center gap-1.5">
              {item.checked !== undefined && (
                <span className={`w-3 text-[11px] ${item.checked ? "" : "invisible"}`}>
                  ✓
                </span>
              )}
              {item.label}
            </span>
            {item.shortcut && (
              <span className="text-[11.5px] opacity-55">{formatShortcut(item.shortcut)}</span>
            )}
          </button>
          {item.dividerAfter && <div className="mx-2 my-1 hairline-b" />}
        </div>
      ))}
    </div>
  );
}
