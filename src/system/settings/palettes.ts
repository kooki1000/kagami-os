import type { ResolvedTheme } from "@/system/theme/themeStore";

/**
 * Accent + wallpaper presets, transcribed verbatim from the KagamiOS.html
 * prototype's three "directions" (data-t a/b/c). Each direction is a
 * complete, considered palette — accent, accent-2, the monochrome window
 * control triad, and a light/dark wallpaper. We expose them as the
 * user-selectable options rather than inventing partial ones, per the
 * design brief's "do not invent your own palette" guardrail.
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

/**
 * Compute the CSS custom properties that a given accent + wallpaper +
 * resolved theme should override. Returns a plain map so the caller can
 * write them onto the document root (inline vars win over the static
 * defaults in global.css).
 */
export function themeVariables(
  accent: AccentPreset,
  wallpaper: WallpaperPreset,
  theme: ResolvedTheme,
): Record<string, string> {
  const tone = accent[theme];
  const wall = wallpaper[theme];
  return {
    "--accent": tone.accent,
    "--accent-2": tone.accent2,
    "--ctl1": accent.controls.close,
    "--ctl2": accent.controls.minimize,
    "--ctl3": accent.controls.zoom,
    "--wall": wall.wall,
    "--wsh1": wall.wsh1,
    "--wsh2": wall.wsh2,
  };
}
