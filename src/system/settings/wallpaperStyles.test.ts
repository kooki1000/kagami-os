import type { WallpaperTone } from "@/design/color";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WALLPAPER_STYLE_ID,
  WALLPAPER_STYLES,
  wallpaperStyleById,
  wallpaperStyleVars,
} from "./wallpaperStyles";

const TONE: WallpaperTone = {
  base: "#0d8f83",
  mid: "#15a89a",
  wash: "#74cabe",
  warm: "#f2765b",
  line: "#bfe6df",
};

/** Splits a var's value on the commas that separate *layers*, not the ones inside `rgb()`/`color-mix()`/gradients. */
function splitLayers(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(")
      depth++;
    else if (char === ")")
      depth--;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts;
}

/** Styles whose crispness comes from ruled strokes rather than a dot tile. */
const STYLES_WITH_HAIRLINES = WALLPAPER_STYLES
  .map(style => style.id)
  .filter(id => /repeating-(?:linear|radial)-gradient/.test(wallpaperStyleVars(id, TONE)["--wall"]));

describe("wALLPAPER_STYLES", () => {
  it("has styles that rule hairlines (the list the hairline-width test covers)", () => {
    expect(STYLES_WITH_HAIRLINES.length).toBeGreaterThan(0);
  });

  it("registers the default style and gives every style a distinct id", () => {
    const ids = WALLPAPER_STYLES.map(style => style.id);
    expect(ids).toContain(DEFAULT_WALLPAPER_STYLE_ID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships more than one design — the whole point of the rewrite", () => {
    expect(WALLPAPER_STYLES.length).toBeGreaterThan(1);
    const images = WALLPAPER_STYLES.map(style => wallpaperStyleVars(style.id, TONE)["--wall"]);
    expect(new Set(images).size).toBe(images.length);
  });

  it("falls back to the first style for an unknown id", () => {
    expect(wallpaperStyleById("no-such-style")).toBe(WALLPAPER_STYLES[0]);
  });
});

describe("wallpaperStyleVars", () => {
  it.each(WALLPAPER_STYLES.map(style => style.id))(
    "%s emits four lists of matching length",
    (id) => {
      const vars = wallpaperStyleVars(id, TONE);
      const layers = splitLayers(vars["--wall"]).length;
      expect(layers).toBeGreaterThan(0);
      expect(splitLayers(vars["--wall-size"])).toHaveLength(layers);
      expect(splitLayers(vars["--wall-repeat"])).toHaveLength(layers);
      expect(splitLayers(vars["--wall-position"])).toHaveLength(layers);
    },
  );

  it.each(WALLPAPER_STYLES.map(style => style.id))(
    "%s stays on legacy sRGB colors, which is the only form all three engines agree on",
    (id) => {
      // A gradient whose stops are modern `color()` values (what
      // `color-mix()` resolves to) stops interpolating as legacy sRGB, and
      // Firefox then renders it very differently from Chromium and WebKit:
      // the field washes out and every hairline gains a dark fringe. Verified
      // by screenshotting all three engines — see `alpha()`.
      const vars = wallpaperStyleVars(id, TONE);
      for (const value of Object.values(vars)) {
        expect(value).not.toContain("color-mix");
        expect(value).not.toMatch(/\bcolor\(/);
        expect(value).not.toMatch(/\b(?:oklch|oklab|lch|lab)\(/);
      }
    },
  );

  it.each(WALLPAPER_STYLES.map(style => style.id))(
    "%s uses no viewport units, so Settings' previews scale correctly",
    (id) => {
      const vars = wallpaperStyleVars(id, TONE);
      for (const value of Object.values(vars))
        expect(value).not.toMatch(/\d(?:vmax|vmin|vw|vh)\b/);
    },
  );

  it.each(WALLPAPER_STYLES.map(style => style.id))(
    "%s routes tiled geometry through --wall-tile",
    (id) => {
      const vars = wallpaperStyleVars(id, TONE);
      const tiled = splitLayers(vars["--wall-repeat"])
        .map((repeat, index) => ({ repeat, size: splitLayers(vars["--wall-size"])[index] }))
        .filter(layer => layer.repeat === "repeat");
      for (const layer of tiled)
        expect(layer.size).toContain("var(--wall-tile");
    },
  );

  it.each(WALLPAPER_STYLES.map(style => style.id))(
    "%s carries fine repeating detail, so nothing reads as out of focus",
    (id) => {
      const vars = wallpaperStyleVars(id, TONE);
      const hasRepeatingGradient = /repeating-(?:linear|radial)-gradient/.test(vars["--wall"]);
      const hasRepeatedLayer = splitLayers(vars["--wall-repeat"]).includes("repeat");
      expect(hasRepeatingGradient || hasRepeatedLayer).toBe(true);
    },
  );

  it.each(STYLES_WITH_HAIRLINES)(
    "%s keeps hairline widths fixed, independent of --wall-tile",
    (id) => {
      // A stroke's far edge is `spacing * tile + a fixed px`. Scaling the
      // width too would render a 1px hairline at 0.34px in Settings' preview
      // and the browser would fade it to nothing — which is the exact
      // softness these strokes exist to fix.
      expect(wallpaperStyleVars(id, TONE)["--wall"])
        .toMatch(/calc\([\d.]+px \* var\(--wall-tile, 1\) \+ [\d.]+px\)/);
    },
  );

  it("gives Strata's sky and its strata their own grain boxes", () => {
    const vars = wallpaperStyleVars("strata", TONE);
    expect(splitLayers(vars["--wall-size"])).toEqual(expect.arrayContaining(["100% 44%", "100% 56%"]));
    expect(splitLayers(vars["--wall-position"])).toEqual(expect.arrayContaining(["left top", "left bottom"]));
  });

  it("paints with the tone it is given", () => {
    const wall = wallpaperStyleVars("drift", TONE)["--wall"];
    expect(wall).toContain(TONE.base);
    expect(wall).toContain(TONE.warm);
  });

  it("reproduces Lagoon's original diagonal field in the default style", () => {
    expect(wallpaperStyleVars(DEFAULT_WALLPAPER_STYLE_ID, TONE)["--wall"])
      .toContain("linear-gradient(140deg, #0d8f83 0%, #15a89a 42%, #74cabe 100%)");
  });
});
