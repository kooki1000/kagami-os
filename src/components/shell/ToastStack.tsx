import type { KagamiNotification } from "@/system/notifications/notificationStore";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNotificationStore } from "@/system/notifications/notificationStore";
import { MENU_BAR_HEIGHT } from "@/system/windows/windowStore";
import { NotificationGlyph } from "./NotificationGlyph";

const TOAST_MS = 5000;
const MAX_VISIBLE = 4;

function Toast({ notification }: { notification: KagamiNotification }) {
  const dismissToast = useNotificationStore(s => s.dismissToast);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused)
      return;
    const timer = window.setTimeout(dismissToast, TOAST_MS, notification.id);
    return () => window.clearTimeout(timer);
  }, [paused, notification.id, dismissToast]);

  return (
    <div
      className="pointer-events-auto flex w-80 animate-toast-in items-start gap-2.5 rounded-tile p-3 shadow-(--shadow-deep) chrome hairline"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <NotificationGlyph notification={notification} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-ink">{notification.title}</div>
        {notification.body && (
          <div className="mt-0.5 text-[11.5px] leading-snug text-ink-2">
            {notification.body}
          </div>
        )}
        {notification.action && (
          <button
            type="button"
            className="mt-1.5 rounded-btn bg-ph px-2 py-0.75 text-[11px] font-semibold text-accent hover:bg-ph-2"
            onClick={() => {
              notification.action?.run();
              dismissToast(notification.id);
            }}
          >
            {notification.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="grid size-5 flex-none place-items-center rounded-full text-ink-2 hover:bg-ph"
        onClick={() => dismissToast(notification.id)}
      >
        <X size={12} />
      </button>
    </div>
  );
}

/** Transient toast stack, anchored top-right below the menu bar. */
export function ToastStack() {
  const items = useNotificationStore(s => s.items);
  const toastIds = useNotificationStore(s => s.toastIds);

  const visible = items
    .filter(n => toastIds.includes(n.id))
    .slice(0, MAX_VISIBLE);

  if (visible.length === 0)
    return null;

  return (
    <div
      className="pointer-events-none fixed right-3 z-50 flex flex-col gap-2"
      style={{ top: MENU_BAR_HEIGHT + 8 }}
    >
      {visible.map(n => (
        <Toast key={n.id} notification={n} />
      ))}
    </div>
  );
}
