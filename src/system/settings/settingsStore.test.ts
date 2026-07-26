import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/testUtils/memoryStorage";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("window", globalThis);
  // settingsStore now pulls in themeStore at runtime (setWallpaperFromFile,
  // U1) instead of only its ResolvedTheme type, and themeStore reads
  // matchMedia at module scope — same stub themeStore.test.ts uses.
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
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

describe("u1 custom wallpaper", () => {
  it("defaults both theme slots to null and fit to 'fill'", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    expect(useSettingsStore.getState().wallpaperFileId).toEqual({ light: null, dark: null });
    expect(useSettingsStore.getState().wallpaperFit).toBe("fill");
  });

  it("setWallpaperFile sets one theme's slot without touching the other", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setWallpaperFile("dark", "file-1");
    expect(useSettingsStore.getState().wallpaperFileId).toEqual({ light: null, dark: "file-1" });

    useSettingsStore.getState().setWallpaperFile("light", "file-2");
    expect(useSettingsStore.getState().wallpaperFileId).toEqual({ light: "file-2", dark: "file-1" });

    useSettingsStore.getState().setWallpaperFile("dark", null);
    expect(useSettingsStore.getState().wallpaperFileId).toEqual({ light: "file-2", dark: null });
  });

  it("setWallpaper (picking a preset) clears both custom slots so the preset actually shows", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setWallpaperFile("light", "file-1");
    useSettingsStore.getState().setWallpaperFile("dark", "file-2");

    useSettingsStore.getState().setWallpaper("iris");
    expect(useSettingsStore.getState().wallpaperId).toBe("iris");
    expect(useSettingsStore.getState().wallpaperFileId).toEqual({ light: null, dark: null });
  });

  it("setWallpaperFromFile sets the currently resolved theme's slot", async () => {
    const { useSettingsStore, setWallpaperFromFile } = await import("./settingsStore");
    const { useThemeStore } = await import("@/system/theme/themeStore");

    useThemeStore.setState({ resolved: "dark" });
    setWallpaperFromFile("viewer-file");
    expect(useSettingsStore.getState().wallpaperFileId).toEqual({ light: null, dark: "viewer-file" });

    useThemeStore.setState({ resolved: "light" });
    setWallpaperFromFile("other-file");
    expect(useSettingsStore.getState().wallpaperFileId).toEqual({ light: "other-file", dark: "viewer-file" });
  });
});

describe("u2 custom accent", () => {
  it("defaults customAccentHex to null", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    expect(useSettingsStore.getState().customAccentHex).toBeNull();
  });

  it("setAccent (picking a preset) clears a custom accent override", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setCustomAccentHex("#123456");
    expect(useSettingsStore.getState().customAccentHex).toBe("#123456");

    useSettingsStore.getState().setAccent("meadow");
    expect(useSettingsStore.getState().accentId).toBe("meadow");
    expect(useSettingsStore.getState().customAccentHex).toBeNull();
  });
});

describe("u6 motion & window feel", () => {
  it("defaults reduceMotion to 'system', animationSpeed to 1, wallpaperDim to 0", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    expect(useSettingsStore.getState().reduceMotion).toBe("system");
    expect(useSettingsStore.getState().animationSpeed).toBe(1);
    expect(useSettingsStore.getState().wallpaperDim).toBe(0);
  });

  it("setWallpaperDim clamps to [0, 1]", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setWallpaperDim(1.4);
    expect(useSettingsStore.getState().wallpaperDim).toBe(1);
    useSettingsStore.getState().setWallpaperDim(-0.4);
    expect(useSettingsStore.getState().wallpaperDim).toBe(0);
    useSettingsStore.getState().setWallpaperDim(0.35);
    expect(useSettingsStore.getState().wallpaperDim).toBe(0.35);
  });

  it("setAnimationSpeed clamps to a sane non-zero range and rejects non-finite input", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setAnimationSpeed(0);
    expect(useSettingsStore.getState().animationSpeed).toBe(0.25);
    useSettingsStore.getState().setAnimationSpeed(-3);
    expect(useSettingsStore.getState().animationSpeed).toBe(0.25);
    useSettingsStore.getState().setAnimationSpeed(100);
    expect(useSettingsStore.getState().animationSpeed).toBe(4);
    useSettingsStore.getState().setAnimationSpeed(Number.NaN);
    expect(useSettingsStore.getState().animationSpeed).toBe(1);
    useSettingsStore.getState().setAnimationSpeed(2);
    expect(useSettingsStore.getState().animationSpeed).toBe(2);
  });

  it("setReduceMotion stores the explicit override verbatim", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setReduceMotion("on");
    expect(useSettingsStore.getState().reduceMotion).toBe("on");
    useSettingsStore.getState().setReduceMotion("off");
    expect(useSettingsStore.getState().reduceMotion).toBe("off");
  });
});
