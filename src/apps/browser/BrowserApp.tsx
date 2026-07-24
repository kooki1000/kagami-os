import type { ReactNode } from "react";
import type { BrowserBounds } from "./browserBridge";
import type { AppWindowProps } from "@/system/apps/types";
import type { WindowRect } from "@/system/windows/windowStore";
import { ChevronLeft, ChevronRight, Globe, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isOverlayOpen, subscribeOverlayOpen } from "@/system/overlay/overlayRegistry";
import { isTauri } from "@/system/platform";
import { TITLE_BAR_HEIGHT, useWindowStore } from "@/system/windows/windowStore";
import { browserBridge, onNavChanged } from "./browserBridge";
import { applyNavigation, canGoBack, canGoForward, initialHistory } from "./browserHistory";

const HOME_URL = "https://example.com";

// Address bar height. Kept as a constant (applied to the <form> via inline
// style below) so it and the bounds math can't drift apart.
const ADDRESS_BAR_HEIGHT = 40;
// Everything stacked above the content region: the window's title bar plus
// this app's address bar.
const CHROME_HEIGHT = TITLE_BAR_HEIGHT + ADDRESS_BAR_HEIGHT;

function logBridgeError(action: string): (error: unknown) => void {
  return error => console.error(`[kagami-browser] ${action} failed:`, error);
}

/**
 * Bare host for the address, for the standby state below. Falls back to the
 * raw string for anything that isn't a parseable absolute URL.
 */
function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname || rawUrl;
  }
  catch {
    return rawUrl;
  }
}

/**
 * Content-region bounds for the native child webview, derived from the
 * window's `rect` — the store's untransformed logical geometry.
 *
 * We deliberately do *not* read `getBoundingClientRect()` off the content
 * element: while a window's open/minimize animation runs it carries a CSS
 * `transform: scale()`, which `getBoundingClientRect()` folds into its result.
 * Measuring mid-animation would place the webview at scaled bounds (address
 * bar covered, a strip of dead space at the bottom), and nothing re-measures
 * once the transform settles. `rect` is transform-immune and is already the
 * exact re-sync signal (drag/resize/snap/maximize all mutate it).
 */
function webviewBounds(rect: WindowRect): BrowserBounds {
  return {
    x: rect.x,
    y: rect.y + CHROME_HEIGHT,
    width: rect.width,
    height: rect.height - CHROME_HEIGHT,
  };
}

/** The desktop-only chrome + native child webview (N4). */
function NativeBrowser({ windowId, focused }: AppWindowProps) {
  // `history` is rebuilt from the webview's own `nav-changed` events (see
  // browserHistory.ts) rather than tracked optimistically from `go()`.
  const [history, setHistory] = useState(() => initialHistory(HOME_URL));
  const url = history.entries[history.index];
  // Parsed per navigation, not per render — `rect` re-renders this on every
  // drag/resize frame, and the standby host line rarely changes.
  const host = useMemo(() => hostnameOf(url), [url]);
  const [addressInput, setAddressInput] = useState(url);
  const setWindowTitle = useWindowStore(s => s.setWindowTitle);
  // Drag/resize/snap/maximize all mutate a window's `rect` (a fresh object
  // only when geometry actually changes — see windowStore.ts), so it's the
  // exact signal for re-syncing the webview's bounds — no ResizeObserver
  // needed. `webviewBounds` derives the child-webview rect from it directly.
  const rect = useWindowStore(s => s.windows.find(w => w.id === windowId)?.rect);
  const overlayOpen = useSyncExternalStore(subscribeOverlayOpen, isOverlayOpen);
  const visible = focused && !overlayOpen;
  // Latest visibility, readable from the open effect without depending on it.
  // Kept fresh by a deps-less effect (runs every commit, before the effects
  // below it in declaration order) rather than a render-time write, which
  // react-hooks/refs forbids.
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  });

  // A real navigation snaps the address bar to the new URL, discarding any
  // mid-edit — adjusted during render (React's pattern for state derived
  // from other state) since an effect here trips react-hooks/set-state-in-effect.
  const [syncedUrl, setSyncedUrl] = useState(url);
  if (syncedUrl !== url) {
    setSyncedUrl(url);
    setAddressInput(url);
  }

  useEffect(() => {
    return onNavChanged(({ id, url: navUrl, title }) => {
      if (id !== windowId)
        return;
      setHistory(h => applyNavigation(h, navUrl));
      setWindowTitle(windowId, title || navUrl);
    });
  }, [windowId, setWindowTitle]);

  // One child webview per Browser window instance, created with its
  // mount-time bounds/visibility already baked in so the sync effects below
  // only need to handle *changes*, not mount. Closed on unmount, which
  // covers both closing the window and minimizing it (WindowLayer unmounts
  // minimized windows rather than just hiding them). Opens with HOME_URL
  // (not the `url` state) so this only depends on `windowId` and runs
  // exactly once per window instance; later navigation goes through the
  // `navigate` command instead of recreating the webview.
  useEffect(() => {
    // Read the current rect straight from the store rather than depending on
    // it, so this stays a once-per-window-instance open (later geometry
    // changes are the bounds-sync effect's job).
    const openRect = useWindowStore.getState().windows.find(w => w.id === windowId)?.rect;
    if (!openRect)
      return;
    browserBridge.open(windowId, HOME_URL, webviewBounds(openRect), visibleRef.current).catch(logBridgeError("open"));
    return () => {
      browserBridge.close(windowId).catch(logBridgeError("close"));
    };
  }, [windowId]);

  // Both sync effects re-send on every run, including the first. The mount-time
  // send duplicates what open() applied, but both commands are idempotent, and
  // this avoids dropping a change that lands between the open render and the
  // effect's first run — during session restore that left a stale webview
  // visible over whichever window ended up focused.
  useEffect(() => {
    if (!rect)
      return;
    browserBridge.setBounds(windowId, webviewBounds(rect)).catch(logBridgeError("set_bounds"));
  }, [windowId, rect]);

  useEffect(() => {
    browserBridge.setVisible(windowId, visible).catch(logBridgeError("set_visible"));
  }, [windowId, visible]);

  function go(nextUrl: string): void {
    setAddressInput(nextUrl);
    browserBridge.navigate(windowId, nextUrl).catch(logBridgeError("navigate"));
  }

  return (
    <div className="flex h-full flex-col">
      <form
        className="flex flex-none items-center gap-2 px-3 hairline-b"
        style={{ height: ADDRESS_BAR_HEIGHT }}
        onSubmit={(e) => {
          e.preventDefault();
          go(addressInput);
        }}
      >
        <button
          type="button"
          aria-label="Back"
          disabled={!canGoBack(history)}
          className="grid size-6 flex-none place-items-center rounded-[6px] hover:bg-ph disabled:opacity-30"
          onClick={() => browserBridge.back(windowId).catch(logBridgeError("back"))}
        >
          <ChevronLeft className="size-3.5 opacity-70" />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={!canGoForward(history)}
          className="grid size-6 flex-none place-items-center rounded-[6px] hover:bg-ph disabled:opacity-30"
          onClick={() => browserBridge.forward(windowId).catch(logBridgeError("forward"))}
        >
          <ChevronRight className="size-3.5 opacity-70" />
        </button>
        <button
          type="button"
          aria-label="Reload"
          className="grid size-6 flex-none place-items-center rounded-[6px] hover:bg-ph"
          onClick={() => go(url)}
        >
          <RotateCw className="size-3.5 opacity-70" />
        </button>
        <input
          value={addressInput}
          onChange={e => setAddressInput(e.target.value)}
          placeholder="Enter an address"
          className="min-w-0 flex-1 rounded-btn bg-ph px-2.5 py-1 text-[12px] text-ink outline-none placeholder:text-ink-2"
        />
      </form>
      {/* The native child webview is layered over this region by the Rust
          side while the window is focused. The OS webview paints on top, so
          this standby state shows through only while it's hidden (window in
          the background, or a shell overlay open) — no black gap, and a cue
          that the page is paused rather than broken. */}
      <BrowserEmptyState className="min-h-0 flex-1">
        <Globe className="size-7 opacity-80" strokeWidth={1.4} />
        <span className="font-mono text-[13px] text-ink">{host}</span>
        <span className="text-[11.5px] opacity-70">Select this window to keep browsing</span>
      </BrowserEmptyState>
    </div>
  );
}

/** Centered icon-over-text shell shared by the standby and web-unavailable states. */
function BrowserEmptyState({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={`grid place-items-center px-6 text-center text-ink-2 select-none ${className}`}>
      <div className="flex flex-col items-center gap-2">{children}</div>
    </div>
  );
}

/** Shown on the web build — native-only, per DIRECTION.md's "present a clean unavailable state" rule. */
function UnavailableOnWeb() {
  return (
    <BrowserEmptyState className="h-full">
      <Globe className="size-7" strokeWidth={1.4} />
      <span className="text-[13px]">Browser is available in the desktop app</span>
      <span className="max-w-[280px] text-[11.5px] opacity-70">
        Third-party sites can't be embedded in a browser tab — install the
        Kagami desktop app for a real built-in browser.
      </span>
    </BrowserEmptyState>
  );
}

export default function BrowserApp(props: AppWindowProps) {
  return isTauri() ? <NativeBrowser {...props} /> : <UnavailableOnWeb />;
}
