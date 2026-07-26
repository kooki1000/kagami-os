/**
 * Color math for Kagami's accent-customization feature (ROADMAP.md §3.U,
 * item U2): sRGB hex <-> OKLCH conversions, WCAG 2.1 contrast, and a
 * formula deriving a full accent tone (accent2 + window-control duotone)
 * from a single user-picked base color.
 *
 * No external color library by design (see the U2 plan doc) — every formula
 * is a direct transcription of a published spec (sRGB transfer function,
 * Björn Ottosson's OKLab matrices, OKLCH conversion, WCAG 2.1 §1.4.3
 * contrast). Pure and framework-agnostic (no DOM) — see color.test.ts.
 */

import { clamp01 } from "@/lib/math";

export interface Oklch {
  /** Lightness, 0-1. */
  l: number;
  /** Chroma, roughly 0-0.4 for in-gamut sRGB colors. */
  c: number;
  /** Hue, degrees, 0-360 (0 for achromatic colors, i.e. c === 0). */
  h: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// ---------------------------------------------------------------------------
// Hex <-> sRGB
// ---------------------------------------------------------------------------

/** Parses a `#rgb` or `#rrggbb` hex string into 0-255 integer channels. */
export function hexToRgb(hex: string): Rgb {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded = normalized.length === 3
    ? normalized.split("").map(ch => ch + ch).join("")
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

/** Formats 0-255 integer channels (fractional values are rounded) as `#rrggbb`. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ---------------------------------------------------------------------------
// sRGB <-> linear sRGB (the sRGB EOTF and its inverse)
// ---------------------------------------------------------------------------

/** 0-255 sRGB channel -> 0-1 linear-light channel. */
function srgbChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 0-1 linear-light channel -> 0-255 sRGB channel (not yet rounded). */
function linearChannelToSrgb(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return encoded * 255;
}

// ---------------------------------------------------------------------------
// Linear sRGB <-> OKLab, and OKLab <-> OKLCH
//
// Matrices per Björn Ottosson's published OKLab derivation. `l_`/`m_`/`s_`
// name the cube-rooted (forward) / cubed (inverse) intermediate values, per
// the source material's own naming.
// ---------------------------------------------------------------------------

function linearRgbToOklab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

function oklabToLinearRgb(l: number, a: number, b: number): Rgb {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const lCubed = l_ ** 3;
  const mCubed = m_ ** 3;
  const sCubed = s_ ** 3;

  return {
    r: +4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed,
    g: -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed,
    b: -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.7076147010 * sCubed,
  };
}

// ---------------------------------------------------------------------------
// Public: hex <-> OKLCH
// ---------------------------------------------------------------------------

/** Converts a `#rrggbb` hex color to OKLCH (hue in degrees, 0 when achromatic). */
export function hexToOklch(hex: string): Oklch {
  const { r, g, b } = hexToRgb(hex);
  const lin = {
    r: srgbChannelToLinear(r),
    g: srgbChannelToLinear(g),
    b: srgbChannelToLinear(b),
  };
  const lab = linearRgbToOklab(lin.r, lin.g, lin.b);
  const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  const h = c < 1e-6 ? 0 : (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { l: lab.l, c, h: h < 0 ? h + 360 : h };
}

const GAMUT_EPSILON = 1e-4;

function isLinearRgbInGamut({ r, g, b }: Rgb): boolean {
  return r >= -GAMUT_EPSILON && r <= 1 + GAMUT_EPSILON
    && g >= -GAMUT_EPSILON && g <= 1 + GAMUT_EPSILON
    && b >= -GAMUT_EPSILON && b <= 1 + GAMUT_EPSILON;
}

/**
 * Resolves OKLCH to in-gamut linear sRGB. Chroma is the axis that runs out
 * of gamut first (lightness/hue held fixed), and the achromatic edge
 * (chroma 0) is always representable for any lightness in [0, 1], so a
 * binary search over chroma converges on the maximum in-gamut chroma at
 * this lightness/hue — a small, standard gamut-mapping technique that
 * preserves the intended hue instead of letting a naive per-channel RGB
 * clamp shift it (which is what happens if out-of-gamut OKLCH is just
 * converted and clamped directly).
 */
function resolveInGamutLinearRgb(l: number, c: number, hRad: number): Rgb {
  const toLinearRgb = (chroma: number) => oklabToLinearRgb(l, chroma * Math.cos(hRad), chroma * Math.sin(hRad));

  const atRequestedChroma = toLinearRgb(c);
  if (isLinearRgbInGamut(atRequestedChroma)) {
    return atRequestedChroma;
  }

  let lo = 0;
  let hi = c;
  let best = toLinearRgb(lo); // chroma 0 (grey) is always in gamut
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const candidate = toLinearRgb(mid);
    if (isLinearRgbInGamut(candidate)) {
      lo = mid;
      best = candidate;
    }
    else {
      hi = mid;
    }
  }
  return best;
}

/** Converts OKLCH back to a `#rrggbb` hex color, gamut-mapped by reducing chroma if needed. */
export function oklchToHex({ l, c, h }: Oklch): string {
  const hRad = (h * Math.PI) / 180;
  const lin = resolveInGamutLinearRgb(l, c, hRad);
  return rgbToHex({
    r: linearChannelToSrgb(lin.r),
    g: linearChannelToSrgb(lin.g),
    b: linearChannelToSrgb(lin.b),
  });
}

// ---------------------------------------------------------------------------
// WCAG 2.1 relative luminance & contrast ratio
// (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance)
// ---------------------------------------------------------------------------

/** WCAG's own sRGB->linear step for relative luminance (threshold 0.03928, per spec text). */
function wcagChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance of a `#rrggbb` color, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const R = wcagChannelToLinear(r);
  const G = wcagChannelToLinear(g);
  const B = wcagChannelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG 2.1 contrast ratio between two colors, 1 (identical) to 21 (black/white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Derived accent tone
// ---------------------------------------------------------------------------

/** WCAG AA threshold for normal-weight text. */
export const WCAG_AA_NORMAL_TEXT = 4.5;

export interface DerivedAccentTone {
  accent2: string;
  controls: { close: string; minimize: string; zoom: string };
}

/**
 * Derives an `accent2` and a 3-color window-control duotone from a single
 * base accent color, in OKLCH space. Per ROADMAP.md §6.5's guardrail, the
 * control triad must stay *derived* from one user-picked color, not three
 * independent ones — so every constant below is a fixed hue/lightness/chroma
 * offset from the base, and the module only ever produces two hues (the base
 * hue, and one derived "warm" hue).
 *
 * Constants were calibrated against the hand-tuned "Lagoon" preset (accent
 * #0f9b8e → accent2 #f2765b): roughly a -150° hue rotation (warmer/more
 * "harmonious" than a literal -180° complement), a +0.085 lightness lift, and
 * a +0.05 chroma boost. Lagoon's `close` reuses its `accent2` tone rather
 * than being a third independent color; `minimize`/`zoom` stay on the base
 * hue, one step lighter (+0.061 L, +0.010 C) and one step darker (-0.081 L,
 * -0.014 C) respectively.
 */
export function deriveAccentTone(baseHex: string): DerivedAccentTone {
  const base = hexToOklch(baseHex);

  // accent2: warm-shifted hue, lighter, more chroma. See derivation
  // comment above — tuned to reproduce Lagoon's accent -> accent2 step.
  const accent2Oklch: Oklch = {
    l: clamp01(base.l + 0.085),
    c: Math.min(0.37, base.c + 0.05),
    h: normalizeHue(base.h - 150),
  };

  // minimize: base hue, lightened.
  const minimize: Oklch = {
    l: clamp01(base.l + 0.061),
    c: Math.max(0, base.c + 0.010),
    h: base.h,
  };
  // zoom: base hue, darkened.
  const zoom: Oklch = {
    l: clamp01(base.l - 0.081),
    c: Math.max(0, base.c - 0.014),
    h: base.h,
  };

  const accent2 = oklchToHex(accent2Oklch);

  return {
    accent2,
    controls: {
      // close reuses the accent2 tone exactly, per Lagoon's own preset —
      // the "second" duotone hue, not a third independent color.
      close: accent2,
      minimize: oklchToHex(minimize),
      zoom: oklchToHex(zoom),
    },
  };
}

function normalizeHue(h: number): number {
  const wrapped = h % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

// ---------------------------------------------------------------------------
// Contrast check for a candidate accent (U2's picker warning, not a block)
// ---------------------------------------------------------------------------

export interface AccentContrastResult {
  /** Contrast ratio of the accent against the app surface (e.g. window chrome). */
  accentOnSurface: number;
  /** Contrast ratio of ink (text) drawn on top of the accent. */
  inkOnAccent: number;
  /** Whether both ratios clear WCAG AA for normal text (4.5:1). */
  passes: boolean;
}

/**
 * Checks a candidate accent color against both contrast pairs the U2 picker
 * cares about: the accent sitting on the app surface, and ink (text) sitting
 * on top of the accent. Pure check only — the picker UI decides how to warn;
 * this never blocks anything.
 */
export function checkAccentContrast(
  accentHex: string,
  surfaceHex: string,
  inkHex: string,
): AccentContrastResult {
  const accentOnSurface = contrastRatio(accentHex, surfaceHex);
  const inkOnAccent = contrastRatio(inkHex, accentHex);
  return {
    accentOnSurface,
    inkOnAccent,
    passes: accentOnSurface >= WCAG_AA_NORMAL_TEXT && inkOnAccent >= WCAG_AA_NORMAL_TEXT,
  };
}
