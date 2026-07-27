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
    expect(useSettingsStore.persist.getOptions().version).toBe(2);
  });

  it("drops pre-v1 persisted data instead of applying it blindly", async () => {
    localStorage.setItem(
      "kagami-settings",
      JSON.stringify({ state: { accentId: "stale-accent" }, version: 0 }),
    );
    const { useSettingsStore } = await import("./settingsStore");
    const { DEFAULT_LOOK_ID } = await import("./palettes");
    await useSettingsStore.persist.rehydrate();
    // v0 predates every field worth rescuing, so it's discarded rather than
    // silently adopted — the store keeps its own defaults instead.
    expect(useSettingsStore.getState().lookId).toBe(DEFAULT_LOOK_ID);
  });
});

describe("v1 -> v2 migration", () => {
  async function rehydrateV1(state: Record<string, unknown>) {
    localStorage.setItem("kagami-settings", JSON.stringify({ state, version: 1 }));
    const { useSettingsStore } = await import("./settingsStore");
    await useSettingsStore.persist.rehydrate();
    return useSettingsStore.getState();
  }

  it("collapses a v1 accent choice into the matching look", async () => {
    expect((await rehydrateV1({ accentId: "ember", wallpaperId: "slate" })).lookId).toBe("ember");
  });

  it("maps the retired iris/meadow accents onto the nearest surviving look", async () => {
    expect((await rehydrateV1({ accentId: "iris" })).lookId).toBe("slate");
    vi.resetModules();
    expect((await rehydrateV1({ accentId: "meadow" })).lookId).toBe("lagoon");
  });

  it("falls back to the default look for an unrecognized v1 accent", async () => {
    const { DEFAULT_LOOK_ID } = await import("./palettes");
    expect((await rehydrateV1({ accentId: "nonsense" })).lookId).toBe(DEFAULT_LOOK_ID);
  });

  it("drops the separate wallpaperId and starts the new fields at their defaults", async () => {
    const state = await rehydrateV1({ accentId: "lagoon", wallpaperId: "meadow" });
    expect(state).not.toHaveProperty("wallpaperId");
    expect(state.wallpaperStyleId).toBeNull();
    expect(state.materialLevel).toBe("frosted");
  });

  it("carries every unrelated setting across — the reason it migrates rather than resets", async () => {
    const state = await rehydrateV1({
      accentId: "slate",
      wallpaperId: "slate",
      startupApps: ["notes", "files"],
      fileAssociations: { "image/png": "viewer" },
      wallpaperFileId: { light: "file-1", dark: null },
      wallpaperFit: "tile",
      customAccentHex: "#123456",
      uiScale: "large",
      playerVolume: 0.25,
      wallpaperDim: 0.4,
      restoreSessionOnBoot: false,
      clockHour12: false,
    });
    expect(state.startupApps).toEqual(["notes", "files"]);
    expect(state.fileAssociations).toEqual({ "image/png": "viewer" });
    expect(state.wallpaperFileId).toEqual({ light: "file-1", dark: null });
    expect(state.wallpaperFit).toBe("tile");
    expect(state.customAccentHex).toBe("#123456");
    expect(state.uiScale).toBe("large");
    expect(state.playerVolume).toBe(0.25);
    expect(state.wallpaperDim).toBe(0.4);
    expect(state.restoreSessionOnBoot).toBe(false);
    expect(state.clockHour12).toBe(false);
  });
});

describe("settingsStore defaults", () => {
  it("defaults uiScale to 'default' and persists a changed value", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    expect(useSettingsStore.getState().uiScale).toBe("default");

    useSettingsStore.getState().setUiScale("large");
    expect(useSettingsStore.getState().uiScale).toBe("large");

    const persisted = JSON.parse(localStorage.getItem("kagami-settings") ?? "{}");
    expect(persisted.state.uiScale).toBe("large");
  });

  it("defaults playerVolume to 0.8 and persists a changed value", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    expect(useSettingsStore.getState().playerVolume).toBe(0.8);

    useSettingsStore.getState().setPlayerVolume(0.3);
    expect(useSettingsStore.getState().playerVolume).toBe(0.3);

    const persisted = JSON.parse(localStorage.getItem("kagami-settings") ?? "{}");
    expect(persisted.state.playerVolume).toBe(0.3);
  });

  it("clamps playerVolume to [0, 1]", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setPlayerVolume(1.5);
    expect(useSettingsStore.getState().playerVolume).toBe(1);
    useSettingsStore.getState().setPlayerVolume(-0.5);
    expect(useSettingsStore.getState().playerVolume).toBe(0);
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

  it("keeps a custom image when the look changes — it's the user's file, not a tweak to a preset", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setWallpaperFile("light", "file-1");
    useSettingsStore.getState().setWallpaperFile("dark", "file-2");

    useSettingsStore.getState().setLook("slate");
    expect(useSettingsStore.getState().wallpaperFileId).toEqual({ light: "file-1", dark: "file-2" });
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

  it("setLook clears the accent and design overrides so the look actually shows", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setCustomAccentHex("#123456");
    useSettingsStore.getState().setWallpaperStyle("contour");

    useSettingsStore.getState().setLook("ember");
    expect(useSettingsStore.getState().lookId).toBe("ember");
    expect(useSettingsStore.getState().customAccentHex).toBeNull();
    expect(useSettingsStore.getState().wallpaperStyleId).toBeNull();
  });
});

describe("look, wallpaper design and material", () => {
  it("starts on the default look, inheriting its design, at the frosted material", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    const { DEFAULT_LOOK_ID, DEFAULT_MATERIAL_LEVEL } = await import("./palettes");
    expect(useSettingsStore.getState().lookId).toBe(DEFAULT_LOOK_ID);
    expect(useSettingsStore.getState().wallpaperStyleId).toBeNull();
    expect(useSettingsStore.getState().materialLevel).toBe(DEFAULT_MATERIAL_LEVEL);
  });

  it("setWallpaperStyle overrides the look's design, and null goes back to inheriting it", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setWallpaperStyle("aurora");
    expect(useSettingsStore.getState().wallpaperStyleId).toBe("aurora");
    useSettingsStore.getState().setWallpaperStyle(null);
    expect(useSettingsStore.getState().wallpaperStyleId).toBeNull();
  });

  it("persists the material level", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setMaterialLevel("opaque");
    const persisted = JSON.parse(localStorage.getItem("kagami-settings") ?? "{}");
    expect(persisted.state.materialLevel).toBe("opaque");
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

describe("settingsStore — welcome tour dismissal (U16)", () => {
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
