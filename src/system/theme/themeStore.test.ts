import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/testUtils/memoryStorage";

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
