import type { WallpaperTone } from "@/design/color";
import { hexToRgb } from "@/design/color";

/**
 * The procedural wallpaper library. Each style is a pure function from a
 * five-role {@link WallpaperTone} to a list of CSS background layers, so the
 * artwork is data rather than fixed CSS — before this, `@utility wallpaper` in
 * global.css hardcoded one composition (a diagonal gradient plus three blurred
 * shapes) and presets could only ever recolor it.
 *
 * Three constraints on everything emitted here, all load-bearing:
 *
 * 1. **Something in every composition must resolve at pixel scale.** The
 *    first pass was built entirely from gradient ramps spanning 40-70% of the
 *    viewport — a 500-900px transition on a 1280px screen — so the whole
 *    desktop read as out of focus. Every style now carries at least one
 *    element with a defined boundary: a hairline, a zero-width color stop, or
 *    a fine repeating grain. Soft passages are fine as the ground beneath
 *    something sharp, never as the entire surface.
 * 2. **No viewport units.** Settings renders these same vars into ~130x84
 *    preview cards; `vmax` would size the artwork to the window instead of to
 *    the card and every preview would show one flat corner of the gradient.
 *    Extents are percentages of the painted box, which scales correctly.
 * 3. **Tiled geometry goes through {@link tile}**, so a preview can set
 *    `--wall-tile` to shrink dot/ring spacing in proportion to the card —
 *    while {@link tilePlus} keeps the stroke *widths* at a fixed px so a
 *    hairline stays a hairline at any scale.
 *
 * Composition and constants come from the "Kagami OS wallpaper design" Claude
 * Design project; the tone roles they paint with are derived from the active
 * accent in `design/color.ts`.
 */

export interface WallpaperLayer {
  /** A single `background-image` entry. */
  image: string;
  size: string;
  repeat: string;
  position: string;
}

export interface WallpaperStyle {
  id: string;
  name: string;
  /** Pure: tone -> the layer stack, topmost layer first (CSS paint order). */
  layers: (tone: WallpaperTone) => WallpaperLayer[];
}

/**
 * A tone color at partial alpha, as legacy `rgba()`.
 *
 * Deliberately not `color-mix(in srgb, …, transparent)`, which is what this
 * used to emit. All three engines *resolve* that to the same
 * `color(srgb … / a)`, but a gradient whose stops are modern `color()` values
 * no longer interpolates as legacy sRGB, and Firefox renders it very
 * differently from Chromium and WebKit — the field washes out and every
 * hairline picks up a dark fringe. Plain `rgba()` keeps the gradient on the
 * legacy path, where all three agree. Tones are always `#rrggbb` from
 * `oklchToHex`, so the conversion is exact.
 */
function alpha(color: string, percent: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${percent / 100})`;
}

/** A tile dimension that a preview can scale down via `--wall-tile`. */
function tile(px: number): string {
  return `calc(${px}px * var(--wall-tile, 1))`;
}

/**
 * A tiled distance plus a fixed offset — the far edge of a stroke whose
 * spacing scales with `--wall-tile` but whose *width* must not. Scaling a 1px
 * hairline by the preview's 0.34 would render it at a third of a pixel and the
 * browser would fade it to nothing, which is exactly the softness these
 * strokes exist to fix.
 */
function tilePlus(px: number, addPx: number): string {
  return `calc(${px}px * var(--wall-tile, 1) + ${addPx}px)`;
}

/** A layer that simply fills the box (the common case for gradients). */
function fill(image: string): WallpaperLayer {
  return { image, size: "auto", repeat: "no-repeat", position: "center" };
}

/** A layer confined to part of the box — e.g. a grain over only the sky. */
function box(image: string, size: string, position: string): WallpaperLayer {
  return { image, size, repeat: "no-repeat", position };
}

/** A layer that repeats on a square grid of `px`, scaled by `--wall-tile`. */
function grid(image: string, px: number, position = "center"): WallpaperLayer {
  return { image, size: `${tile(px)} ${tile(px)}`, repeat: "repeat", position };
}

export const WALLPAPER_STYLES: WallpaperStyle[] = [
  {
    id: "drift",
    name: "Drift",
    // Lagoon's heritage artwork, resolved: a hard-edged coral mass with two
    // 1.5px arcs echoing its rim, over a 26px diagonal hairline weave. The
    // mass is solid rather than a soft alpha falloff — fading a warm hue over
    // a cool field passes through desaturated mud, which is what made the
    // first pass grey where the coral met the teal.
    layers: tone => [
      fill(
        `repeating-linear-gradient(140deg, transparent 0 ${tile(26)}, `
        + `${alpha(tone.line, 15)} ${tile(26)} ${tilePlus(26, 1)})`,
      ),
      fill(
        `radial-gradient(41% 36% at 96% -10%, transparent 0 calc(100% - 1.5px), `
        + `${alpha(tone.wash, 62)} calc(100% - 1.5px) 100%, transparent 100%)`,
      ),
      fill(
        `radial-gradient(63% 56% at 96% -10%, transparent 0 calc(100% - 1.5px), `
        + `${alpha(tone.line, 70)} calc(100% - 1.5px) 100%, transparent 100%)`,
      ),
      fill(`radial-gradient(55% 48% at 96% -10%, ${tone.warm} 0 100%, transparent 100%)`),
      fill(
        `radial-gradient(54% 48% at -6% 94%, ${alpha(tone.line, 42)} 0%, `
        + `${alpha(tone.line, 26)} 40%, transparent 72%)`,
      ),
      fill(`linear-gradient(140deg, ${tone.base} 0%, ${tone.mid} 42%, ${tone.wash} 100%)`),
    ],
  },
  {
    id: "aurora",
    name: "Aurora",
    // Zero-width stops on every shaft edge, plus an 11px hairline rain
    // running with the shafts.
    layers: tone => [
      fill(
        `repeating-linear-gradient(104deg, transparent 0 ${tile(11)}, `
        + `${alpha(tone.line, 13)} ${tile(11)} ${tilePlus(11, 1)})`,
      ),
      fill(
        `linear-gradient(104deg, transparent 26.4%, ${tone.warm} 26.4% 27%, `
        + `transparent 27% 29.2%, ${tone.warm} 29.2% 32.6%, transparent 32.6% 34%, `
        + `${tone.warm} 34% 34.5%, transparent 34.5%)`,
      ),
      fill(
        `linear-gradient(86deg, transparent 52%, ${alpha(tone.line, 52)} 61%, `
        + `${alpha(tone.line, 52)} 62.4%, transparent 62.4% 64.6%, `
        + `${alpha(tone.line, 32)} 64.6% 65.6%, transparent 65.6%)`,
      ),
      fill(`linear-gradient(168deg, ${tone.mid} 0%, ${tone.base} 100%)`),
    ],
  },
  {
    id: "strata",
    name: "Strata",
    // A solid sun with a 1.5px echo ring, a hairline-ruled horizon, and two
    // grains — 22px in the sky, 7px through the strata.
    layers: tone => [
      box(
        `repeating-linear-gradient(180deg, transparent 0 ${tile(7)}, `
        + `${alpha(tone.line, 15)} ${tile(7)} ${tilePlus(7, 1)})`,
        "100% 56%",
        "left bottom",
      ),
      box(
        `repeating-linear-gradient(180deg, transparent 0 ${tile(22)}, `
        + `${alpha(tone.line, 10)} ${tile(22)} ${tilePlus(22, 1)})`,
        "100% 44%",
        "left top",
      ),
      fill(
        `radial-gradient(circle at 68% 30%, transparent 0 ${tile(74)}, `
        + `${alpha(tone.warm, 85)} ${tile(74)} ${tilePlus(74, 1.5)}, `
        + `transparent ${tilePlus(74, 1.5)})`,
      ),
      fill(`radial-gradient(circle at 68% 30%, ${tone.warm} 0 ${tile(56)}, transparent ${tile(56)})`),
      fill(
        `linear-gradient(180deg, ${tone.wash} 0%, ${tone.mid} 44%, `
        + `${tone.wash} 44% calc(44% + 1.5px), ${tone.base} calc(44% + 1.5px) 52%, `
        + `${tone.mid} 52% 53.2%, ${tone.base} 53.2% 63%, ${tone.mid} 63% 72%, `
        + `${tone.wash} 72% calc(72% + 1.5px), ${tone.base} calc(72% + 1.5px) 86%, `
        + `${tone.mid} 86% 87.2%, ${tone.base} 87.2% 100%)`,
      ),
    ],
  },
  {
    id: "contour",
    name: "Contour",
    // 1.2px contour rings at 16px, index rings at 86px, and a solid summit
    // cap with a defined edge.
    layers: tone => [
      fill(
        `repeating-radial-gradient(circle at 26% 22%, transparent 0 ${tile(16)}, `
        + `${alpha(tone.line, 34)} ${tile(16)} ${tilePlus(16, 1.2)})`,
      ),
      fill(
        `repeating-radial-gradient(circle at 26% 22%, transparent 0 ${tile(86)}, `
        + `${alpha(tone.line, 62)} ${tile(86)} ${tilePlus(86, 1.6)})`,
      ),
      fill(`radial-gradient(circle at 26% 22%, ${tone.warm} 0 ${tile(26)}, transparent ${tile(26)})`),
      fill(`radial-gradient(62% 52% at 26% 22%, ${alpha(tone.warm, 22)} 0%, transparent 76%)`),
      fill(`linear-gradient(150deg, ${tone.base} 0%, ${tone.mid} 62%, ${tone.base} 100%)`),
    ],
  },
  {
    id: "halftone",
    name: "Halftone",
    // Two hard-edged dot screens (18px coarse, 18px offset fine) printed over
    // a solid duotone plate.
    layers: tone => [
      grid(
        `radial-gradient(circle at 50% 50%, ${alpha(tone.line, 46)} 0 ${tile(1.7)}, transparent ${tile(1.8)})`,
        18,
      ),
      grid(
        `radial-gradient(circle at 50% 50%, ${alpha(tone.line, 26)} 0 ${tile(0.9)}, transparent ${tile(1)})`,
        18,
        `${tile(9)} ${tile(9)}`,
      ),
      fill(`radial-gradient(64% 52% at 82% 4%, ${tone.warm} 0 100%, transparent 100%)`),
      fill(`linear-gradient(160deg, ${tone.mid} 0%, ${tone.base} 100%)`),
    ],
  },
];

export const DEFAULT_WALLPAPER_STYLE_ID = "drift";

export function wallpaperStyleById(id: string): WallpaperStyle {
  return WALLPAPER_STYLES.find(style => style.id === id) ?? WALLPAPER_STYLES[0];
}

/**
 * The `--wall*` custom properties a style renders to. The four values are
 * comma-separated lists of the same length, one entry per layer, matching how
 * `@utility wallpaper` reads them as separate `background-*` longhands.
 */
export function wallpaperStyleVars(styleId: string, tone: WallpaperTone): Record<string, string> {
  const layers = wallpaperStyleById(styleId).layers(tone);
  return {
    "--wall": layers.map(layer => layer.image).join(", "),
    "--wall-size": layers.map(layer => layer.size).join(", "),
    "--wall-repeat": layers.map(layer => layer.repeat).join(", "),
    "--wall-position": layers.map(layer => layer.position).join(", "),
  };
}
