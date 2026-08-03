import type { ReactNode } from "react";
import type { BrowserBounds, BrowserDownloadFinished } from "./browserBridge";
import type { BrowserPayload } from "./browserPayload";
import type { Bookmark } from "./browserPrefsStore";
import type { ConnectionSecurity } from "./browserUrl";
import type { AppWindowProps } from "@/system/apps/types";
import type { WindowRect } from "@/system/windows/windowStore";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Globe, House, Lock, RotateCw, Search, ShieldAlert, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { radius } from "@/design/tokens";
import { useAppCommand } from "@/system/appCommands";
import { launchApp } from "@/system/apps/launch";
import { useFsStore } from "@/system/fs/fsStore";
import { DOWNLOADS_ID } from "@/system/fs/types";
import { notify } from "@/system/notifications/notificationStore";
import { isOverlayOpen, subscribeOverlayOpen } from "@/system/overlay/overlayRegistry";
import { isTauri } from "@/system/platform";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { TITLE_BAR_HEIGHT, useWindowStore } from "@/system/windows/windowStore";
import { browserBridge, onDownloadFinished, onDownloadStarted, onFindResult, onLoadState, onNavChanged } from "./browserBridge";
import { applyNavigation, canGoBack, canGoForward, initialHistory } from "./browserHistory";
import { payloadUrl } from "./browserPayload";
import { isBookmarked, useBrowserPrefsStore, zoomForHost } from "./browserPrefsStore";
import { connectionSecurity, hostnameOf, normalizeAddress } from "./browserUrl";
import { isContentOccluded } from "./browserVisibility";
import { DEFAULT_ZOOM, formatZoom, stepZoom } from "./browserZoom";
import { saveDownload } from "./downloads";
import { searchEngineById } from "./searchEngines";

// Chrome-strip heights. Kept as constants (applied via inline style below) so
// they and the bounds math can't drift apart — the native child webview is
// positioned by number, not by layout, so a strip that renders taller than
// this arithmetic says would sit underneath it.
const ADDRESS_BAR_HEIGHT = 40;
const BOOKMARKS_BAR_HEIGHT = 30;
const FIND_BAR_HEIGHT = 34;

/** Everything stacked above the content region, which the webview starts below. */
function chromeHeight({ bookmarksBar, findBar }: { bookmarksBar: boolean; findBar: boolean }): number {
  return TITLE_BAR_HEIGHT
    + ADDRESS_BAR_HEIGHT
    + (bookmarksBar ? BOOKMARKS_BAR_HEIGHT : 0)
    + (findBar ? FIND_BAR_HEIGHT : 0);
}

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
function webviewBounds(rect: WindowRect, chrome: number): BrowserBounds {
  return {
    x: rect.x,
    y: rect.y + chrome,
    width: rect.width,
    height: rect.height - chrome,
  };
}

/**
 * Moves a finished download into the VFS and reports it.
 *
 * Module-level rather than a component closure: it depends on nothing a
 * particular window holds, and keeping it out of the effect avoids a
 * subscription that tears down and re-subscribes on every render.
 */
async function receiveDownload(event: BrowserDownloadFinished): Promise<void> {
  function failed(): void {
    notify({ title: "Download failed", body: event.filename, appId: "browser", tone: "danger" });
  }

  if (!event.success || !event.path) {
    failed();
    return;
  }
  try {
    const node = await saveDownload(event, DOWNLOADS_ID, {
      takeDownload: browserBridge.takeDownload,
      createBlobFile: useFsStore.getState().createBlobFile,
    });
    notify({
      title: "Download saved",
      body: `${node.name} in Downloads`,
      appId: "browser",
      action: {
        label: "Show in Files",
        run: () => launchApp("files", { payload: { folderId: DOWNLOADS_ID } }),
      },
    });
  }
  catch (error) {
    console.error("[kagami-browser] saving download failed:", error);
    failed();
  }
}

/** The desktop-only chrome + native child webview (N4). */
function NativeBrowser({ windowId, payload }: AppWindowProps) {
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
  // The page's own title, kept so a bookmark can be saved under it. The window
  // title carries the same string, but reading it back out of the store to
  // bookmark a page would be a round trip through the shell for our own data.
  const [pageTitle, setPageTitle] = useState("");
  const setWindowTitle = useWindowStore(s => s.setWindowTitle);
  const setWindowPayload = useWindowStore(s => s.setWindowPayload);
  // Drag/resize/snap/maximize all mutate a window's `rect` (a fresh object
  // only when geometry actually changes — see windowStore.ts), so it's the
  // exact signal for re-syncing the webview's bounds — no ResizeObserver
  // needed. `webviewBounds` derives the child-webview rect from it directly.
  const rect = useWindowStore(s => s.windows.find(w => w.id === windowId)?.rect);
  // Zoom is scoped to the host, not the window, so a site stays at the size
  // it was left at across visits and windows (see browserPrefsStore.ts).
  const zoom = useBrowserPrefsStore(s => zoomForHost(s.zoomByHost, host));
  const setZoomForHost = useBrowserPrefsStore(s => s.setZoomForHost);
  const bookmarks = useBrowserPrefsStore(s => s.bookmarks);
  const toggleBookmark = useBrowserPrefsStore(s => s.toggleBookmark);
  const showBookmarksBar = useBrowserPrefsStore(s => s.showBookmarksBar);
  const setShowBookmarksBar = useBrowserPrefsStore(s => s.setShowBookmarksBar);
  const removeBookmark = useBrowserPrefsStore(s => s.removeBookmark);
  const saved = isBookmarked(bookmarks, url);
  // Find state is per window and deliberately not persisted — a find bar left
  // open from a previous session is noise, not a preference.
  const [find, setFind] = useState<{ query: string; missed: boolean } | null>(null);
  const chrome = chromeHeight({ bookmarksBar: showBookmarksBar, findBar: find !== null });
  const overlayOpen = useSyncExternalStore(subscribeOverlayOpen, isOverlayOpen);
  // Whether anything the shell stacks above this window covers the page, which
  // is the real constraint — not whether this window is focused. Selected as a
  // boolean rather than by subscribing to `windows`, so dragging an unrelated
  // window re-renders this one only when the answer actually flips.
  const occluded = useWindowStore(s =>
    !rect || isContentOccluded(webviewBounds(rect, chrome), s.windows, windowId));
  const visible = !occluded && !overlayOpen;
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
      setPageTitle(title);
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

  useEffect(() => {
    return onFindResult(({ id, found }) => {
      if (id === windowId)
        setFind(current => (current ? { ...current, missed: !found } : current));
    });
  }, [windowId]);

  useEffect(() => {
    const unsubscribeStarted = onDownloadStarted(({ id, filename }) => {
      if (id === windowId)
        notify({ title: "Downloading", body: filename, appId: "browser" });
    });
    const unsubscribeFinished = onDownloadFinished((event) => {
      if (event.id === windowId)
        void receiveDownload(event);
    });
    return () => {
      unsubscribeStarted();
      unsubscribeFinished();
    };
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
    const openChrome = chromeHeight({
      bookmarksBar: useBrowserPrefsStore.getState().showBookmarksBar,
      findBar: false,
    });
    browserBridge
      .open(windowId, openUrl, webviewBounds(openWindow.rect, openChrome), visibleRef.current, radius.window)
      .catch(logBridgeError("open"));
    return () => {
      browserBridge.close(windowId).catch(logBridgeError("close"));
    };
  }, [windowId]);

  // Both sync effects re-send on every run, including the first. The mount-time
  // send duplicates what open() applied, but both commands are idempotent, and
  // this avoids dropping a change that lands between the open render and the
  // effect's first run — during session restore that left a stale webview
  // visible over whichever window ended up focused.
  // `chrome` is a dependency because showing or hiding the bookmarks bar moves
  // the content region's top edge without touching the window's own geometry.
  useEffect(() => {
    if (!rect)
      return;
    browserBridge.setBounds(windowId, webviewBounds(rect, chrome)).catch(logBridgeError("set_bounds"));
  }, [windowId, rect, chrome]);

  useEffect(() => {
    browserBridge.setVisible(windowId, visible).catch(logBridgeError("set_visible"));
  }, [windowId, visible]);

  // Runs on open too (the bridge's per-id queue holds it behind `open`), which
  // is what applies a host's remembered zoom to a page loading for the first
  // time in this window.
  useEffect(() => {
    browserBridge.setZoom(windowId, zoom).catch(logBridgeError("set_zoom"));
  }, [windowId, zoom]);

  function go(nextUrl: string): void {
    setAddressInput(nextUrl);
    browserBridge.navigate(windowId, nextUrl).catch(logBridgeError("navigate"));
  }

  useAppCommand(windowId, (command) => {
    switch (command) {
      case "browser.back":
        browserBridge.back(windowId).catch(logBridgeError("back"));
        break;
      case "browser.forward":
        browserBridge.forward(windowId).catch(logBridgeError("forward"));
        break;
      case "browser.reload":
        go(url);
        break;
      case "browser.home":
        go(engine.homeUrl);
        break;
      case "browser.zoomIn":
        setZoomForHost(host, stepZoom(zoom, 1));
        break;
      case "browser.zoomOut":
        setZoomForHost(host, stepZoom(zoom, -1));
        break;
      case "browser.zoomReset":
        setZoomForHost(host, DEFAULT_ZOOM);
        break;
      case "browser.toggleBookmark":
        toggleBookmark({ url, title: pageTitle || host });
        break;
      case "browser.toggleBookmarksBar":
        setShowBookmarksBar(!showBookmarksBar);
        break;
      case "browser.find":
        // Re-opening an already-open bar is a request to search again from
        // the top, so the query survives but the miss state doesn't.
        setFind(current => ({ query: current?.query ?? "", missed: false }));
        break;
    }
  });

  /** One find step. An empty query does nothing rather than matching everything. */
  function runFind(query: string, forward: boolean): void {
    if (!query)
      return;
    browserBridge.find(windowId, query, forward).catch(logBridgeError("find"));
  }

  function closeFind(): void {
    setFind(null);
    browserBridge.clearFind(windowId).catch(logBridgeError("find_clear"));
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
        {zoom !== DEFAULT_ZOOM && (
          <button
            type="button"
            title="Reset zoom to 100%"
            className="ml-1 flex-none rounded-btn bg-ph px-1.5 py-0.5 text-11.5 font-medium text-ink-2 tabular-nums hover:bg-ph-2 hover:text-ink"
            onClick={() => setZoomForHost(host, DEFAULT_ZOOM)}
          >
            {formatZoom(zoom)}
          </button>
        )}
        <ToolbarButton
          label={saved ? "Remove bookmark" : "Bookmark this page"}
          onClick={() => toggleBookmark({ url, title: pageTitle || host })}
        >
          <Star
            className={`size-[calc(14px*var(--ui-scale))] ${saved ? "fill-(--accent-2) text-accent-2" : ""}`}
          />
        </ToolbarButton>
      </form>
      {showBookmarksBar && (
        <BookmarksBar
          bookmarks={bookmarks}
          currentUrl={url}
          onOpen={go}
          onRemove={removeBookmark}
        />
      )}
      {find && (
        <FindBar
          query={find.query}
          missed={find.missed}
          onChange={query => setFind({ query, missed: false })}
          onStep={forward => runFind(find.query, forward)}
          onClose={closeFind}
        />
      )}
      {/* The native child webview is layered over this region by the Rust
          side whenever nothing covers it (see browserVisibility.ts). The OS
          webview paints on top, so this standby state shows through only
          while it's hidden — another window over this one, or a shell overlay
          open — giving a cue that the page is paused rather than broken
          instead of a black gap. */}
      <BrowserEmptyState className="min-h-0 flex-1">
        <Globe className="size-7 opacity-80" strokeWidth={1.4} />
        <span className="font-mono text-13 text-ink">{host}</span>
        <span className="text-11.5 opacity-70">Bring this window forward to keep browsing</span>
      </BrowserEmptyState>
    </div>
  );
}

/**
 * Find-in-page (U17). Shows a bare "Not found" rather than "3 of 12" —
 * `window.find` reports only whether it moved to a match, and counting would
 * mean injecting a highlighter into a page we don't own (see `browser.rs`).
 */
function FindBar({ query, missed, onChange, onStep, onClose }: {
  query: string;
  missed: boolean;
  onChange: (query: string) => void;
  onStep: (forward: boolean) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // The bar mounts on ⌘F, so focusing on mount is what makes the chord land
  // the caret where the user is already typing.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="flex flex-none items-center gap-1.5 px-2.5 text-ink-2 hairline-b"
      style={{ height: FIND_BAR_HEIGHT }}
    >
      <Search className="size-[calc(13px*var(--ui-scale))] flex-none opacity-60" />
      <input
        ref={inputRef}
        value={query}
        aria-label="Find in page"
        placeholder="Find in page"
        className="max-w-[260px] min-w-0 flex-1 rounded-btn bg-ph px-[calc(8px*var(--ui-scale))] py-0.5 text-12 text-ink outline-none placeholder:text-ink-2 focus:bg-ph-2"
        onChange={e => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onStep(!e.shiftKey);
          }
          else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      {missed && query && <span className="flex-none text-11.5 text-accent-2">Not found</span>}
      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarButton label="Find previous" disabled={!query} onClick={() => onStep(false)}>
          <ChevronUp className="size-[calc(14px*var(--ui-scale))]" />
        </ToolbarButton>
        <ToolbarButton label="Find next" disabled={!query} onClick={() => onStep(true)}>
          <ChevronDown className="size-[calc(14px*var(--ui-scale))]" />
        </ToolbarButton>
        <ToolbarButton label="Close find bar" onClick={onClose}>
          <X className="size-[calc(13px*var(--ui-scale))]" />
        </ToolbarButton>
      </div>
    </div>
  );
}

/**
 * The saved-pages strip under the address bar. Off by default: it costs
 * content height, which the child webview pays for directly (see
 * `chromeHeight`), so it appears only once asked for.
 */
function BookmarksBar({ bookmarks, currentUrl, onOpen, onRemove }: {
  bookmarks: Bookmark[];
  currentUrl: string;
  onOpen: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; bookmark: Bookmark } | null>(null);

  return (
    <div
      className="flex flex-none items-center gap-0.5 overflow-x-auto px-2 hairline-b"
      style={{ height: BOOKMARKS_BAR_HEIGHT }}
    >
      {bookmarks.length === 0
        ? (
            <span className="px-1 text-11 text-ink-2 opacity-70 select-none">
              Pages you bookmark with the star appear here
            </span>
          )
        : bookmarks.map(bookmark => (
            <button
              key={bookmark.url}
              type="button"
              title={bookmark.url}
              className={`max-w-[170px] flex-none truncate rounded-btn px-2 py-0.5 text-11.5 transition-colors ${
                bookmark.url === currentUrl
                  ? "bg-ph font-medium text-ink"
                  : "text-ink-2 hover:bg-ph hover:text-ink"
              }`}
              onClick={() => onOpen(bookmark.url)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, bookmark });
              }}
            >
              {bookmark.title}
            </button>
          ))}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          header={menu.bookmark.title}
          entries={[
            { label: "Open", run: () => onOpen(menu.bookmark.url) },
            { label: "Remove Bookmark", danger: true, run: () => onRemove(menu.bookmark.url) },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
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
