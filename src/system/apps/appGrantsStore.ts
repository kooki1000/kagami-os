import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Step 17 (D8.5) — what a user actually approved for each installed
 * third-party app, keyed by manifest id. Deliberately separate from
 * `AppBundleManifest.capabilities` (the app's own unreviewed wishlist,
 * written once into `/Apps/<id>/manifest.json` at install time and never
 * consulted for authorization again): this store is the single place a
 * grant is written, and it's written only by `commitInstall` after the
 * consent screen's "Install" click, or narrowed later by D8.7's
 * revocation UI. `loadInstalledApps.ts`/`installedAppManifest.ts` read
 * from here, not from the manifest, when building the capabilities a
 * running app's `SandboxContext` actually carries — an installed bundle
 * with no record here (e.g. one dropped into `/Apps` by hand rather than
 * through this flow) resolves to zero capabilities, fail-closed, same as
 * every other ungranted case in `sandbox/capabilities.ts`.
 *
 * Persisted to localStorage like `dockStore`/`settingsStore` — this is
 * shell configuration, not VFS user data, so it doesn't live in `/Apps`
 * alongside the bundle itself.
 */
interface AppGrantsStore {
  grants: Record<string, string[]>;
  setGrantedCapabilities: (appId: string, capabilities: string[]) => void;
  clearGrant: (appId: string) => void;
}

export const useAppGrantsStore = create<AppGrantsStore>()(
  persist(
    set => ({
      grants: {},
      setGrantedCapabilities: (appId, capabilities) =>
        set(state => ({ grants: { ...state.grants, [appId]: capabilities } })),
      clearGrant: appId =>
        set((state) => {
          const { [appId]: _removed, ...rest } = state.grants;
          return { grants: rest };
        }),
    }),
    { name: "kagami-app-grants", version: 1 },
  ),
);

/** What `appId` is currently granted — `[]` if it was never installed through the consent flow. */
export function getGrantedCapabilities(appId: string): string[] {
  return useAppGrantsStore.getState().grants[appId] ?? [];
}

/** Records what the user approved for `appId` — called once, by `commitInstall` after the consent screen's "Install" click. */
export function setGrantedCapabilities(appId: string, capabilities: string[]): void {
  useAppGrantsStore.getState().setGrantedCapabilities(appId, capabilities);
}
