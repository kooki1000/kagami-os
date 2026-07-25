import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_TTL_MS, useNotificationStore } from "./notificationStore";

const api = () => useNotificationStore.getState();

beforeEach(() => {
  useNotificationStore.setState({ items: [], toastIds: [], centerOpen: false });
});

describe("notification history limit", () => {
  it("never leaves a toast id pointing at an evicted item", () => {
    // History caps at 50; a long session pushes well past it.
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

// review-backlog.md §3 / T4: expiry used to be implicit — a toast past the
// render cap never mounted, so its timer never started and its id sat in
// `toastIds` until the visible batch cleared, then it "resurrected" with a
// fresh full timer. Expiry is now store-owned via `expiresAt`, independent
// of whether anything ever rendered the toast.
describe("toast expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps every notification with an expiresAt at creation time, not render time", () => {
    // Simulate the repro: several notifications fire in the same instant,
    // several beyond any render cap the UI might apply.
    const ids = Array.from({ length: 8 }, (_, i) => api().notify({ title: `event ${i}` }));

    const deadlines = ids.map(id => api().items.find(n => n.id === id)!.expiresAt);
    expect(deadlines.every(d => d === TOAST_TTL_MS)).toBe(true);
  });

  it("pruneExpiredToasts drops only ids past their own deadline", () => {
    const early = api().notify({ title: "early" });
    vi.setSystemTime(TOAST_TTL_MS - 1);
    const late = api().notify({ title: "late" });

    // `early` expires at TOAST_TTL_MS, `late` at (TOAST_TTL_MS - 1) + TOAST_TTL_MS.
    api().pruneExpiredToasts(TOAST_TTL_MS);

    expect(api().toastIds).toEqual([late]);
    // Still in history — pruning only retires the toast, not the record.
    expect(api().items.map(n => n.id)).toEqual(expect.arrayContaining([early, late]));
  });

  it("a toast queued behind others keeps counting down even while never rendered", () => {
    // Nothing in the store models "rendered" — expiresAt is set once, at
    // notify() time, regardless of how many toasts are ahead of it.
    const first = api().notify({ title: "first" });
    const queued = api().notify({ title: "queued (would be past a render cap)" });

    vi.setSystemTime(TOAST_TTL_MS + 1);
    api().pruneExpiredToasts();

    expect(api().toastIds).not.toContain(first);
    expect(api().toastIds).not.toContain(queued);
  });

  it("pauseToast suspends the deadline and resumeToast restarts it", () => {
    const id = api().notify({ title: "hovered" });
    api().pauseToast(id);

    vi.setSystemTime(TOAST_TTL_MS + 1000);
    api().pruneExpiredToasts();
    expect(api().toastIds).toContain(id);

    api().resumeToast(id);
    expect(api().items.find(n => n.id === id)!.expiresAt).toBe(TOAST_TTL_MS + 1000 + TOAST_TTL_MS);

    vi.setSystemTime(TOAST_TTL_MS + 1000 + TOAST_TTL_MS + 1);
    api().pruneExpiredToasts();
    expect(api().toastIds).not.toContain(id);
  });
});
