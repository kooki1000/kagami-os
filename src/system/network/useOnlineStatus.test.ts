import type { OnlineEventTarget } from "./useOnlineStatus";
import { describe, expect, it, vi } from "vitest";
import { subscribeOnlineStatus } from "./useOnlineStatus";

/** A minimal fake `window` — just enough surface for `subscribeOnlineStatus`. */
function fakeTarget(): OnlineEventTarget & { fire: (type: "online" | "offline") => void } {
  const listeners: Record<string, Set<() => void>> = { online: new Set(), offline: new Set() };
  return {
    addEventListener: (type, listener) => listeners[type].add(listener),
    removeEventListener: (type, listener) => listeners[type].delete(listener),
    fire: (type) => {
      for (const listener of listeners[type]) listener();
    },
  };
}

describe("subscribeOnlineStatus", () => {
  it("reports true on an online event and false on offline", () => {
    const target = fakeTarget();
    const onChange = vi.fn();
    subscribeOnlineStatus(target, onChange);

    target.fire("online");
    expect(onChange).toHaveBeenLastCalledWith(true);

    target.fire("offline");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("stops notifying once unsubscribed", () => {
    const target = fakeTarget();
    const onChange = vi.fn();
    const unsubscribe = subscribeOnlineStatus(target, onChange);

    unsubscribe();
    target.fire("online");
    target.fire("offline");

    expect(onChange).not.toHaveBeenCalled();
  });
});
