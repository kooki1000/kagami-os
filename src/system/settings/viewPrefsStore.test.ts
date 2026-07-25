import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// See settingsStore.test.ts for why the persist wiring needs a stubbed
// localStorage under this suite's plain Node environment.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("viewPrefsStore persistence", () => {
  it("declares a persist version so a future shape change can migrate", async () => {
    const { useViewPrefsStore } = await import("./viewPrefsStore");
    expect(useViewPrefsStore.persist.getOptions().version).toBe(1);
  });

  it("drops mismatched-version persisted data instead of applying it blindly", async () => {
    localStorage.setItem(
      "kagami-view-prefs",
      JSON.stringify({ state: { sortByFolder: { stale: { key: "date", dir: "desc" } } }, version: 0 }),
    );
    const { useViewPrefsStore } = await import("./viewPrefsStore");
    await useViewPrefsStore.persist.rehydrate();
    expect(useViewPrefsStore.getState().sortByFolder).toEqual({});
  });
});
