import { describe, expect, it } from "vitest";
import {
  accentById,
  ACCENTS,
  themeVariables,
  wallpaperById,
  wallpaperFitVars,
  WALLPAPERS,
} from "./palettes";

describe("wallpaperFitVars", () => {
  it("maps fill to a cover/no-repeat/centered background", () => {
    expect(wallpaperFitVars("fill")).toEqual({
      "--wall-size": "cover",
      "--wall-repeat": "no-repeat",
      "--wall-position": "center",
    });
  });

  it("maps fit to contain, unlike fill's cover", () => {
    expect(wallpaperFitVars("fit")).toMatchObject({ "--wall-size": "contain" });
  });

  it("maps centre to an un-scaled, non-repeating background", () => {
    expect(wallpaperFitVars("centre")).toEqual({
      "--wall-size": "auto",
      "--wall-repeat": "no-repeat",
      "--wall-position": "center",
    });
  });

  it("maps tile to a repeating, top-left-anchored background", () => {
    expect(wallpaperFitVars("tile")).toEqual({
      "--wall-size": "auto",
      "--wall-repeat": "repeat",
      "--wall-position": "top left",
    });
  });
});

describe("themeVariables", () => {
  const accent = accentById("lagoon");
  const wallpaper = wallpaperById("lagoon");

  it("falls through to the preset accent/wallpaper with no overrides", () => {
    const vars = themeVariables(accent, wallpaper, "light");
    expect(vars["--accent"]).toBe(accent.light.accent);
    expect(vars["--accent-2"]).toBe(accent.light.accent2);
    expect(vars["--ctl1"]).toBe(accent.controls.close);
    expect(vars["--wall"]).toBe(wallpaper.light.wall);
    expect(vars["--wall-size"]).toBeUndefined();
  });

  it("picks the resolved theme's tone/wallpaper", () => {
    const vars = themeVariables(accent, wallpaper, "dark");
    expect(vars["--accent"]).toBe(accent.dark.accent);
    expect(vars["--wall"]).toBe(wallpaper.dark.wall);
  });

  it("u2: a customAccentHex override replaces --accent and derives accent2/controls from it", () => {
    const vars = themeVariables(accent, wallpaper, "light", { customAccentHex: "#336699" });
    expect(vars["--accent"]).toBe("#336699");
    // Derived, not the preset's own accent2/controls.
    expect(vars["--accent-2"]).not.toBe(accent.light.accent2);
    expect(vars["--ctl1"]).not.toBe(accent.controls.close);
  });

  it("u2: customAccentHex null/absent falls through to the preset", () => {
    const withNull = themeVariables(accent, wallpaper, "light", { customAccentHex: null });
    const withAbsent = themeVariables(accent, wallpaper, "light");
    expect(withNull).toEqual(withAbsent);
  });

  it("u1: a customWallpaperUrl override replaces --wall with a url(...) and sets fit vars", () => {
    const vars = themeVariables(accent, wallpaper, "light", {
      customWallpaperUrl: "blob:http://x/1",
      wallpaperFit: "tile",
    });
    expect(vars["--wall"]).toBe("url(\"blob:http://x/1\")");
    expect(vars["--wall-size"]).toBe("auto");
    expect(vars["--wall-repeat"]).toBe("repeat");
    // The shadow accents still come from the preset wallpaper (the image
    // itself doesn't carry them).
    expect(vars["--wsh1"]).toBe(wallpaper.light.wsh1);
  });

  it("u1: customWallpaperUrl defaults to 'fill' sizing when wallpaperFit is omitted", () => {
    const vars = themeVariables(accent, wallpaper, "light", { customWallpaperUrl: "blob:http://x/1" });
    expect(vars["--wall-size"]).toBe("cover");
  });

  it("u1: customWallpaperUrl null/absent falls through to the preset gradient", () => {
    const withNull = themeVariables(accent, wallpaper, "light", { customWallpaperUrl: null });
    const withAbsent = themeVariables(accent, wallpaper, "light");
    expect(withNull).toEqual(withAbsent);
  });

  it("u3: the two new curated directions are registered like the original three", () => {
    expect(ACCENTS.map(a => a.id)).toEqual(expect.arrayContaining(["ember", "slate"]));
    expect(WALLPAPERS.map(w => w.id)).toEqual(expect.arrayContaining(["ember", "slate"]));
  });
});
