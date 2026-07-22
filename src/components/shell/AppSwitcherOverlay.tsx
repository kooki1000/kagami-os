import { getApp } from "@/system/apps/registry";
import { useOverlayOpen } from "@/system/overlay/overlayRegistry";
import { useSwitcherStore } from "@/system/windows/switcherStore";
import { MENU_BAR_HEIGHT } from "@/system/windows/windowStore";

/**
 * ⌥Tab / ⌃⌥Tab app switcher (C2) — shown while the modifier is held, moved
 * by repeated Tab, committed on release (see `windowShortcuts.ts`'s
 * `useWindowManagementShortcuts`). Unlike `SearchOverlay`, no pointer
 * handlers — a hold-and-release overlay isn't mouse-driven.
 */
export function AppSwitcherOverlay() {
  const open = useSwitcherStore(s => s.open);
  const order = useSwitcherStore(s => s.order);
  const index = useSwitcherStore(s => s.index);

  // Registers with the shared overlay registry so global shortcuts back off
  // while the switcher is up — same mechanism SearchOverlay uses.
  useOverlayOpen(open);

  if (!open)
    return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App switcher"
      className="fixed left-1/2 z-50 flex -translate-x-1/2 animate-flyout-in items-center gap-2.5 rounded-[15px] p-3 shadow-(--shadow-deep) chrome hairline"
      style={{ top: MENU_BAR_HEIGHT + 80 }}
    >
      {order.map((appId, i) => {
        const app = getApp(appId);
        if (!app)
          return null;
        const Icon = app.icon;
        return (
          <div
            key={appId}
            data-switcher-app={appId}
            className={`grid size-14 flex-none place-items-center rounded-tile border-[0.5px] border-white/20 text-white transition-transform ${
              i === index ? "scale-105 ring-2 ring-accent" : "opacity-70"
            }`}
            style={{ background: `linear-gradient(135deg, ${app.tileGradient[0]}, ${app.tileGradient[1]})` }}
          >
            <Icon size={22} strokeWidth={1.8} />
          </div>
        );
      })}
    </div>
  );
}
