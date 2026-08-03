import type { ReactNode } from "react";
import type { BrowserBounds } from "./browserBridge";
import type { BrowserPayload } from "./browserPayload";
import type { ConnectionSecurity } from "./browserUrl";
import type { AppWindowProps } from "@/system/apps/types";
import type { WindowRect } from "@/system/windows/windowStore";
import { ChevronLeft, ChevronRight, Globe, House, Lock, RotateCw, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isOverlayOpen, subscribeOverlayOpen } from "@/system/overlay/overlayRegistry";
import { isTauri } from "@/system/platform";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { TITLE_BAR_HEIGHT, useWindowStore } from "@/system/windows/windowStore";
import { browserBridge, onLoadState, onNavChanged } from "./browserBridge";
import { applyNavigation, canGoBack, canGoForward, initialHistory } from "./browserHistory";
import { payloadUrl } from "./browserPayload";
import { connectionSecurity, hostnameOf, normalizeAddress } from "./browserUrl";
import { searchEngineById } from "./searchEngines";

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
function NativeBrowser({ windowId, focused, payload }: AppWindowProps) {
  // The chosen search engine doubles as the homepage (U17) — a new window
  // opens on it, and the Home button goes back to it.
  const engine = searchEngineById(useSettingsStore(s => s.browserSearchEngineId));
  // `history` is rebuilt from the webview's own `nav-changed` events (see
  // browserHistory.ts) rather than tracked optimistically from `go()`. It
  // starts on the page a restored session (C1) left this window on, or the
  // homepage for a fresh one.
  const [history, setHistory] = useState(() => initialHistory(payloadUrl(payload) ?? engine.homeUrl));
  const url = history.entries[history.index];
  // Parsed per navigation, not per render — `rect` re-renders this on every
  // drag/resize frame, and neither line changes anywhere near that often.
  const host = useMemo(() => hostnameOf(url), [url]);
  const security = useMemo(() => connectionSecurity(url), [url]);
  const [addressInput, setAddressInput] = useState(url);
  const [loading, setLoading] = useState(false);
  const setWindowTitle = useWindowStore(s => s.setWindowTitle);
  const setWindowPayload = useWindowStore(s => s.setWindowPayload);
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
      // The window payload is the only place this URL outlives the child
      // webview, and it's what session restore serializes. Writing it here
      // (rather than in `go`) also captures navigation the app never asked
      // for — a link click, a redirect. Replacing `payload` leaves `rect`'s
      // identity alone, so the bounds-sync effect below doesn't re-fire.
      setWindowPayload(windowId, { url: navUrl } satisfies BrowserPayload);
    });
  }, [windowId, setWindowTitle, setWindowPayload]);

  // Loading is driven purely by the webview's own page-load edges rather than
  // set optimistically when we ask it to navigate: a request that never starts
  // a load (a same-document fragment jump) would otherwise leave the spinner
  // running with nothing left to clear it.
  useEffect(() => {
    return onLoadState(({ id, loading: isLoading }) => {
      if (id === windowId)
        setLoading(isLoading);
    });
  }, [windowId]);

  // One child webview per Browser window instance, created with its
  // mount-time bounds/visibility already baked in so the sync effects below
  // only need to handle *changes*, not mount. Closed on unmount, which
  // covers both closing the window and minimizing it (WindowLayer unmounts
  // minimized windows rather than just hiding them). Every value it opens
  // with is read straight from the store rather than taken as a dependency,
  // so this stays exactly one open per window instance; later navigation goes
  // through the `navigate` command instead of recreating the webview, and
  // later geometry changes are the bounds-sync effect's job.
  useEffect(() => {
    const openWindow = useWindowStore.getState().windows.find(w => w.id === windowId);
    if (!openWindow)
      return;
    const home = searchEngineById(useSettingsStore.getState().browserSearchEngineId).homeUrl;
    const openUrl = payloadUrl(openWindow.payload) ?? home;
    browserBridge.open(windowId, openUrl, webviewBounds(openWindow.rect), visibleRef.current).catch(logBridgeError("open"));
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

  /** Submitting the address bar: anything that isn't an address becomes a search. */
  function submitAddress(): void {
    const target = normalizeAddress(addressInput, engine);
    if (target)
      go(target);
  }

  function stop(): void {
    browserBridge.stop(windowId).catch(logBridgeError("stop"));
    // A stopped load may never reach the `Finished` edge that would otherwise
    // clear this, so the click clears it itself (see browser.rs).
    setLoading(false);
  }

  return (
    <div className="flex h-full flex-col">
      <form
        className="flex flex-none items-center gap-1 px-2.5 text-ink-2 hairline-b"
        style={{ height: ADDRESS_BAR_HEIGHT }}
        onSubmit={(e) => {
          e.preventDefault();
          submitAddress();
        }}
      >
        <ToolbarButton
          label="Back"
          disabled={!canGoBack(history)}
          onClick={() => browserBridge.back(windowId).catch(logBridgeError("back"))}
        >
          <ChevronLeft className="size-[calc(15px*var(--ui-scale))]" />
        </ToolbarButton>
        <ToolbarButton
          label="Forward"
          disabled={!canGoForward(history)}
          onClick={() => browserBridge.forward(windowId).catch(logBridgeError("forward"))}
        >
          <ChevronRight className="size-[calc(15px*var(--ui-scale))]" />
        </ToolbarButton>
        {loading
          ? (
              <ToolbarButton label="Stop" onClick={stop}>
                <X className="size-[calc(14px*var(--ui-scale))]" />
              </ToolbarButton>
            )
          : (
              <ToolbarButton label="Reload" onClick={() => go(url)}>
                <RotateCw className="size-[calc(13px*var(--ui-scale))]" />
              </ToolbarButton>
            )}
        <ToolbarButton label={`Home — ${engine.name}`} onClick={() => go(engine.homeUrl)}>
          <House className="size-[calc(14px*var(--ui-scale))]" />
        </ToolbarButton>
        <AddressField
          value={addressInput}
          loading={loading}
          security={security}
          onChange={setAddressInput}
          // Escape abandons a mid-edit and puts the live URL back, so there's
          // a way out of a half-typed address that doesn't involve retyping it.
          onCancel={() => setAddressInput(url)}
        />
      </form>
      {/* The native child webview is layered over this region by the Rust
          side while the window is focused. The OS webview paints on top, so
          this standby state shows through only while it's hidden (window in
          the background, or a shell overlay open) — no black gap, and a cue
          that the page is paused rather than broken. */}
      <BrowserEmptyState className="min-h-0 flex-1">
        <Globe className="size-7 opacity-80" strokeWidth={1.4} />
        <span className="font-mono text-13 text-ink">{host}</span>
        <span className="text-11.5 opacity-70">Select this window to keep browsing</span>
      </BrowserEmptyState>
    </div>
  );
}

/** Square icon button in the prototype's language — the shape Documents' toolbar uses. */
function ToolbarButton({ label, disabled, onClick, children }: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="grid size-6.5 flex-none place-items-center rounded-btn hover:bg-ph hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The address input, with the leading slot every browser puts there: load
 * progress while a page is loading, connection security once it settles.
 */
function AddressField({ value, loading, security, onChange, onCancel }: {
  value: string;
  loading: boolean;
  security: ConnectionSecurity;
  onChange: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-btn bg-ph px-[calc(8px*var(--ui-scale))] focus-within:bg-ph-2">
      <AddressIndicator loading={loading} security={security} />
      <input
        value={value}
        aria-label="Address"
        placeholder="Search or enter an address"
        className="min-w-0 flex-1 bg-transparent py-1 text-12 text-ink outline-none placeholder:text-ink-2"
        onChange={e => onChange(e.target.value)}
        // Clicking into the bar selects the whole address, so replacing it is
        // one keystroke rather than a manual select-all.
        onFocus={e => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onCancel();
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function AddressIndicator({ loading, security }: { loading: boolean; security: ConnectionSecurity }) {
  if (loading) {
    return (
      <span
        role="status"
        aria-label="Loading"
        // motion-safe: the spinner is decorative, and the security icon it
        // replaces already carries the state for anyone who reduces motion.
        className="size-3 flex-none rounded-full border-[1.5px] border-(--accent)/25 border-t-(--accent) motion-safe:animate-spin"
      />
    );
  }
  if (security === "secure")
    return <Lock aria-label="Secure connection" className="size-3 flex-none opacity-55" />;
  if (security === "insecure")
    return <ShieldAlert aria-label="Not secure" className="size-3.5 flex-none text-accent-2" />;
  return <Globe aria-label="" className="size-3.5 flex-none opacity-45" />;
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
      <span className="text-13">Browser is available in the desktop app</span>
      <span className="max-w-[280px] text-11.5 opacity-70">
        Third-party sites can't be embedded in a browser tab — install the
        Kagami desktop app for a real built-in browser.
      </span>
    </BrowserEmptyState>
  );
}

export default function BrowserApp(props: AppWindowProps) {
  return isTauri() ? <NativeBrowser {...props} /> : <UnavailableOnWeb />;
}
