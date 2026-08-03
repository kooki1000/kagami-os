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
  const accent2Oklch = shiftOklch(base, { dl: 0.085, dc: 0.05, dh: -150, chromaMax: 0.37 });
  // minimize: base hue, lightened. zoom: base hue, darkened.
  const minimize = shiftOklch(base, { dl: 0.061, dc: 0.010 });
  const zoom = shiftOklch(base, { dl: -0.081, dc: -0.014 });

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

/** White, the label color every filled accent control draws in. */
const ACCENT_LABEL = "#ffffff";
/**
 * How far down the OKLCH lightness ramp {@link deriveAccentStrong} may walk
 * before giving up. Even a pure yellow accent clears AA long before this, so
 * the floor only exists to bound the loop rather than to be reached.
 */
const ACCENT_STRONG_MIN_L = 0.18;
/** Lightness decrement per step — fine enough that the result never overshoots visibly. */
const ACCENT_STRONG_STEP_L = 0.005;

/**
 * The accent, darkened only as far as it must be for white text on top of it
 * to clear WCAG AA (4.5:1) — the fill for accent-colored controls that carry a
 * text label (primary buttons, the selected row in Player's playlist).
 *
 * Needed because `--accent` alone doesn't pass: shipped Lagoon is 3.44:1 in
 * light and 2.43:1 in dark against white, so every primary button in the OS
 * was failing AA. Hue is held fixed and only lightness moves (chroma follows
 * only where `oklchToHex`'s gamut mapping has to pull it in), so this stays a
 * derivation of the one user-picked accent per ROADMAP.md §6.5's guardrail —
 * not a second hand-authored color. An accent already dark
 * enough is returned untouched, which is why most custom accents see no shift
 * at all.
 *
 * Deliberately **not** used for accent surfaces without text on them — the
 * switch track, progress dots, focus rings, `text-accent` on a surface — which
 * are governed by the `accentOnSurface` pair instead and must keep matching
 * the accent exactly.
 */
export function deriveAccentStrong(accentHex: string): string {
  if (contrastRatio(ACCENT_LABEL, accentHex) >= WCAG_AA_NORMAL_TEXT)
    return accentHex;

  const base = hexToOklch(accentHex);
  for (let l = base.l - ACCENT_STRONG_STEP_L; l >= ACCENT_STRONG_MIN_L; l -= ACCENT_STRONG_STEP_L) {
    const candidate = oklchToHex({ ...base, l });
    if (contrastRatio(ACCENT_LABEL, candidate) >= WCAG_AA_NORMAL_TEXT)
      return candidate;
  }
  return oklchToHex({ ...base, l: ACCENT_STRONG_MIN_L });
}

function normalizeHue(h: number): number {
  const wrapped = h % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Builds a target OKLCH color by offsetting `base`'s lightness/chroma/hue —
 * the shape both {@link deriveAccentTone} and {@link deriveWallpaperTone}
 * repeat for every derived color. Lightness clamps to the representable
 * [0, 1] range; chroma clamps to 0 and, optionally, a caller-supplied
 * ceiling (accents can be more vivid than the field is allowed to get).
 */
function shiftOklch(base: Oklch, { dl, dc, dh = 0, chromaMax = Infinity }: {
  dl: number;
  dc: number;
  dh?: number;
  chromaMax?: number;
}): Oklch {
  return {
    l: clamp01(base.l + dl),
    c: Math.max(0, Math.min(chromaMax, base.c + dc)),
    h: dh === 0 ? base.h : normalizeHue(base.h + dh),
  };
}

// ---------------------------------------------------------------------------
// Derived wallpaper tone
// ---------------------------------------------------------------------------

/**
 * The five color roles every procedural wallpaper style composes from. Slot
 * names are roles in the artwork, not a strict lightness ramp — `base`/`mid`/
 * `wash` are the three field stops (ascending lightness within a theme),
 * `warm` is the single saturated mass, `line` is the ink used for contour
 * rings and halftone dots.
 */
export interface WallpaperTone {
  base: string;
  mid: string;
  wash: string;
  warm: string;
  line: string;
}

/**
 * Chroma ceiling for the three field stops. The field covers the whole
 * screen, so a high-chroma accent must not drag it into a fully saturated
 * backdrop — Lagoon's own field peaks at C 0.113, so this only bites for
 * accents more vivid than the presets.
 */
const FIELD_CHROMA_MAX = 0.125;

/**
 * Field-stop offsets from the accent, per theme. Light runs the field
 * `lighter` than the accent (a pale wash in the far corner); dark runs it far
 * darker, since the wallpaper has to sit behind light window chrome either
 * way.
 */
const FIELD_TARGETS: Record<"light" | "dark", Record<"base" | "mid" | "wash" | "line", { dl: number; dc: number }>> = {
  light: {
    base: { dl: -0.035, dc: -0.006 },
    mid: { dl: +0.039, dc: +0.006 },
    wash: { dl: +0.161, dc: -0.022 },
    line: { dl: +0.274, dc: -0.066 },
  },
  dark: {
    base: { dl: -0.392, dc: -0.065 },
    mid: { dl: -0.296, dc: -0.046 },
    wash: { dl: -0.235, dc: -0.035 },
    line: { dl: -0.180, dc: -0.030 },
  },
};

/** `warm` is the accent2 tone itself in light, and a deepened one in dark. */
const WARM_TARGETS: Record<"light" | "dark", { dl: number; dc: number }> = {
  light: { dl: 0, dc: 0 },
  dark: { dl: -0.091, dc: +0.003 },
};

/**
 * Derives a wallpaper's five color roles from the accent pair that is already
 * driving the rest of the shell — field stops ride the accent hue, the `warm`
 * mass rides the accent2 hue. This is what keeps a user-picked accent from
 * clashing with the desktop behind it: one hue in, a whole coherent
 * environment out.
 *
 * Every constant above was solved against the hand-authored "Lagoon"
 * wallpaper (the same calibration approach as {@link deriveAccentTone}), so
 * feeding Lagoon's own accent pair back in reproduces its original gradient
 * and shape colors to within a unit or two per channel — see color.test.ts.
 */
export function deriveWallpaperTone(
  accentHex: string,
  accent2Hex: string,
  theme: "light" | "dark",
): WallpaperTone {
  const accent = hexToOklch(accentHex);
  const accent2 = hexToOklch(accent2Hex);

  const field = (target: { dl: number; dc: number }): string =>
    oklchToHex(shiftOklch(accent, { ...target, chromaMax: FIELD_CHROMA_MAX }));

  const targets = FIELD_TARGETS[theme];
  const warmTarget = WARM_TARGETS[theme];

  return {
    base: field(targets.base),
    mid: field(targets.mid),
    wash: field(targets.wash),
    line: field(targets.line),
    warm: oklchToHex(shiftOklch(accent2, warmTarget)),
  };
}

// ---------------------------------------------------------------------------
// Contrast check for a candidate accent (U2's picker warning, not a block)
// ---------------------------------------------------------------------------

export interface AccentContrastResult {
  /** Contrast ratio of the accent against the app surface (e.g. window chrome). */
  accentOnSurface: number;
  /** Contrast ratio of the label drawn on top of a filled accent control. */
  labelOnAccent: number;
  /** Whether both ratios clear WCAG AA for normal text (4.5:1). */
  passes: boolean;
}

/**
 * Checks a candidate accent color against both contrast pairs the U2 picker
 * cares about: the accent sitting on the app surface, and the label sitting on
 * top of a filled accent control. Pure check only — the picker UI decides how
 * to warn; this never blocks anything.
 *
 * The second pair is measured against {@link deriveAccentStrong}'s output and
 * white, because that is what the UI actually renders. It used to compare the
 * theme's *ink* against the raw accent — a pair no control has ever drawn — so
 * the picker could report a comfortable pass while every primary button on
 * screen sat below AA.
 */
export function checkAccentContrast(
  accentHex: string,
  surfaceHex: string,
): AccentContrastResult {
  const accentOnSurface = contrastRatio(accentHex, surfaceHex);
  const labelOnAccent = contrastRatio(ACCENT_LABEL, deriveAccentStrong(accentHex));
  return {
    accentOnSurface,
    labelOnAccent,
    passes: accentOnSurface >= WCAG_AA_NORMAL_TEXT && labelOnAccent >= WCAG_AA_NORMAL_TEXT,
  };
}
