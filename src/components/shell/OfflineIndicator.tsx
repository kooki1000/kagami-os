import { WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useOnlineStatus } from "@/system/network/useOnlineStatus";
import { notify } from "@/system/notifications/notificationStore";

/** Fires a one-line toast on each online/offline transition — not on mount. */
function useOfflineToast(online: boolean): void {
  const lastRef = useRef(online);
  useEffect(() => {
    if (lastRef.current === online)
      return;
    lastRef.current = online;
    notify(
      online
        ? { title: "Back online", body: "Reconnected." }
        : { title: "You're offline", body: "Kagami keeps working locally." },
    );
  }, [online]);
}

/** Monochrome menu-bar pill shown only while offline (F2) — presence only, no sync queue exists yet. */
export function OfflineIndicator() {
  const online = useOnlineStatus();
  useOfflineToast(online);

  if (online)
    return null;

  return (
    <span
      role="status"
      aria-label="Offline"
      className="flex items-center gap-1 rounded-full bg-ph px-2 py-[calc(2px*var(--ui-scale))] text-11 font-medium text-ink-2"
    >
      <WifiOff className="size-3" />
      Offline
    </span>
  );
}
