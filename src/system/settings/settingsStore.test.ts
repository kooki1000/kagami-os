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
});

describe("settingsStore — menu bar & clock (U7)", () => {
  it("defaults to the pre-U7 clock behavior: 12-hour, no seconds, date shown, every status item on", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    const state = useSettingsStore.getState();
    expect(state.clockHour12).toBe(true);
    expect(state.clockShowSeconds).toBe(false);
    expect(state.clockShowDate).toBe(true);
    expect(state.statusItems).toEqual({
      offline: true,
      search: true,
      appearance: true,
      notifications: true,
      clock: true,
    });
  });

  it("setStatusItemEnabled toggles one item, leaving the others untouched", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setStatusItemEnabled("offline", false);
    expect(useSettingsStore.getState().statusItems.offline).toBe(false);
    expect(useSettingsStore.getState().statusItems.clock).toBe(true);
  });

  it("persists clock format changes", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setClockHour12(false);
    useSettingsStore.getState().setClockShowSeconds(true);
    const persisted = JSON.parse(localStorage.getItem("kagami-settings") ?? "{}");
    expect(persisted.state.clockHour12).toBe(false);
    expect(persisted.state.clockShowSeconds).toBe(true);
  });
});

describe("settingsStore — startup behaviour (U9)", () => {
  it("defaults to restoring the session with no startup apps or size overrides", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    const state = useSettingsStore.getState();
    expect(state.restoreSessionOnBoot).toBe(true);
    expect(state.startupApps).toEqual([]);
    expect(state.defaultWindowSize).toEqual({});
  });

  it("setStartupAppEnabled adds/removes an app id idempotently", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setStartupAppEnabled("notes", true);
    useSettingsStore.getState().setStartupAppEnabled("notes", true);
    expect(useSettingsStore.getState().startupApps).toEqual(["notes"]);

    useSettingsStore.getState().setStartupAppEnabled("notes", false);
    expect(useSettingsStore.getState().startupApps).toEqual([]);
    // Removing something already absent is a no-op, not an error.
    useSettingsStore.getState().setStartupAppEnabled("notes", false);
    expect(useSettingsStore.getState().startupApps).toEqual([]);
  });

  it("setDefaultWindowSize/clearDefaultWindowSize round-trip a per-app override", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setDefaultWindowSize("notes", { width: 640, height: 480 });
    expect(useSettingsStore.getState().defaultWindowSize.notes).toEqual({ width: 640, height: 480 });

    useSettingsStore.getState().clearDefaultWindowSize("notes");
    expect(useSettingsStore.getState().defaultWindowSize.notes).toBeUndefined();
  });

  it("persists restoreSessionOnBoot", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setRestoreSessionOnBoot(false);
    const persisted = JSON.parse(localStorage.getItem("kagami-settings") ?? "{}");
    expect(persisted.state.restoreSessionOnBoot).toBe(false);
  });
});
