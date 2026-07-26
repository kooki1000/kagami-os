import type { ResolvedTheme } from "@/system/theme/themeStore";
import { deriveAccentTone } from "@/design/color";

/**
 * Accent + wallpaper presets, transcribed verbatim from the KagamiOS.html
 * prototype's three "directions" (data-t a/b/c), plus two more curated
 * directions added for U3 (see the bottom of the ACCENTS/WALLPAPERS arrays).
 * Each direction is a complete, considered palette — accent, accent-2, the
 * monochrome window control triad, and a light/dark wallpaper. We expose
 * them as the user-selectable options rather than inventing partial ones,
 * per the design brief's "do not invent your own palette" guardrail.
 */

export interface AccentTone {
  accent: string;
  accent2: string;
}

export interface AccentPreset {
  id: string;
  name: string;
  light: AccentTone;
  dark: AccentTone;
  /** Window-control triad (theme-independent in the prototype). */
  controls: { close: string; minimize: string; zoom: string };
}

export interface WallpaperTone {
  wall: string;
  wsh1: string;
  wsh2: string;
}

export interface WallpaperPreset {
  id: string;
  name: string;
  light: WallpaperTone;
  dark: WallpaperTone;
  /** Small gradient used for the settings/thumbnail swatch. */
  swatch: string;
}

/**
 * U1: how a custom wallpaper image is sized/positioned within the
 * wallpaper layer. Presets ignore this entirely (they're CSS gradients,
 * not images) — it only takes effect once a custom file is set for the
 * active theme. See {@link wallpaperFitVars}.
 */
export type WallpaperFit = "fill" | "fit" | "centre" | "tile";

export const ACCENTS: AccentPreset[] = [
  {
    id: "lagoon",
    name: "Lagoon",
    light: { accent: "#0f9b8e", accent2: "#f2765b" },
    dark: { accent: "#2fb9ab", accent2: "#ff8368" },
    controls: { close: "#f2765b", minimize: "#17b0a1", zoom: "#0c8074" },
  },
  {
    id: "iris",
    name: "Iris",
    light: { accent: "#6b4ad4", accent2: "#a487f2" },
    dark: { accent: "#9b7bef", accent2: "#c3aefb" },
    controls: { close: "#d15b8f", minimize: "#8a6ff0", zoom: "#4bb6c9" },
  },
  {
    id: "meadow",
    name: "Meadow",
    light: { accent: "#8ba617", accent2: "#e2603f" },
    dark: { accent: "#c3e621", accent2: "#ff7a54" },
    controls: { close: "#e2603f", minimize: "#d8b42a", zoom: "#9dbd1c" },
  },
  // U3: two more curated directions, hand-authored in the same register as
  // the three above (not run through deriveAccentTone — presets are
  // considered, not formula-generated).
  {
    id: "ember",
    name: "Ember",
    light: { accent: "#b1552b", accent2: "#2f9b86" },
    dark: { accent: "#e08a54", accent2: "#49c2a8" },
    controls: { close: "#c1512f", minimize: "#3aa38d", zoom: "#256b5c" },
  },
  {
    id: "slate",
    name: "Slate",
    light: { accent: "#3f6a8a", accent2: "#e0785a" },
    dark: { accent: "#6fa8cf", accent2: "#ff9472" },
    controls: { close: "#e0785a", minimize: "#4f8fb3", zoom: "#2c5470" },
  },
];

export const WALLPAPERS: WallpaperPreset[] = [
  {
    id: "lagoon",
    name: "Lagoon",
    light: {
      wall: "linear-gradient(140deg,#0e8f83 0%,#17a89a 42%,#74cabf 100%)",
      wsh1: "#f2765b",
      wsh2: "#bfe6df",
    },
    dark: {
      wall: "linear-gradient(140deg,#0a3b37 0%,#0f6b62 55%,#123f3a 100%)",
      wsh1: "#e0654c",
      wsh2: "#0e5850",
    },
    swatch: "linear-gradient(140deg,#0e8f83,#74cabf)",
  },
  {
    id: "iris",
    name: "Iris",
    light: {
      wall: "linear-gradient(140deg,#5539bd 0%,#8368ec 58%,#c6b4fb 100%)",
      wsh1: "#3a2a7a",
      wsh2: "#c0aef7",
    },
    dark: {
      wall: "linear-gradient(140deg,#221a42 0%,#4a30a0 55%,#281c52 100%)",
      wsh1: "#6c4bd6",
      wsh2: "#2c2158",
    },
    swatch: "linear-gradient(140deg,#5539bd,#c6b4fb)",
  },
  {
    id: "meadow",
    name: "Meadow",
    light: {
      wall: "linear-gradient(140deg,#2c2a24 0%,#3b3931 55%,#4b4840 100%)",
      wsh1: "#b7e021",
      wsh2: "#57534699",
    },
    dark: {
      wall: "linear-gradient(140deg,#1a1915 0%,#2a2820 55%,#141310 100%)",
      wsh1: "#b7e021",
      wsh2: "#3a382f",
    },
    swatch: "linear-gradient(140deg,#2c2a24,#4b4840)",
  },
  {
    id: "ember",
    name: "Ember",
    light: {
      wall: "linear-gradient(140deg,#b1552b 0%,#d98a4f 42%,#f0c896 100%)",
      wsh1: "#2f9b86",
      wsh2: "#f6e2c8",
    },
    dark: {
      wall: "linear-gradient(140deg,#3a1f12 0%,#6b3a1f 55%,#2c160c 100%)",
      wsh1: "#49c2a8",
      wsh2: "#4a2a18",
    },
    swatch: "linear-gradient(140deg,#b1552b,#f0c896)",
  },
  {
    id: "slate",
    name: "Slate",
    light: {
      wall: "linear-gradient(140deg,#3f6a8a 0%,#6f97b8 46%,#c7d8e6 100%)",
      wsh1: "#e0785a",
      wsh2: "#dbe7f0",
    },
    dark: {
      wall: "linear-gradient(140deg,#16232e 0%,#274154 55%,#101a22 100%)",
      wsh1: "#d9694b",
      wsh2: "#20313d",
    },
    swatch: "linear-gradient(140deg,#3f6a8a,#c7d8e6)",
  },
];

export const DEFAULT_ACCENT_ID = "lagoon";
export const DEFAULT_WALLPAPER_ID = "lagoon";

export function accentById(id: string): AccentPreset {
  return ACCENTS.find(a => a.id === id) ?? ACCENTS[0];
}

export function wallpaperById(id: string): WallpaperPreset {
  return WALLPAPERS.find(w => w.id === id) ?? WALLPAPERS[0];
}

/** Representative accent dot for the picker (uses the light tone). */
export function accentSwatch(preset: AccentPreset): string {
  return preset.light.accent;
}

/** CSS background sizing/repeat/position per {@link WallpaperFit}. */
const WALLPAPER_FIT_CSS: Record<WallpaperFit, { size: string; repeat: string; position: string }> = {
  fill: { size: "cover", repeat: "no-repeat", position: "center" },
  fit: { size: "contain", repeat: "no-repeat", position: "center" },
  centre: { size: "auto", repeat: "no-repeat", position: "center" },
  tile: { size: "auto", repeat: "repeat", position: "top left" },
};

/**
 * The `--wall-size`/`--wall-repeat`/`--wall-position` vars a custom
 * wallpaper image needs for a given fit mode. Pure — split out from
 * `themeVariables` so the fit->CSS mapping itself is unit-testable without
 * going through the accent/wallpaper preset machinery.
 */
export function wallpaperFitVars(fit: WallpaperFit): Record<string, string> {
  const css = WALLPAPER_FIT_CSS[fit];
  return {
    "--wall-size": css.size,
    "--wall-repeat": css.repeat,
    "--wall-position": css.position,
  };
}

/** U1/U2 overrides `themeVariables` falls through to instead of the preset accent/wallpaper. */
export interface ThemeVariableOverrides {
  /** A user-picked accent hex (U2); `null`/absent falls through to the preset accent. */
  customAccentHex?: string | null;
  /**
   * A resolved URL for a custom wallpaper image (U1) — an object URL or an
   * inline `data:` URL, whatever `wallpaperBlobUrl.ts` last resolved for the
   * active theme. `null`/absent falls through to the preset gradient.
   */
  customWallpaperUrl?: string | null;
  /** How the custom wallpaper image is sized/positioned; ignored unless `customWallpaperUrl` is set. */
  wallpaperFit?: WallpaperFit;
}

/**
 * Compute the CSS custom properties that a given accent + wallpaper +
 * resolved theme should override. Returns a plain map so the caller can
 * write them onto the document root (inline vars win over the static
 * defaults in global.css). `overrides` layers U1's custom wallpaper image
 * and U2's custom accent color on top of the preset — same "falls through
 * to a custom override when set" shape for both.
 */
export function themeVariables(
  accent: AccentPreset,
  wallpaper: WallpaperPreset,
  theme: ResolvedTheme,
  overrides: ThemeVariableOverrides = {},
): Record<string, string> {
  const tone = accent[theme];
  const wall = wallpaper[theme];

  const customAccentHex = overrides.customAccentHex ?? null;
  const derived = customAccentHex ? deriveAccentTone(customAccentHex) : null;

  const vars: Record<string, string> = {
    "--accent": customAccentHex ?? tone.accent,
    "--accent-2": derived ? derived.accent2 : tone.accent2,
    "--ctl1": derived ? derived.controls.close : accent.controls.close,
    "--ctl2": derived ? derived.controls.minimize : accent.controls.minimize,
    "--ctl3": derived ? derived.controls.zoom : accent.controls.zoom,
  };

  if (overrides.customWallpaperUrl) {
    Object.assign(
      vars,
      {
        "--wall": `url("${overrides.customWallpaperUrl}")`,
        "--wsh1": wall.wsh1,
        "--wsh2": wall.wsh2,
      },
      wallpaperFitVars(overrides.wallpaperFit ?? "fill"),
    );
  }
  else {
    vars["--wall"] = wall.wall;
    vars["--wsh1"] = wall.wsh1;
    vars["--wsh2"] = wall.wsh2;
  }

  return vars;
}
