import { useEffect, useState } from "react";

/** The slice of `window` this needs — injectable so the wiring is testable without jsdom. */
export interface OnlineEventTarget {
  addEventListener: (type: "online" | "offline", listener: () => void) => void;
  removeEventListener: (type: "online" | "offline", listener: () => void) => void;
}

/**
 * Wires `onChange` to `target`'s `online`/`offline` events, returning an
 * unsubscribe function. Pure aside from the injected target, so this is the
 * unit-testable seam (see `useOnlineStatus.test.ts`) — the hook below is a
 * thin React wrapper covered by E2E instead, matching this repo's
 * node-environment test convention (no jsdom/RTL).
 */
export function subscribeOnlineStatus(
  target: OnlineEventTarget,
  onChange: (online: boolean) => void,
): () => void {
  const goOnline = () => onChange(true);
  const goOffline = () => onChange(false);
  target.addEventListener("online", goOnline);
  target.addEventListener("offline", goOffline);
  return () => {
    target.removeEventListener("online", goOnline);
    target.removeEventListener("offline", goOffline);
  };
}

/**
 * `navigator.onLine` plus the `online`/`offline` window events. This is a
 * connectivity *presence* signal only (F2) — it says nothing about a sync
 * queue, because there isn't one yet (that's Phase 13/A4).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === "undefined")
      return undefined;
    return subscribeOnlineStatus(window, setOnline);
  }, []);

  return online;
}
