import { describe, expect, it } from "vitest";
import {
  checkAccentContrast,
  contrastRatio,
  deriveAccentStrong,
  deriveAccentTone,
  deriveWallpaperTone,
  hexToOklch,
  hexToRgb,
  oklchToHex,
  relativeLuminance,
  rgbToHex,
  WCAG_AA_NORMAL_TEXT,
} from "./color";
import { lagoon } from "./tokens";

/** Max per-channel RGB delta allowed after a hex -> OKLCH -> hex round trip. */
const ROUND_TRIP_TOLERANCE = 2;

/** Lagoon's shipped accents (tokens.ts) — the calibration target throughout. */
const LAGOON_LIGHT_ACCENT = "#0f9b8e";
const LAGOON_DARK_ACCENT = "#2fb9ab";

function maxChannelDelta(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

describe("hexToRgb / rgbToHex", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#0f9b8e")).toEqual({ r: 15, g: 155, b: 142 });
  });

  it("expands 3-digit hex", () => {
    expect(hexToRgb("#0f8")).toEqual({ r: 0, g: 255, b: 136 });
  });

  it("round-trips rgb -> hex", () => {
    expect(rgbToHex({ r: 15, g: 155, b: 142 })).toBe("#0f9b8e");
  });

  it("rejects invalid hex strings", () => {
    expect(() => hexToRgb("not-a-color")).toThrow();
    expect(() => hexToRgb("#12")).toThrow();
  });
});

describe("hex <-> OKLCH round trip", () => {
  const samples = [
    "#000000",
    "#ffffff",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#0f9b8e", // Lagoon light accent
    "#2fb9ab", // Lagoon dark accent
    "#f2765b", // Lagoon light accent2
  ];

  it.each(samples)("reproduces %s within rounding error", (hex) => {
    const oklch = hexToOklch(hex);
    const roundTripped = oklchToHex(oklch);
    expect(maxChannelDelta(hex, roundTripped)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
  });

  it("black is achromatic (chroma 0, lightness 0)", () => {
    const { l, c } = hexToOklch("#000000");
    expect(l).toBeCloseTo(0, 5);
    expect(c).toBeCloseTo(0, 5);
  });

  it("white is achromatic (chroma 0, lightness 1)", () => {
    const { l, c } = hexToOklch("#ffffff");
    expect(l).toBeCloseTo(1, 4);
    expect(c).toBeCloseTo(0, 5);
  });

  it("a saturated primary has non-zero chroma and a plausible hue", () => {
    const red = hexToOklch("#ff0000");
    expect(red.c).toBeGreaterThan(0.2);
    // OKLCH red hue is ~29 degrees.
    expect(red.h).toBeGreaterThan(20);
    expect(red.h).toBeLessThan(40);
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
  });

  it("is 1 for white", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
  });

  it("is monotonic across a grey ramp", () => {
    const grey1 = relativeLuminance("#333333");
    const grey2 = relativeLuminance("#777777");
    const grey3 = relativeLuminance("#bbbbbb");
    expect(grey1).toBeLessThan(grey2);
    expect(grey2).toBeLessThan(grey3);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white (the WCAG maximum)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("is 1:1 for a color against itself", () => {
    expect(contrastRatio("#0f9b8e", "#0f9b8e")).toBeCloseTo(1, 6);
  });

  it("is symmetric regardless of argument order", () => {
    const ab = contrastRatio("#0f9b8e", "#faf8f4");
    const ba = contrastRatio("#faf8f4", "#0f9b8e");
    expect(ab).toBeCloseTo(ba, 10);
  });

  it("matches a known WCAG worked example (#767676 on white is ~4.54:1, the AA threshold color)", () => {
    // #767676 is WebAIM/WCAG's commonly cited "just passes AA" grey on white.
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThan(4.5);
    expect(contrastRatio("#767676", "#ffffff")).toBeLessThan(4.6);
  });
});

describe("deriveAccentTone", () => {
  it("is deterministic for the same input", () => {
    const a = deriveAccentTone("#0f9b8e");
    const b = deriveAccentTone("#0f9b8e");
    expect(a).toEqual(b);
  });

  it("closely reproduces Lagoon's hand-tuned accent2/controls from its accent", () => {
    const derived = deriveAccentTone("#0f9b8e");
    expect(maxChannelDelta(derived.accent2, "#f2765b")).toBeLessThanOrEqual(4);
    expect(maxChannelDelta(derived.controls.close, "#f2765b")).toBeLessThanOrEqual(4);
    expect(maxChannelDelta(derived.controls.minimize, "#17b0a1")).toBeLessThanOrEqual(4);
    expect(maxChannelDelta(derived.controls.zoom, "#0c8074")).toBeLessThanOrEqual(4);
  });

  it("close always matches accent2 (only two hues, never three independent control colors)", () => {
    for (const hex of ["#0f9b8e", "#6b4ad4", "#8ba617", "#123456", "#abcdef"]) {
      const derived = deriveAccentTone(hex);
      expect(derived.controls.close).toBe(derived.accent2);
    }
  });

  it("minimize is lighter and zoom is darker than the base accent", () => {
    for (const hex of ["#0f9b8e", "#6b4ad4", "#8ba617"]) {
      const base = hexToOklch(hex);
      const derived = deriveAccentTone(hex);
      expect(hexToOklch(derived.controls.minimize).l).toBeGreaterThan(base.l);
      expect(hexToOklch(derived.controls.zoom).l).toBeLessThan(base.l);
    }
  });

  it("produces valid hex strings for edge-case lightness/chroma inputs", () => {
    for (const hex of ["#000000", "#ffffff", "#808080", "#ff00ff"]) {
      const derived = deriveAccentTone(hex);
      expect(derived.accent2).toMatch(/^#[0-9a-f]{6}$/);
      expect(derived.controls.close).toMatch(/^#[0-9a-f]{6}$/);
      expect(derived.controls.minimize).toMatch(/^#[0-9a-f]{6}$/);
      expect(derived.controls.zoom).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("deriveAccentStrong", () => {
  const white = "#ffffff";

  it("darkens Lagoon's light accent until white text clears AA", () => {
    // The whole reason the token exists: #0f9b8e + white is only 3.44:1.
    expect(contrastRatio(white, LAGOON_LIGHT_ACCENT)).toBeLessThan(WCAG_AA_NORMAL_TEXT);
    expect(contrastRatio(white, deriveAccentStrong(LAGOON_LIGHT_ACCENT)))
      .toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("darkens Lagoon's dark accent too — it was the worse of the two at 2.43:1", () => {
    expect(contrastRatio(white, deriveAccentStrong(LAGOON_DARK_ACCENT)))
      .toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("returns an already-dark-enough accent untouched", () => {
    // #1f4b7a is well past AA against white, so there's nothing to correct.
    expect(deriveAccentStrong("#1f4b7a")).toBe("#1f4b7a");
  });

  it("holds hue and chroma fixed, moving only lightness", () => {
    // The ROADMAP §6.5 guardrail: derived from the one picked accent, never a
    // second authored color.
    const base = hexToOklch(LAGOON_LIGHT_ACCENT);
    const strong = hexToOklch(deriveAccentStrong(LAGOON_LIGHT_ACCENT));
    // Hue is the thing that must hold; the ~0.5° wobble is 8-bit hex
    // quantization on the OKLCH round trip, not a hue shift.
    expect(Math.abs(strong.h - base.h)).toBeLessThan(1);
    expect(strong.l).toBeLessThan(base.l);
    // Chroma is never *raised*, but `oklchToHex`'s gamut mapping
    // (`resolveInGamutLinearRgb`) does pull it in a little when the darker
    // lightness can't hold the original chroma in sRGB — ~9% here. That's the
    // existing, deliberate behavior, not a second color decision.
    expect(strong.c).toBeLessThanOrEqual(base.c);
    expect(strong.c).toBeGreaterThan(base.c * 0.85);
  });

  it("stops as soon as it clears, rather than bottoming out", () => {
    const strong = deriveAccentStrong(LAGOON_LIGHT_ACCENT);
    // Comfortably above the floor, and not wildly over-corrected.
    expect(contrastRatio(white, strong)).toBeLessThan(WCAG_AA_NORMAL_TEXT + 0.5);
  });

  it("matches the static fallbacks in tokens.ts (and so global.css)", () => {
    // Those two files carry the pre-hydration paint value; Settings writes the
    // derived one inline at runtime. This pins them together so a change to
    // the derivation can't silently leave the stylesheet behind.
    expect(deriveAccentStrong(lagoon.light.accent)).toBe(lagoon.light.accentStrong);
    expect(deriveAccentStrong(lagoon.dark.accent)).toBe(lagoon.dark.accentStrong);
    expect(deriveAccentStrong(lagoon.light.accent2)).toBe(lagoon.light.accent2Strong);
    expect(deriveAccentStrong(lagoon.dark.accent2)).toBe(lagoon.dark.accent2Strong);
  });

  it("clears AA for every hue around the wheel, including yellow", () => {
    for (let h = 0; h < 360; h += 30) {
      const accent = oklchToHex({ l: 0.8, c: 0.15, h });
      expect(contrastRatio(white, deriveAccentStrong(accent)))
        .toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });
});

describe("checkAccentContrast", () => {
  const surfaceLight = "#faf8f4"; // Lagoon light surface (tokens.ts)

  it("passes when both pairs clear WCAG AA (4.5:1)", () => {
    // #4479ad sits at ~18% relative luminance, the classic "roughly equal
    // contrast against pure black and pure white" band (~4.58:1 each way).
    const result = checkAccentContrast("#4479ad", "#ffffff");
    expect(result.accentOnSurface).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(result.labelOnAccent).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(result.passes).toBe(true);
  });

  it("fails when the accent is too close to the surface color", () => {
    // Near-identical to the light surface. The label pair still passes, since
    // `deriveAccentStrong` corrects it — surface contrast is the real problem.
    const result = checkAccentContrast("#f7f5f0", surfaceLight);
    expect(result.accentOnSurface).toBeLessThan(WCAG_AA_NORMAL_TEXT);
    expect(result.labelOnAccent).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(result.passes).toBe(false);
  });

  it("measures the label pair the UI actually renders, not ink on the raw accent", () => {
    // Regression: the old check compared the theme's ink against `--accent`, a
    // pair no control ever drew, and so reported a pass while Lagoon's own
    // buttons sat at 3.44:1. It now measures white on `--accent-strong`.
    const result = checkAccentContrast(LAGOON_LIGHT_ACCENT, surfaceLight);
    expect(result.labelOnAccent)
      .toBeCloseTo(contrastRatio("#ffffff", deriveAccentStrong(LAGOON_LIGHT_ACCENT)), 5);
    expect(result.labelOnAccent).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("clears the label pair for the shipped Lagoon accent in both themes", () => {
    expect(checkAccentContrast(LAGOON_LIGHT_ACCENT, surfaceLight).labelOnAccent)
      .toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(checkAccentContrast(LAGOON_DARK_ACCENT, "#201e1a").labelOnAccent)
      .toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("still reports Lagoon light's accent-on-surface shortfall (3.25:1), which is a separate problem", () => {
    // `text-accent` on `--surface` is a property of the Lagoon accent itself,
    // not of any control — correcting it would mean changing the palette, so
    // the checker is expected to keep flagging it rather than hide it.
    expect(checkAccentContrast(LAGOON_LIGHT_ACCENT, surfaceLight).accentOnSurface)
      .toBeLessThan(WCAG_AA_NORMAL_TEXT);
    // Dark theme has no such problem — 6.85:1.
    expect(checkAccentContrast(LAGOON_DARK_ACCENT, "#201e1a").accentOnSurface)
      .toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

describe("deriveWallpaperTone", () => {
  /** Lagoon's accent pair, per theme — the calibration target. */
  const LAGOON = {
    light: ["#0f9b8e", "#f2765b"] as const,
    dark: ["#2fb9ab", "#ff8368"] as const,
  };

  it("reproduces Lagoon's hand-authored wallpaper colors from its accent pair", () => {
    const light = deriveWallpaperTone(...LAGOON.light, "light");
    expect(maxChannelDelta(light.base, "#0e8f83")).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
    expect(maxChannelDelta(light.mid, "#17a89a")).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
    expect(maxChannelDelta(light.wash, "#74cabf")).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
    expect(light.warm).toBe("#f2765b");
    expect(light.line).toBe("#bfe6df");

    const dark = deriveWallpaperTone(...LAGOON.dark, "dark");
    expect(maxChannelDelta(dark.base, "#0a3b37")).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
    expect(maxChannelDelta(dark.mid, "#0e5850")).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
    expect(maxChannelDelta(dark.wash, "#0f6b62")).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
    expect(maxChannelDelta(dark.warm, "#e0654c")).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
  });

  it("is pure", () => {
    expect(deriveWallpaperTone(...LAGOON.light, "light")).toEqual(deriveWallpaperTone(...LAGOON.light, "light"));
  });

  it("keeps the field legible at every hue, so desktop icon labels stay readable", () => {
    for (let hue = 0; hue < 360; hue += 15) {
      const accent = oklchToHex({ l: 0.61, c: 0.11, h: hue });
      const accent2 = oklchToHex({ l: 0.70, c: 0.15, h: (hue + 210) % 360 });

      // Light stays a mid-tone field, never a near-white one that white
      // labels and the dim scrim would both struggle against.
      const light = deriveWallpaperTone(accent, accent2, "light");
      expect(hexToOklch(light.wash).l).toBeLessThan(0.82);
      expect(hexToOklch(light.base).l).toBeGreaterThan(hexToOklch(accent).l - 0.1);

      // Dark stays genuinely dark.
      const dark = deriveWallpaperTone(accent, accent2, "dark");
      expect(hexToOklch(dark.base).l).toBeLessThan(0.36);
      expect(hexToOklch(dark.wash).l).toBeLessThan(0.52);
    }
  });

  it("caps field chroma so a vivid accent doesn't produce a fully saturated desktop", () => {
    const vivid = deriveWallpaperTone("#ff0090", "#00ff40", "light");
    expect(hexToOklch(vivid.base).c).toBeLessThanOrEqual(0.13);
    expect(hexToOklch(vivid.mid).c).toBeLessThanOrEqual(0.13);
  });

  it("orders the light field from deepest to palest", () => {
    const tone = deriveWallpaperTone(...LAGOON.light, "light");
    expect(hexToOklch(tone.base).l).toBeLessThan(hexToOklch(tone.mid).l);
    expect(hexToOklch(tone.mid).l).toBeLessThan(hexToOklch(tone.wash).l);
  });
});
