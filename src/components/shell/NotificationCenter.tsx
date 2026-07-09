import { BellOff, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { useNotificationStore } from "@/system/notifications/notificationStore";
import { MENU_BAR_HEIGHT } from "@/system/windows/windowStore";
import { NotificationGlyph } from "./NotificationGlyph";

/** Persistent notification history, opened from the menu-bar bell. */
export function NotificationCenter() {
  const open = useNotificationStore(s => s.centerOpen);
  const items = useNotificationStore(s => s.items);
  const closeCenter = useNotificationStore(s => s.closeCenter);
  const clearAll = useNotificationStore(s => s.clearAll);
  const remove = useNotificationStore(s => s.remove);

  if (!open)
    return null;

  return (
    <>
      <div className="fixed inset-0 z-45" onPointerDown={closeCenter} />
      <div
        className="fixed right-3 z-50 flex max-h-[70vh] w-84 animate-flyout-in flex-col overflow-hidden rounded-[15px] shadow-(--shadow-deep) chrome hairline"
        style={{ top: MENU_BAR_HEIGHT + 8 }}
      >
        <div className="flex flex-none items-center justify-between px-4 py-2.5 hairline-b">
          <span className="text-[13px] font-semibold text-ink">Notifications</span>
          {items.length > 0 && (
            <button
              type="button"
              className="rounded-btn px-1.5 py-0.5 text-[11.5px] font-medium text-ink-2 hover:bg-ph hover:text-ink"
              onClick={clearAll}
            >
              Clear All
            </button>
          )}
        </div>

        {items.length === 0
          ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-ink-2">
                <BellOff size={22} strokeWidth={1.5} />
                <span className="text-[12.5px]">No notifications</span>
              </div>
            )
          : (
              <div className="min-h-0 flex-1 overflow-auto p-2">
                {items.map(n => (
                  <div
                    key={n.id}
                    className="group relative flex items-start gap-2.5 rounded-[11px] p-2.5 hover:bg-ph"
                  >
                    <NotificationGlyph notification={n} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[12.5px] font-semibold text-ink">
                          {n.title}
                        </span>
                        <span className="ml-auto flex-none text-[10.5px] text-ink-2">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>
                      {n.body && (
                        <div className="mt-0.5 text-[11.5px] leading-snug text-ink-2">
                          {n.body}
                        </div>
                      )}
                      {n.action && (
                        <button
                          type="button"
                          className="mt-1.5 rounded-btn bg-ph px-2 py-0.75 text-[11px] font-semibold text-accent hover:bg-ph-2"
                          onClick={() => {
                            n.action?.run();
                            remove(n.id);
                          }}
                        >
                          {n.action.label}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label="Remove notification"
                      className="grid size-5 flex-none place-items-center rounded-full text-ink-2 opacity-0 group-hover:opacity-100 hover:bg-ph-2"
                      onClick={() => remove(n.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
      </div>
    </>
  );
}
