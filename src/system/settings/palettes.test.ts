import { describe, expect, it } from "vitest";
import { hexToOklch } from "@/design/color";
import {
  lookById,
  LOOKS,
  materialVars,
  resolveWallpaperTone,
  themeVariables,
  wallpaperFitVars,
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

describe("lOOKS", () => {
  it("keeps lagoon first and default", () => {
    expect(LOOKS[0].id).toBe("lagoon");
    expect(lookById("lagoon")).toBe(LOOKS[0]);
  });

  it("falls back to the first look for an unknown id", () => {
    expect(lookById("no-such-look")).toBe(LOOKS[0]);
  });

  it("gives every look a distinct id and a wallpaper design", () => {
    const ids = LOOKS.map(look => look.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const look of LOOKS)
      expect(look.wallpaperStyleId).toBeTruthy();
  });

  it("preserves Lagoon's prototype-verbatim accent pair and control triad", () => {
    const lagoon = lookById("lagoon");
    expect(lagoon.light).toEqual({ accent: "#0f9b8e", accent2: "#f2765b" });
    expect(lagoon.dark).toEqual({ accent: "#2fb9ab", accent2: "#ff8368" });
    expect(lagoon.controls).toEqual({ close: "#f2765b", minimize: "#17b0a1", zoom: "#0c8074" });
  });

  it("reuses each look's light accent2 as its close control, per Lagoon's own pattern", () => {
    // The duotone stays two hues derived from one accent — never three
    // independent colors (ARCHITECTURE.md, "Binding design decisions").
    for (const look of LOOKS)
      expect(look.controls.close).toBe(look.light.accent2);
  });

  it("separates Ember's field as widely as Lagoon's", () => {
    // Ember's first pass sat at a brown-orange hue whose field collapsed into
    // three near-identical browns. The design pass moved it to hue 66 at the
    // derivation's chroma ceiling specifically to fix that.
    const spread = (id: string): number => {
      const tone = resolveWallpaperTone(lookById(id), "light");
      return hexToOklch(tone.wash).l - hexToOklch(tone.base).l;
    };
    expect(spread("ember")).toBeGreaterThan(spread("lagoon") * 0.95);
  });
});

describe("materialVars", () => {
  it("reproduces the pre-material chrome values at the frosted default", () => {
    expect(materialVars("frosted", "light")).toEqual({
      "--chrome": "rgba(250, 248, 244, 0.74)",
      "--chrome-2": "rgba(250, 248, 244, 0.58)",
      "--chrome-filter": "blur(18px) saturate(1.5)",
      "--chrome-filter-2": "blur(22px) saturate(1.6)",
    });
    expect(materialVars("frosted", "dark")).toMatchObject({
      "--chrome": "rgba(26, 24, 20, 0.72)",
      "--chrome-2": "rgba(20, 18, 15, 0.56)",
    });
  });

  it("drops the backdrop filter entirely when opaque", () => {
    const vars = materialVars("opaque", "light");
    expect(vars["--chrome-filter"]).toBe("none");
    expect(vars["--chrome-filter-2"]).toBe("none");
    expect(vars["--chrome"]).toBe("rgba(250, 248, 244, 1)");
  });

  it("blurs harder and tints lighter when clear", () => {
    const vars = materialVars("clear", "dark");
    expect(vars["--chrome"]).toBe("rgba(26, 24, 20, 0.54)");
    expect(vars["--chrome-filter"]).toContain("blur(26px)");
  });
});

describe("themeVariables", () => {
  const look = lookById("lagoon");

  it("falls through to the look's accent, controls and wallpaper design", () => {
    const vars = themeVariables(look, "light");
    expect(vars["--accent"]).toBe(look.light.accent);
    expect(vars["--accent-2"]).toBe(look.light.accent2);
    expect(vars["--ctl1"]).toBe(look.controls.close);
    expect(vars["--ctl2"]).toBe(look.controls.minimize);
    expect(vars["--ctl3"]).toBe(look.controls.zoom);
    // Procedural styles need real per-layer values, so the trio is always set.
    expect(vars["--wall-size"]).toBeDefined();
    expect(vars["--wall-repeat"]).toBeDefined();
    expect(vars["--wall-position"]).toBeDefined();
  });

  it("picks the resolved theme's accent tone", () => {
    expect(themeVariables(look, "dark")["--accent"]).toBe(look.dark.accent);
    expect(themeVariables(look, "dark")["--wall"]).not.toBe(themeVariables(look, "light")["--wall"]);
  });

  it("includes the material vars, defaulting to frosted", () => {
    expect(themeVariables(look, "light")).toMatchObject(materialVars("frosted", "light"));
    expect(themeVariables(look, "light", { materialLevel: "opaque" })).toMatchObject({
      "--chrome-filter": "none",
    });
  });

  it("u2: a customAccentHex override replaces --accent and derives accent2/controls from it", () => {
    const vars = themeVariables(look, "light", { customAccentHex: "#336699" });
    expect(vars["--accent"]).toBe("#336699");
    expect(vars["--accent-2"]).not.toBe(look.light.accent2);
    expect(vars["--ctl1"]).not.toBe(look.controls.close);
  });

  it("u2: a custom accent also re-derives the wallpaper, so it can't clash", () => {
    const preset = themeVariables(look, "light");
    const custom = themeVariables(look, "light", { customAccentHex: "#336699" });
    expect(custom["--wall"]).not.toBe(preset["--wall"]);
  });

  it("u2: customAccentHex null/absent falls through to the look", () => {
    expect(themeVariables(look, "light", { customAccentHex: null }))
      .toEqual(themeVariables(look, "light"));
  });

  it("uses the look's own wallpaper design unless one is chosen explicitly", () => {
    const inherited = themeVariables(look, "light");
    const explicit = themeVariables(look, "light", { wallpaperStyleId: look.wallpaperStyleId });
    const overridden = themeVariables(look, "light", { wallpaperStyleId: "halftone" });
    expect(explicit["--wall"]).toBe(inherited["--wall"]);
    expect(overridden["--wall"]).not.toBe(inherited["--wall"]);
    expect(themeVariables(look, "light", { wallpaperStyleId: null })["--wall"]).toBe(inherited["--wall"]);
  });

  it("u1: a customWallpaperUrl override replaces --wall with a url(...) and sets fit vars", () => {
    const vars = themeVariables(look, "light", {
      customWallpaperUrl: "blob:http://x/1",
      wallpaperFit: "tile",
    });
    expect(vars["--wall"]).toBe("url(\"blob:http://x/1\")");
    expect(vars["--wall-size"]).toBe("auto");
    expect(vars["--wall-repeat"]).toBe("repeat");
  });

  it("u1: a custom image wins over an explicitly chosen design", () => {
    const vars = themeVariables(look, "light", {
      wallpaperStyleId: "contour",
      customWallpaperUrl: "blob:http://x/1",
    });
    expect(vars["--wall"]).toBe("url(\"blob:http://x/1\")");
  });

  it("u1: customWallpaperUrl defaults to 'fill' sizing when wallpaperFit is omitted", () => {
    expect(themeVariables(look, "light", { customWallpaperUrl: "blob:http://x/1" })["--wall-size"])
      .toBe("cover");
  });

  it("u1: customWallpaperUrl null/absent falls through to the procedural design", () => {
    expect(themeVariables(look, "light", { customWallpaperUrl: null }))
      .toEqual(themeVariables(look, "light"));
  });
});

describe("resolveWallpaperTone", () => {
  it("reproduces Lagoon's hand-authored wallpaper colors from its accent pair", () => {
    // The derivation constants in design/color.ts were solved against these,
    // so the refined Drift artwork still paints Lagoon's original field.
    const light = resolveWallpaperTone(lookById("lagoon"), "light");
    expect(light.base).toBe("#0d8f83"); // was #0e8f83
    expect(light.mid).toBe("#15a89a"); //  was #17a89a
    expect(light.wash).toBe("#74cabe"); // was #74cabf
    expect(light.warm).toBe("#f2765b"); // was #f2765b, exactly
    expect(light.line).toBe("#bfe6df"); // was #bfe6df, exactly

    const dark = resolveWallpaperTone(lookById("lagoon"), "dark");
    expect(dark.base).toBe("#0b3b36"); // was #0a3b37
    expect(dark.wash).toBe("#0f6b62"); // was #0f6b62, exactly
    expect(dark.warm).toBe("#e0654b"); // was #e0654c
  });

  it("follows a custom accent rather than the look's", () => {
    const look = lookById("lagoon");
    expect(resolveWallpaperTone(look, "light", "#8844cc").base)
      .not
      .toBe(resolveWallpaperTone(look, "light").base);
  });
});
