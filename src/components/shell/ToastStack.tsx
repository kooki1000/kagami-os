import type { KagamiNotification } from "@/system/notifications/notificationStore";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useNotificationStore } from "@/system/notifications/notificationStore";
import { MENU_BAR_HEIGHT } from "@/system/windows/windowStore";
import { NotificationGlyph } from "./NotificationGlyph";

const MAX_VISIBLE = 4;
// Frequent enough that a dismissal feels immediate, cheap enough to run for
// the whole session — pruning is a single filter over at most a handful of
// ids either way.
const PRUNE_INTERVAL_MS = 250;

function Toast({ notification }: { notification: KagamiNotification }) {
  const dismissToast = useNotificationStore(s => s.dismissToast);
  const pauseToast = useNotificationStore(s => s.pauseToast);
  const resumeToast = useNotificationStore(s => s.resumeToast);

  return (
    <div
      className="pointer-events-auto flex w-80 animate-toast-in items-start gap-[calc(10px*var(--ui-scale))] rounded-tile p-3 shadow-(--shadow-deep) chrome hairline"
      onPointerEnter={() => pauseToast(notification.id)}
      onPointerLeave={() => resumeToast(notification.id)}
    >
      <NotificationGlyph notification={notification} />
      <div className="min-w-0 flex-1">
        <div className="text-12.5 font-semibold text-ink">{notification.title}</div>
        {notification.body && (
          <div className="mt-0.5 text-11.5/snug text-ink-2">
            {notification.body}
          </div>
        )}
        {notification.action && (
          <button
            type="button"
            className="mt-1.5 rounded-btn bg-ph px-2 py-[calc(3px*var(--ui-scale))] text-11 font-semibold text-accent hover:bg-ph-2"
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

  // Expiry is store-owned (each notification carries its own `expiresAt`),
  // so a toast queued behind MAX_VISIBLE others still counts down even
  // though it's never mounted — this single interval is what retires it,
  // rather than a `Toast` component's own timer (review-backlog.md §3).
  useEffect(() => {
    const id = window.setInterval(() => {
      useNotificationStore.getState().pruneExpiredToasts();
    }, PRUNE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // `toastIds` is oldest-first (appended on arrival); slicing from the front
  // keeps the oldest queued toasts on screen and renders newest-last, so the
  // stack drains in the order notifications arrived instead of newest-first.
  const byId = new Map(items.map(n => [n.id, n]));
  const visible = toastIds
    .map(id => byId.get(id))
    .filter((n): n is KagamiNotification => n !== undefined)
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
