import { describe, expect, it } from "vitest";
import {
  checkAccentContrast,
  contrastRatio,
  deriveAccentTone,
  deriveWallpaperTone,
  hexToOklch,
  hexToRgb,
  oklchToHex,
  relativeLuminance,
  rgbToHex,
  WCAG_AA_NORMAL_TEXT,
} from "./color";

/** Max per-channel RGB delta allowed after a hex -> OKLCH -> hex round trip. */
const ROUND_TRIP_TOLERANCE = 2;

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

describe("checkAccentContrast", () => {
  const surfaceLight = "#faf8f4"; // Lagoon light surface (tokens.ts)
  const inkLight = "#2b2925"; // Lagoon light text (tokens.ts)

  it("passes when both pairs clear WCAG AA (4.5:1)", () => {
    // #4479ad sits at ~18% relative luminance, the classic "roughly equal
    // contrast against pure black and pure white" band (~4.58:1 each way).
    const result = checkAccentContrast("#4479ad", "#ffffff", "#000000");
    expect(result.accentOnSurface).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(result.inkOnAccent).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(result.passes).toBe(true);
  });

  it("fails when the accent is too close to the surface color", () => {
    // Near-identical to the light surface: low contrast against surface,
    // even though ink-on-accent alone would clear AA.
    const result = checkAccentContrast("#f7f5f0", surfaceLight, inkLight);
    expect(result.accentOnSurface).toBeLessThan(WCAG_AA_NORMAL_TEXT);
    expect(result.inkOnAccent).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(result.passes).toBe(false);
  });

  it("fails when ink is too close to the accent, even if accent-on-surface passes", () => {
    const result = checkAccentContrast("#4479ad", "#000000", "#3a6690");
    expect(result.accentOnSurface).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(result.inkOnAccent).toBeLessThan(WCAG_AA_NORMAL_TEXT);
    expect(result.passes).toBe(false);
  });

  it("fails when both pairs are low-contrast (deliberately awful pairing)", () => {
    const result = checkAccentContrast("#f0e6d8", surfaceLight, "#fefefe");
    expect(result.accentOnSurface).toBeLessThan(WCAG_AA_NORMAL_TEXT);
    expect(result.inkOnAccent).toBeLessThan(WCAG_AA_NORMAL_TEXT);
    expect(result.passes).toBe(false);
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
