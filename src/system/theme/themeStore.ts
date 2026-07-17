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

interface PersistedThemeState {
  preference: ThemePreference;
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
      // Only the preference is durable; `resolved` is recomputed from it (and
      // the live OS setting) right here in `merge` rather than via a separate
      // `onRehydrateStorage` callback. localStorage reads are synchronous, so
      // persist's rehydration runs synchronously too — a callback that closes
      // over `useThemeStore` to call `.setState()` fires before this
      // module's own `const useThemeStore = ...` assignment has finished,
      // reading it as undefined and throwing (silently, inside persist's
      // promise chain) without ever recomputing `resolved`. `merge` gets the
      // persisted state directly, with no such self-reference.
      partialize: state => ({ preference: state.preference }),
      merge: (persistedState, currentState) => {
        const preference
          = (persistedState as Partial<PersistedThemeState> | undefined)?.preference
            ?? currentState.preference;
        return { ...currentState, preference, resolved: resolveTheme(preference) };
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
