import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// See settingsStore.test.ts (system/settings) for why the persist wiring
// needs a stubbed localStorage under this suite's plain Node environment.
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
  // themeStore reads matchMedia at module scope.
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("themeStore persistence", () => {
  it("declares a persist version so a future shape change can migrate", async () => {
    const { useThemeStore } = await import("./themeStore");
    expect(useThemeStore.persist.getOptions().version).toBe(1);
  });

  it("drops mismatched-version persisted data instead of applying it blindly", async () => {
    localStorage.setItem(
      "kagami-theme",
      JSON.stringify({ state: { preference: "dark" }, version: 0 }),
    );
    const { useThemeStore } = await import("./themeStore");
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().preference).toBe("auto");
  });
});
