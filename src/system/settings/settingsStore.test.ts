import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/testUtils/memoryStorage";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settingsStore persistence", () => {
  it("declares a persist version so a future shape change can migrate", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    expect(useSettingsStore.persist.getOptions().version).toBe(1);
  });

  it("drops mismatched-version persisted data instead of applying it blindly", async () => {
    localStorage.setItem(
      "kagami-settings",
      JSON.stringify({ state: { accentId: "stale-accent" }, version: 0 }),
    );
    const { useSettingsStore } = await import("./settingsStore");
    const { DEFAULT_ACCENT_ID } = await import("./palettes");
    await useSettingsStore.persist.rehydrate();
    // No `migrate` is registered, so a version mismatch is discarded rather
    // than silently adopted — the store keeps its own default instead.
    expect(useSettingsStore.getState().accentId).toBe(DEFAULT_ACCENT_ID);
  });

  it("defaults uiScale to 'default' and persists a changed value", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    expect(useSettingsStore.getState().uiScale).toBe("default");

    useSettingsStore.getState().setUiScale("large");
    expect(useSettingsStore.getState().uiScale).toBe("large");

    const persisted = JSON.parse(localStorage.getItem("kagami-settings") ?? "{}");
    expect(persisted.state.uiScale).toBe("large");
  });

  it("defaults tourDismissed to false so the welcome tour launches on first boot", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    expect(useSettingsStore.getState().tourDismissed).toBe(false);
  });

  it("persists tourDismissed once the welcome tour's 'don't show again' is checked", async () => {
    const { useSettingsStore } = await import("./settingsStore");

    useSettingsStore.getState().setTourDismissed(true);
    expect(useSettingsStore.getState().tourDismissed).toBe(true);

    const persisted = JSON.parse(localStorage.getItem("kagami-settings") ?? "{}");
    expect(persisted.state.tourDismissed).toBe(true);
  });
});
