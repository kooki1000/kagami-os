/**
 * Kagami OS design tokens — "Lagoon" direction.
 *
 * Source of truth: the KagamiOS.html prototype token sheet
 * ("Design tokens — Lagoon"). The CSS custom properties in
 * src/styles/global.css carry the live values; this module mirrors
 * them as data for anything that needs tokens programmatically
 * (Settings app, dock tile gradients, tests).
 */

export const lagoon = {
  light: {
    accent: "#0f9b8e",
    accent2: "#f2765b",
    surface: "#faf8f4",
    surface2: "#efece4",
    text: "#2b2925",
    text2: "#75706a",
    border: "rgba(30,25,18,.10)",
  },
  dark: {
    accent: "#2fb9ab",
    accent2: "#ff8368",
    surface: "#201e1a",
    surface2: "#2a2823",
    text: "#efece5",
    text2: "#9c968b",
    border: "rgba(255,251,244,.10)",
  },
  controls: {
    close: "#f2765b",
    minimize: "#17b0a1",
    zoom: "#0c8074",
  },
} as const;

export const radius = {
  window: 14,
  dockTile: 13,
  button: 7,
  control: 12, // window control dot diameter (circular)
} as const;

export const sizing = {
  menuBarHeight: 30,
  titleBarHeight: 40,
  dockHeight: 64,
  dockIcon: 46,
} as const;

/** Type scale — Inter. [px, weight] */
export const typeScale = {
  display: [28, 700],
  title: [20, 600],
  bodyLarge: [15, 500],
  body: [13, 400],
  caption: [11, 500],
} as const;

export const shadows = {
  window: "0 8px 22px -8px rgba(0,0,0,.32)",
  windowFocus: "0 30px 65px -18px rgba(0,0,0,.5),0 6px 18px -8px rgba(0,0,0,.3)",
  deep: "0 22px 55px -16px rgba(28,22,14,.42)",
} as const;
