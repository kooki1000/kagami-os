import type { Dispatch, SetStateAction } from "react";
import type { MenuItem, MenuSection } from "@/system/apps/types";
import type { ThemePreference } from "@/system/theme/themeStore";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatShortcut } from "@/lib/format";
import { emitAppCommand } from "@/system/appCommands";
import { getApp } from "@/system/apps/registry";
import { executeCommand } from "@/system/commands";
import {
  selectUnreadCount,
  useNotificationStore,
} from "@/system/notifications/notificationStore";
import { useOverlayOpen } from "@/system/overlay/overlayRegistry";
import { useSearchStore } from "@/system/search/searchStore";
import { useThemeStore } from "@/system/theme/themeStore";
import { MENU_BAR_HEIGHT, useWindowStore } from "@/system/windows/windowStore";

interface BarMenuItem {
  /** Stable per-position id — not the label, which apps aren't guaranteed to keep unique. */
  id: string;
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
  // Keyed by position, not `section.title`/`item.label` — apps don't
  // guarantee those are unique, and the ARIA wiring here (aria-expanded,
  // the trigger-ref map, the highlight index) needs identity duplicates
  // can't collide on.
  return sections.map((section, sectionIndex) => ({
    key: `app-${sectionIndex}`,
    title: section.title,
    items: section.items.map((item, itemIndex) => ({
      id: `app-${sectionIndex}-${itemIndex}`,
      label: item.label,
      shortcut: item.shortcut,
      disabled: item.disabled || (!item.command && !item.appCommand),
      dividerAfter: item.dividerAfter,
      action: itemAction(item),
    })),
  }));
}

/** Next highlighted index in `direction`, wrapping and skipping disabled items. */
function stepHighlight(items: BarMenuItem[], current: number, direction: 1 | -1): number {
  const count = items.length;
  if (count === 0)
    return -1;
  let idx = current;
  for (let i = 0; i < count; i++) {
    idx = (idx + direction + count) % count;
    if (!items[idx].disabled)
      return idx;
  }
  return current;
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
  const [highlighted, setHighlighted] = useState(-1);
  const triggerButtonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  // A fresh inline ref callback every render would make React detach and
  // reattach every trigger button's ref on every render (window-focus
  // changes, notification-count updates, ...) — one stable callback per
  // menu key instead.
  const triggerRefCallbacksRef = useRef<Record<string, (el: HTMLButtonElement | null) => void>>({});
  function triggerRef(key: string): (el: HTMLButtonElement | null) => void {
    return (triggerRefCallbacksRef.current[key] ??= (el) => {
      triggerButtonsRef.current[key] = el;
    });
  }

  // Something modal-ish (a dropdown) is open — global shortcuts back off
  // (system/shortcuts.ts) while this is true.
  useOverlayOpen(openKey !== null);

  // Close any open menu when focus moves to another window/desktop
  // (state adjustment during render instead of an effect).
  const [lastFocusedId, setLastFocusedId] = useState(focusedId);
  if (lastFocusedId !== focusedId) {
    setLastFocusedId(focusedId);
    setOpenKey(null);
  }

  // Clear any stale highlight whenever the open menu changes (by click,
  // hover-switch, or arrow-key switch) — state adjustment during render,
  // matching lastFocusedId above.
  const [lastOpenKey, setLastOpenKey] = useState(openKey);
  if (lastOpenKey !== openKey) {
    setLastOpenKey(openKey);
    setHighlighted(-1);
  }

  const app = focusedAppId ? getApp(focusedAppId) : undefined;

  const appearanceItem = (id: string, label: string, pref: ThemePreference): BarMenuItem => ({
    id,
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
        id: "system-about",
        label: "About Kagami OS",
        action: () => executeCommand("system.about"),
        dividerAfter: true,
      },
      appearanceItem("system-appearance-light", "Light Appearance", "light"),
      appearanceItem("system-appearance-dark", "Dark Appearance", "dark"),
      appearanceItem("system-appearance-auto", "Auto Appearance", "auto"),
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
                    id: "app-new-window",
                    label: `New ${app.name} Window`,
                    action: () => executeCommand("app.newWindow"),
                  },
                ]
              : []),
            {
              id: "app-quit",
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

  function closeMenu(): void {
    setOpenKey(null);
  }

  /** Escape closes and returns focus to the trigger button that opened it. */
  function closeMenuAndRefocus(key: string): void {
    setOpenKey(null);
    triggerButtonsRef.current[key]?.focus();
  }

  /** ArrowLeft/ArrowRight — switch to the adjacent top-level menu, staying open. */
  function navigateMenu(direction: 1 | -1): void {
    if (openKey === null)
      return;
    const idx = menus.findIndex(m => m.key === openKey);
    if (idx === -1)
      return;
    const next = menus[(idx + direction + menus.length) % menus.length];
    setOpenKey(next.key);
  }

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
                ref={triggerRef(menu.key)}
                type="button"
                aria-haspopup="true"
                aria-expanded={openKey === menu.key}
                aria-activedescendant={
                  openKey === menu.key && highlighted >= 0
                    ? `menuitem-${menu.items[highlighted]?.id}`
                    : undefined
                }
                className={`flex items-center gap-1.75 rounded-btn px-2 py-0.5 ${
                  menu.bold ? "font-semibold" : "opacity-80"
                } ${openKey === menu.key ? "bg-ph-2" : "hover:bg-ph"}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // WebKit doesn't focus a <button> on click at all (unlike
                  // Chromium/Firefox), so the trigger's own onKeyDown below
                  // would never fire there without this explicit call.
                  e.currentTarget.focus();
                  setOpenKey(openKey === menu.key ? null : menu.key);
                }}
                onPointerEnter={() => {
                  if (openKey && openKey !== menu.key)
                    setOpenKey(menu.key);
                }}
                onKeyDown={(e) => {
                  // Real focus stays on the trigger button — moving it into
                  // the popup races Chromium's async "focus follows click"
                  // and loses. Highlighting goes through `aria-activedescendant`
                  // instead, per the WAI-ARIA menu-button pattern.
                  if (openKey !== menu.key) {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenKey(menu.key);
                    }
                    return;
                  }
                  switch (e.key) {
                    case "ArrowDown":
                      e.preventDefault();
                      setHighlighted(idx => stepHighlight(menu.items, idx, 1));
                      return;
                    case "ArrowUp":
                      e.preventDefault();
                      setHighlighted(idx => stepHighlight(menu.items, idx, -1));
                      return;
                    case "Enter": {
                      e.preventDefault();
                      const item = menu.items[highlighted];
                      if (item && !item.disabled) {
                        item.action?.();
                        closeMenu();
                      }
                      return;
                    }
                    case "Escape":
                      e.preventDefault();
                      closeMenuAndRefocus(menu.key);
                      return;
                    case "ArrowLeft":
                      e.preventDefault();
                      navigateMenu(-1);
                      return;
                    case "ArrowRight":
                      e.preventDefault();
                      navigateMenu(1);
                  }
                }}
              >
                {i === 0 && (
                  <span className="size-3 rotate-45 rounded-[3px] bg-accent" />
                )}
                {menu.title}
              </button>
              {openKey === menu.key && (
                <DropMenu
                  items={menu.items}
                  highlighted={highlighted}
                  setHighlighted={setHighlighted}
                  onClose={closeMenu}
                />
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

function DropMenu({
  items,
  highlighted,
  setHighlighted,
  onClose,
}: {
  items: BarMenuItem[];
  highlighted: number;
  setHighlighted: Dispatch<SetStateAction<number>>;
  onClose: () => void;
}) {
  return (
    <div
      role="menu"
      className="absolute top-full left-0 z-50 mt-1 min-w-52 rounded-[10px] p-1 shadow-(--shadow-deep) chrome hairline"
      onPointerDown={e => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <div key={item.id}>
          <button
            type="button"
            id={`menuitem-${item.id}`}
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            data-highlighted={i === highlighted ? "true" : undefined}
            className={`flex w-full items-center justify-between gap-6 rounded-btn px-2.5 py-1 text-left text-[13px] ${
              item.disabled
                ? "text-ink-2 opacity-50"
                : i === highlighted
                  ? "bg-accent text-white"
                  : "text-ink hover:bg-accent hover:text-white"
            }`}
            onPointerEnter={() => {
              if (!item.disabled)
                setHighlighted(i);
            }}
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
