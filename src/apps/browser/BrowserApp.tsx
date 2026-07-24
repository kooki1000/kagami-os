import type { AppWindowProps } from "@/system/apps/types";
import { Globe, RotateCw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isOverlayOpen, subscribeOverlayOpen } from "@/system/overlay/overlayRegistry";
import { isTauri } from "@/system/platform";
import { useWindowStore } from "@/system/windows/windowStore";
import { browserBridge, contentBounds } from "./browserBridge";

const HOME_URL = "https://example.com";

function logBridgeError(action: string): (error: unknown) => void {
  return error => console.error(`[kagami-browser] ${action} failed:`, error);
}

/** The desktop-only chrome + native child webview (N4). */
function NativeBrowser({ windowId, focused }: AppWindowProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(HOME_URL);
  const [addressInput, setAddressInput] = useState(HOME_URL);
  // Drag/resize/snap/maximize all mutate a window's `rect` (a fresh object
  // only when geometry actually changes — see windowStore.ts) — a cheap,
  // exact signal for "re-measure the content area," no ResizeObserver needed.
  const rect = useWindowStore(s => s.windows.find(w => w.id === windowId)?.rect);
  const overlayOpen = useSyncExternalStore(subscribeOverlayOpen, isOverlayOpen);
  const visible = focused && !overlayOpen;
  const initialVisibleRef = useRef(visible);

  // One child webview per Browser window instance, created with its
  // mount-time bounds/visibility already baked in so the sync effects below
  // only need to handle *changes*, not mount. Closed on unmount, which
  // covers both closing the window and minimizing it (WindowLayer unmounts
  // minimized windows rather than just hiding them). Opens with HOME_URL
  // (not the `url` state) so this only depends on `windowId` and runs
  // exactly once per window instance; later navigation goes through the
  // `navigate` command instead of recreating the webview.
  useEffect(() => {
    const el = contentRef.current;
    if (!el)
      return;
    browserBridge.open(windowId, HOME_URL, contentBounds(el), initialVisibleRef.current).catch(logBridgeError("open"));
    return () => {
      browserBridge.close(windowId).catch(logBridgeError("close"));
    };
  }, [windowId]);

  // Skip each sync effect's first run — `open()` above already applied the
  // mount-time bounds/visibility, so re-sending them would be a redundant
  // round-trip.
  const boundsMountedRef = useRef(false);
  useEffect(() => {
    if (!boundsMountedRef.current) {
      boundsMountedRef.current = true;
      return;
    }
    const el = contentRef.current;
    if (!el)
      return;
    browserBridge.setBounds(windowId, contentBounds(el)).catch(logBridgeError("set_bounds"));
  }, [windowId, rect]);

  const visibleMountedRef = useRef(false);
  useEffect(() => {
    if (!visibleMountedRef.current) {
      visibleMountedRef.current = true;
      return;
    }
    browserBridge.setVisible(windowId, visible).catch(logBridgeError("set_visible"));
  }, [windowId, visible]);

  function go(nextUrl: string): void {
    setUrl(nextUrl);
    setAddressInput(nextUrl);
    browserBridge.navigate(windowId, nextUrl).catch(logBridgeError("navigate"));
  }

  return (
    <div className="flex h-full flex-col">
      <form
        className="flex h-[40px] flex-none items-center gap-2 px-3 hairline-b"
        onSubmit={(e) => {
          e.preventDefault();
          go(addressInput);
        }}
      >
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
      {/* The native child webview is layered over this element by the Rust
          side; it renders nothing itself. */}
      <div ref={contentRef} className="min-h-0 flex-1" />
    </div>
  );
}

/** Shown on the web build — native-only, per DIRECTION.md's "present a clean unavailable state" rule. */
function UnavailableOnWeb() {
  return (
    <div className="grid h-full place-items-center px-6 text-center text-ink-2 select-none">
      <div className="flex flex-col items-center gap-2">
        <Globe className="size-7" strokeWidth={1.4} />
        <span className="text-[13px]">Browser is available in the desktop app</span>
        <span className="max-w-[280px] text-[11.5px] opacity-70">
          Third-party sites can't be embedded in a browser tab — install the
          Kagami desktop app for a real built-in browser.
        </span>
      </div>
    </div>
  );
}

export default function BrowserApp(props: AppWindowProps) {
  return isTauri() ? <NativeBrowser {...props} /> : <UnavailableOnWeb />;
}
