import type { WallpaperTone } from "@/design/color";
import type { ResolvedTheme } from "@/system/theme/themeStore";
import { deriveAccentTone, deriveWallpaperTone } from "@/design/color";
import { DEFAULT_WALLPAPER_STYLE_ID, wallpaperStyleVars } from "./wallpaperStyles";

/**
 * "Looks" — the curated appearance presets, and the machinery that turns one
 * into the CSS custom properties the shell reads.
 *
 * A look is a single considered decision: an accent pair per theme, the window
 * control duotone that goes with it, and the wallpaper design it was composed
 * against. Accent and wallpaper used to be two independent preset lists the
 * user picked from separately, which meant most reachable combinations were
 * ones nobody had ever looked at. Everything downstream of the accent pair —
 * the wallpaper's five tone roles, and the control triad for a custom accent —
 * is derived in OKLCH (`src/design/color.ts`), so a user-picked color can't
 * clash with the desktop behind it either.
 *
 * Lagoon's values are still the prototype's, verbatim (see ARCHITECTURE.md);
 * Ember and Slate are tuned to the same OKLCH lightness/chroma register so all
 * three read with the same weight rather than as three unrelated one-offs.
 */

export interface AccentTone {
  accent: string;
  accent2: string;
}

export interface LookPreset {
  id: string;
  name: string;
  /** One-line description, shown under the preview card in Settings. */
  tagline: string;
  light: AccentTone;
  dark: AccentTone;
  /** Window-control triad (theme-independent, as in the prototype). */
  controls: { close: string; minimize: string; zoom: string };
  /** The wallpaper design this look was composed against. */
  wallpaperStyleId: string;
}

/**
 * How a custom wallpaper image is sized/positioned within the wallpaper layer.
 * Procedural styles ignore this entirely — it only takes effect once a custom
 * image replaces them for the active theme. See {@link wallpaperFitVars}.
 */
export type WallpaperFit = "fill" | "fit" | "centre" | "tile";

export const LOOKS: LookPreset[] = [
  {
    id: "lagoon",
    name: "Lagoon",
    tagline: "Teal and warm coral",
    light: { accent: "#0f9b8e", accent2: "#f2765b" },
    dark: { accent: "#2fb9ab", accent2: "#ff8368" },
    controls: { close: "#f2765b", minimize: "#17b0a1", zoom: "#0c8074" },
    wallpaperStyleId: "drift",
  },
  // Ember's first pass paired a brown-orange accent (OKLCH hue 52) with a
  // teal secondary; the field came out as three near-identical browns and the
  // teal read as a clash rather than a partner. It now sits at hue 66 and the
  // derivation's field chroma ceiling, which spreads the field stops as
  // widely as Lagoon's (0.197 vs 0.196 in lightness), and the secondary
  // follows Lagoon's own accent -> accent2 relationship: warmer-shifted hue,
  // ~+0.085 lightness, equal-or-higher chroma. That lands on an indigo within
  // 2 degrees of what `deriveAccentTone` produces from this accent, so
  // picking the same amber by hand in the custom picker gives the same pair.
  {
    id: "ember",
    name: "Ember",
    tagline: "Amber and indigo",
    light: { accent: "#b87421", accent2: "#8c96f0" },
    dark: { accent: "#e7a055", accent2: "#a5b0ff" },
    controls: { close: "#8c96f0", minimize: "#d0852b", zoom: "#995f15" },
    wallpaperStyleId: "strata",
  },
  {
    id: "slate",
    name: "Slate",
    tagline: "Steel blue and sand",
    light: { accent: "#3a86b0", accent2: "#ca9252" },
    dark: { accent: "#67acd8", accent2: "#dda561" },
    controls: { close: "#ca9252", minimize: "#4499c9", zoom: "#2e6d90" },
    wallpaperStyleId: "halftone",
  },
];

export const DEFAULT_LOOK_ID = "lagoon";

export function lookById(id: string): LookPreset {
  return LOOKS.find(look => look.id === id) ?? LOOKS[0];
}

/** Representative accent dot for a look's preview (uses the light tone). */
export function lookSwatch(look: LookPreset): string {
  return look.light.accent;
}

// ---------------------------------------------------------------------------
// Material — how much the menu bar, dock and window chrome blur what's behind
// ---------------------------------------------------------------------------

export type MaterialLevel = "clear" | "frosted" | "opaque";

/**
 * The "frosted" chrome tints — what global.css hardcoded before the material
 * control existed, and the reference every level is expressed against. These
 * are their own near-neutrals rather than `--surface`, and the two themes run
 * different alphas: dark deliberately keeps its glass a step deeper than the
 * window body so a menu bar doesn't melt into a window behind it.
 */
const CHROME_BASE: Record<ResolvedTheme, { primary: string; secondary: string; primaryAlpha: number; secondaryAlpha: number }> = {
  light: { primary: "250, 248, 244", secondary: "250, 248, 244", primaryAlpha: 0.74, secondaryAlpha: 0.58 },
  dark: { primary: "26, 24, 20", secondary: "20, 18, 15", primaryAlpha: 0.72, secondaryAlpha: 0.56 },
};

interface MaterialSpec {
  /** Multiplier on the frosted alphas; `null` means fully opaque. */
  alphaScale: number | null;
  /** Full `backdrop-filter` values — `none` lets the opaque level skip backdrop compositing entirely. */
  filter: string;
  filter2: string;
}

const MATERIALS: Record<MaterialLevel, MaterialSpec> = {
  clear: {
    alphaScale: 0.75,
    filter: "blur(26px) saturate(1.7)",
    filter2: "blur(30px) saturate(1.75)",
  },
  // The shipped look — an exact no-op against the old hardcoded values.
  frosted: {
    alphaScale: 1,
    filter: "blur(18px) saturate(1.5)",
    filter2: "blur(22px) saturate(1.6)",
  },
  opaque: {
    alphaScale: null,
    filter: "none",
    filter2: "none",
  },
};

export const DEFAULT_MATERIAL_LEVEL: MaterialLevel = "frosted";

/** The chrome tint/blur vars for a material level. Pure. */
export function materialVars(level: MaterialLevel, theme: ResolvedTheme): Record<string, string> {
  const spec = MATERIALS[level] ?? MATERIALS[DEFAULT_MATERIAL_LEVEL];
  const base = CHROME_BASE[theme];
  const scale = (alpha: number): number =>
    spec.alphaScale === null ? 1 : Math.round(alpha * spec.alphaScale * 100) / 100;

  return {
    "--chrome": `rgba(${base.primary}, ${scale(base.primaryAlpha)})`,
    "--chrome-2": `rgba(${base.secondary}, ${scale(base.secondaryAlpha)})`,
    "--chrome-filter": spec.filter,
    "--chrome-filter-2": spec.filter2,
  };
}

// ---------------------------------------------------------------------------
// Wallpaper fit (custom images only)
// ---------------------------------------------------------------------------

const WALLPAPER_FIT_CSS: Record<WallpaperFit, { size: string; repeat: string; position: string }> = {
  fill: { size: "cover", repeat: "no-repeat", position: "center" },
  fit: { size: "contain", repeat: "no-repeat", position: "center" },
  centre: { size: "auto", repeat: "no-repeat", position: "center" },
  tile: { size: "auto", repeat: "repeat", position: "top left" },
};

/**
 * The `--wall-size`/`--wall-repeat`/`--wall-position` vars a custom wallpaper
 * image needs for a given fit mode. Pure — split out from
 * {@link themeVariables} so the fit->CSS mapping is unit-testable without
 * going through the preset machinery.
 */
export function wallpaperFitVars(fit: WallpaperFit): Record<string, string> {
  const css = WALLPAPER_FIT_CSS[fit];
  return {
    "--wall-size": css.size,
    "--wall-repeat": css.repeat,
    "--wall-position": css.position,
  };
}

// ---------------------------------------------------------------------------
// The whole variable map
// ---------------------------------------------------------------------------

/** User overrides `themeVariables` layers on top of the chosen look. */
export interface ThemeVariableOverrides {
  /** A user-picked accent hex; `null`/absent falls through to the look's accent. */
  customAccentHex?: string | null;
  /** A wallpaper design other than the look's own; `null`/absent inherits it. */
  wallpaperStyleId?: string | null;
  /**
   * A resolved URL for a custom wallpaper image — an object URL or an inline
   * `data:` URL, whatever `wallpaperBlobUrl.ts` last resolved for the active
   * theme. When set it replaces the procedural artwork entirely.
   */
  customWallpaperUrl?: string | null;
  /** How the custom image is sized; ignored unless `customWallpaperUrl` is set. */
  wallpaperFit?: WallpaperFit;
  materialLevel?: MaterialLevel;
}

/** The accent pair actually in effect, after a custom accent is applied. */
export function resolveAccentTone(look: LookPreset, theme: ResolvedTheme, customAccentHex?: string | null): AccentTone {
  if (!customAccentHex) {
    return look[theme];
  }
  return { accent: customAccentHex, accent2: deriveAccentTone(customAccentHex).accent2 };
}

/** The wallpaper tone actually in effect, for the shell and for Settings' previews. */
export function resolveWallpaperTone(
  look: LookPreset,
  theme: ResolvedTheme,
  customAccentHex?: string | null,
): WallpaperTone {
  const tone = resolveAccentTone(look, theme, customAccentHex);
  return deriveWallpaperTone(tone.accent, tone.accent2, theme);
}

/**
 * Compute the CSS custom properties a given look + theme + overrides should
 * set. Returns a plain map so the caller can write them onto the document root
 * (inline vars win over the static defaults in global.css).
 *
 * Note the `--wall-*` trio is always emitted now — procedural styles need real
 * multi-layer values, so the single-value fallbacks in global.css only cover
 * the pre-hydration paint.
 */
export function themeVariables(
  look: LookPreset,
  theme: ResolvedTheme,
  overrides: ThemeVariableOverrides = {},
): Record<string, string> {
  const customAccentHex = overrides.customAccentHex ?? null;
  const tone = resolveAccentTone(look, theme, customAccentHex);
  const derived = customAccentHex ? deriveAccentTone(customAccentHex) : null;

  const vars: Record<string, string> = {
    "--accent": tone.accent,
    "--accent-2": tone.accent2,
    "--ctl1": derived ? derived.controls.close : look.controls.close,
    "--ctl2": derived ? derived.controls.minimize : look.controls.minimize,
    "--ctl3": derived ? derived.controls.zoom : look.controls.zoom,
    ...materialVars(overrides.materialLevel ?? DEFAULT_MATERIAL_LEVEL, theme),
  };

  if (overrides.customWallpaperUrl) {
    return Object.assign(
      vars,
      { "--wall": `url("${overrides.customWallpaperUrl}")` },
      wallpaperFitVars(overrides.wallpaperFit ?? "fill"),
    );
  }

  return Object.assign(
    vars,
    wallpaperStyleVars(
      overrides.wallpaperStyleId ?? look.wallpaperStyleId ?? DEFAULT_WALLPAPER_STYLE_ID,
      deriveWallpaperTone(tone.accent, tone.accent2, theme),
    ),
  );
}
