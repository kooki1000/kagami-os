import { beforeEach, describe, expect, it } from "vitest";
import { useNotificationStore } from "./notificationStore";

const api = () => useNotificationStore.getState();

beforeEach(() => {
  useNotificationStore.setState({ items: [], toastIds: [], centerOpen: false });
});

describe("notification history limit", () => {
  it("never leaves a toast id pointing at an evicted item", () => {
    // History is capped at 50; a long session pushes well past it.
    for (let i = 0; i < 120; i++)
      api().notify({ title: `event ${i}` });

    const { items, toastIds } = api();
    const live = new Set(items.map(n => n.id));

    expect(items.length).toBeLessThanOrEqual(50);
    expect(toastIds.filter(t => !live.has(t))).toEqual([]);
    expect(toastIds.length).toBeLessThanOrEqual(items.length);
  });

  it("still queues a toast for each new notification while under the cap", () => {
    api().notify({ title: "one" });
    api().notify({ title: "two" });

    expect(api().toastIds).toHaveLength(2);
  });

  it("dismissing a toast leaves the notification in history", () => {
    const id = api().notify({ title: "kept" });
    api().dismissToast(id);

    expect(api().toastIds).toEqual([]);
    expect(api().items.map(n => n.id)).toEqual([id]);
  });
});
