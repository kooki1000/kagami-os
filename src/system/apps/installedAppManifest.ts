import type { InstalledAppBundle } from "./installedApps";
import type { AppManifest, AppWindowProps } from "./types";
import { Puzzle } from "lucide-react";
import { createElement, lazy } from "react";
import { ThirdPartyAppHost } from "./ThirdPartyAppHost";

/**
 * One shared icon and gradient for every installed third-party app — the
 * manifest's own `icon` field is parsed but deliberately unused here.
 * Per-app icon rendering (an emoji? a bundled glyph asset?) is a real design
 * question of its own, not implied by "make the registry dynamic," and is
 * left for whichever later task (the install flow, or the Settings pane)
 * actually needs to answer it.
 */
const THIRD_PARTY_TILE_GRADIENT: [string, string] = ["#8f8f96", "#5c5c63"];

/**
 * Turns one scanned bundle into a real `AppManifest`, the same shape every
 * built-in app registers with. `component` is wrapped in `lazy()` even
 * though there's nothing to code-split — `AppManifest.component`'s type is
 * `LazyExoticComponent`, and `React.lazy` accepts any function returning
 * `Promise<{ default }>`, not only a dynamic `import()` — so an
 * already-resolved promise satisfies the existing type with no change to it
 * or to `Window.tsx`'s `<Suspense>` wrapper.
 */
export function buildInstalledAppManifest(bundle: InstalledAppBundle): AppManifest {
  const { manifest, entryNodeId, dataFolderId } = bundle;
  // The exposed component only ever receives AppWindowProps (that's all
  // Window.tsx passes any app's component) — appId/entryNodeId are closed
  // over here, not supplied by the caller. Capabilities aren't passed at
  // all: ThirdPartyAppHost subscribes to appGrantsStore itself, so a launch
  // and an already-open window both see a Settings revocation (D8.7).
  // manifest.capabilities is never read: what's granted is only ever what
  // appGrantsStore records (see its own doc comment for why the two are
  // kept separate). The private data folder is the one thing every app gets
  // without a grant (`effectiveCapabilities`).
  const component = lazy(() => Promise.resolve({
    default: (props: AppWindowProps) => createElement(ThirdPartyAppHost, {
      ...props,
      appId: manifest.id,
      entryNodeId,
      dataFolderId,
    }),
  }));

  return {
    id: manifest.id,
    name: manifest.name,
    icon: Puzzle,
    tileGradient: THIRD_PARTY_TILE_GRADIENT,
    defaultSize: { width: 480, height: 400 },
    component,
  };
}
