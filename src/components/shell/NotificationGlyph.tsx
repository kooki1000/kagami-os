import type { KagamiNotification } from "@/system/notifications/notificationStore";
import { AlertTriangle, Bell } from "lucide-react";
import { getApp } from "@/system/apps/registry";

/** Rounded tile showing the source app's icon, or a tone-based fallback. */
export function NotificationGlyph({ notification }: { notification: KagamiNotification }) {
  const app = notification.appId ? getApp(notification.appId) : undefined;

  if (app) {
    const Icon = app.icon;
    return (
      <span
        className="grid size-8 flex-none place-items-center rounded-[9px] border-[0.5px] border-white/20 text-white"
        style={{ background: `linear-gradient(135deg, ${app.tileGradient[0]}, ${app.tileGradient[1]})` }}
      >
        <Icon size={17} strokeWidth={1.8} />
      </span>
    );
  }

  const danger = notification.tone === "danger";
  const Icon = danger ? AlertTriangle : Bell;
  return (
    <span
      className={`grid size-8 flex-none place-items-center rounded-[9px] text-white ${
        danger ? "bg-accent-2" : "bg-accent"
      }`}
    >
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}
