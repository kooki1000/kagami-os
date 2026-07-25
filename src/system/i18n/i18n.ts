import i18next from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * i18n scaffolding (H2) — deliberately minimal, per ROADMAP.md's own framing:
 * "scaffold early even if English-only ships." Only `WelcomeApp`'s copy is
 * wired through `useTranslation()` for now, to prove the real call-site
 * convention without a mechanical sweep of every component's JSX. Broader
 * adoption is deferred until a second locale is actually committed to.
 *
 * `lng`/`fallbackLng` are both pinned to `"en"` — there's exactly one
 * resource bundle today, so real language detection (e.g.
 * `i18next-browser-languagedetector`) is future work alongside an actual
 * second locale, not part of this scaffold.
 *
 * Side-effect import: `main.tsx` imports this once, before React renders,
 * so `useTranslation()` has an initialized instance from first render —
 * `resources` are provided inline (no backend), so init completes
 * synchronously and no `<Suspense>` boundary is needed.
 */
void i18next.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  returnNull: false,
  interpolation: { escapeValue: false }, // React already escapes.
  resources: {
    en: {
      translation: {
        welcome: {
          tagline: "A desktop that lives in your browser.",
          instructions: "Drag this window by its title bar, resize it from any edge, "
            + "double-click the title bar to zoom, or drag it against the left "
            + "or right edge of the screen to tile it. Press ⌘W to close a window.",
          overview: "Files, Notes, the image viewer, and a sandboxed Terminal are all "
            + "live — double-click a document or picture in Files to open it. "
            + "Everything is stored in a virtual file system in your browser, "
            + "so it survives refreshes. Tune the accent, wallpaper, theme, "
            + "and dock in Settings.",
          paletteLabel: "Lagoon palette",
        },
      },
    },
  },
});

export default i18next;
