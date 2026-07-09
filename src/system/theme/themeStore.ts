import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

const media
  = typeof window !== "undefined"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function systemTheme(): ResolvedTheme {
  return media?.matches ? "dark" : "light";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "auto" ? systemTheme() : pref;
}

interface ThemeStore {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  toggleResolved: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      preference: "auto",
      resolved: resolveTheme("auto"),
      setPreference: pref => set({ preference: pref, resolved: resolveTheme(pref) }),
      toggleResolved: () => {
        const next: ThemePreference = get().resolved === "dark" ? "light" : "dark";
        set({ preference: next, resolved: next });
      },
    }),
    {
      name: "kagami-theme",
      // Only the preference is durable; `resolved` is recomputed from it
      // (and the live OS setting) on every load.
      partialize: state => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => {
        if (state)
          useThemeStore.setState({ resolved: resolveTheme(state.preference) });
      },
    },
  ),
);

// Track OS-level changes while in auto mode.
media?.addEventListener("change", () => {
  const { preference } = useThemeStore.getState();
  if (preference === "auto") {
    useThemeStore.setState({ resolved: systemTheme() });
  }
});
