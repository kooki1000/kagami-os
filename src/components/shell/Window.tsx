import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { OsWindow, WindowRect } from "@/system/windows/windowStore";
import { memo, Suspense, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { getApp } from "@/system/apps/registry";
import { useReducedMotion } from "@/system/theme/useReducedMotion";
import { TITLE_BAR_HEIGHT, useWindowStore, zoneForPointer } from "@/system/windows/windowStore";
import { WindowErrorBoundary } from "./WindowErrorBoundary";

/** No-op: the trap only wraps Tab here, so there's nothing for Escape to close. */
function noop(): void {}

const MINIMIZE_MS = 240;
const ENTER_MS = 180;
// Kept above 0ms even under "reduce motion" — some code paths/assistive
// tech treat a 0ms transition as never having fired, and this still has to
// outrun the fly-to-dock setTimeout below to avoid an apparent hang.
const REDUCED_MOTION_MS = 20;

/** Pointer capture can throw for already-released or synthetic pointers. */
function capturePointer(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  }
  catch {
    /* drag still works for mouse input without capture */
  }
}

function releasePointer(el: Element, pointerId: number) {
  try {
    el.releasePointerCapture(pointerId);
  }
  catch {
    /* already released */
  }
}

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const RESIZE_HANDLES: Array<{ edge: Edge; className: string; cursor: string }> = [
  { edge: "n", className: "top-0 left-3 right-3 h-1.5", cursor: "ns-resize" },
  { edge: "s", className: "bottom-0 left-3 right-3 h-1.5", cursor: "ns-resize" },
  { edge: "e", className: "right-0 top-3 bottom-3 w-1.5", cursor: "ew-resize" },
  { edge: "w", className: "left-0 top-3 bottom-3 w-1.5", cursor: "ew-resize" },
  { edge: "ne", className: "top-0 right-0 size-3", cursor: "nesw-resize" },
  { edge: "nw", className: "top-0 left-0 size-3", cursor: "nwse-resize" },
  { edge: "se", className: "bottom-0 right-0 size-3", cursor: "nwse-resize" },
  { edge: "sw", className: "bottom-0 left-0 size-3", cursor: "nesw-resize" },
];

const CONTROLS = [
  { kind: "close", accent: "var(--ctl1)", glyph: "✕" },
  { kind: "minimize", accent: "var(--ctl2)", glyph: "–" },
  { kind: "zoom", accent: "var(--ctl3)", glyph: "⤢" },
] as const;

interface DragState {
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  edge: Edge;
  startRect: WindowRect;
  startX: number;
  startY: number;
}

/** Where should a window fly when it minimizes? Its dock tile, or bottom center. */
function dockTarget(appId: string): { x: number; y: number } {
  const tile = document.querySelector(`[data-dock-app="${appId}"]`);
  if (tile) {
    const r = tile.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight };
}

// Memoized so dragging/resizing one window doesn't re-render every other
// open window — moveWindow/resizeWindow leave untouched windows' `win`
// object references untouched, so this only re-renders on real changes.
export const Window = memo(({ win, focused }: { win: OsWindow; focused: boolean }) => {
  const app = getApp(win.appId);
  const focusWindow = useWindowStore(s => s.focusWindow);
  const moveWindow = useWindowStore(s => s.moveWindow);
  const resizeWindow = useWindowStore(s => s.resizeWindow);
  const closeWindow = useWindowStore(s => s.closeWindow);
  const minimizeWindow = useWindowStore(s => s.minimizeWindow);
  const toggleMaximize = useWindowStore(s => s.toggleMaximize);
  const snapWindow = useWindowStore(s => s.snapWindow);
  const restoreToRect = useWindowStore(s => s.restoreToRect);
  const setSnapPreview = useWindowStore(s => s.setSnapPreview);
  const reducedMotion = useReducedMotion();
  const minimizeMs = reducedMotion ? REDUCED_MOTION_MS : MINIMIZE_MS;
  const enterMs = reducedMotion ? REDUCED_MOTION_MS : ENTER_MS;

  // Tab stays within the focused window's own controls instead of leaking
  // into a background window or the browser chrome — no auto-focus/restore
  // (a click should focus whatever was clicked) and no Escape-close (that's
  // the window's own content's to handle).
  const trapRef = useFocusTrap<HTMLDivElement>({
    active: focused,
    onClose: noop,
    trapFocus: true,
    autoFocus: false,
    closeOnEscape: false,
  });

  const dragStateRef = useRef<DragState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  // Latest rect, readable synchronously inside pointer handlers.
  const rectRef = useRef(win.rect);
  rectRef.current = win.rect;

  const [entered, setEntered] = useState(false);
  const [minimizeStyle, setMinimizeStyle] = useState<CSSProperties | null>(null);
  const minimizeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Else closing mid-minimize leaves the fly-to-dock timer to fire against an
  // unmounted component and a window id the store no longer has.
  useEffect(() => () => {
    if (minimizeTimerRef.current !== null)
      window.clearTimeout(minimizeTimerRef.current);
  }, []);

  if (!app)
    return null;

  const AppComponent = app.component;

  /* ---- title bar drag ---- */

  function onTitlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0)
      return;
    if ((e.target as HTMLElement).closest("[data-window-control]"))
      return;
    let rect = rectRef.current;
    if (win.mode !== "normal") {
      // Dragging a maximized/snapped window peels it back to its normal
      // size, keeping the cursor at the same relative title-bar position.
      const restored = win.restoreRect ?? {
        ...rect,
        width: app!.defaultSize.width,
        height: app!.defaultSize.height,
      };
      const ratio = (e.clientX - rect.x) / rect.width;
      rect = {
        x: e.clientX - restored.width * ratio,
        y: rect.y,
        width: restored.width,
        height: restored.height,
      };
      restoreToRect(win.id, rect);
      rectRef.current = rect;
    }
    dragStateRef.current = {
      offsetX: e.clientX - rect.x,
      offsetY: e.clientY - rect.y,
    };
    capturePointer(e.currentTarget, e.pointerId);
  }

  function onTitlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag)
      return;
    moveWindow(win.id, e.clientX - drag.offsetX, e.clientY - drag.offsetY);
    setSnapPreview(zoneForPointer(e.clientX, e.clientY, useWindowStore.getState().viewport));
  }

  function onTitlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStateRef.current)
      return;
    dragStateRef.current = null;
    releasePointer(e.currentTarget, e.pointerId);
    const zone = useWindowStore.getState().snapPreview;
    if (zone)
      snapWindow(win.id, zone);
    setSnapPreview(null);
  }

  // pointercancel fires *instead of* pointerup when the browser takes the
  // gesture over; without this the drag stays armed and a cancel near an edge
  // strands the snap highlight. Aborts rather than committing the snap.
  function onTitlePointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStateRef.current)
      return;
    dragStateRef.current = null;
    releasePointer(e.currentTarget, e.pointerId);
    setSnapPreview(null);
  }

  /* ---- edge/corner resize ---- */

  function onResizePointerDown(edge: Edge) {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || win.mode === "maximized")
        return;
      e.stopPropagation();
      resizeStateRef.current = {
        edge,
        startRect: rectRef.current,
        startX: e.clientX,
        startY: e.clientY,
      };
      capturePointer(e.currentTarget, e.pointerId);
    };
  }

  function onResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const rs = resizeStateRef.current;
    if (!rs)
      return;
    const dx = e.clientX - rs.startX;
    const dy = e.clientY - rs.startY;
    const r = { ...rs.startRect };
    if (rs.edge.includes("e"))
      r.width += dx;
    if (rs.edge.includes("s"))
      r.height += dy;
    if (rs.edge.includes("w")) {
      r.width -= dx;
      r.x += dx;
    }
    if (rs.edge.includes("n")) {
      r.height -= dy;
      r.y += dy;
    }
    resizeWindow(win.id, r);
  }

  function onResizePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    resizeStateRef.current = null;
    releasePointer(e.currentTarget, e.pointerId);
  }

  /* ---- window controls ---- */

  function onControl(kind: (typeof CONTROLS)[number]["kind"]) {
    if (kind === "close") {
      closeWindow(win.id);
    }
    else if (kind === "zoom") {
      toggleMaximize(win.id);
    }
    else {
      // Fly toward the dock tile, then actually minimize in the store.
      // Ignore a second click while one flight is already in progress.
      if (minimizeTimerRef.current !== null)
        return;
      const rect = rectRef.current;
      const target = dockTarget(win.appId);
      setMinimizeStyle({
        transform: `translate(${target.x - (rect.x + rect.width / 2)}px, ${
          target.y - (rect.y + rect.height / 2)
        }px) scale(0.08)`,
        opacity: 0,
      });
      minimizeTimerRef.current = window.setTimeout(() => {
        minimizeTimerRef.current = null;
        setMinimizeStyle(null);
        minimizeWindow(win.id);
      }, minimizeMs);
    }
  }

  // Only transform/opacity are ever transitioned (enter + minimize
  // animations); left/top/width/height stay instant so dragging and
  // resizing never lag behind the pointer.
  const style: CSSProperties = {
    left: win.rect.x,
    top: win.rect.y,
    width: win.rect.width,
    height: win.rect.height,
    zIndex: win.zIndex,
    boxShadow: focused ? "var(--shadow-window-focus)" : "var(--shadow-window)",
    transition: minimizeStyle
      ? `transform ${minimizeMs}ms cubic-bezier(.4,0,.7,1), opacity ${minimizeMs}ms ease-in`
      : `transform ${enterMs}ms ease-out, opacity ${enterMs}ms ease-out`,
    ...(minimizeStyle ?? (entered ? {} : { transform: "scale(0.96)", opacity: 0 })),
  };

  return (
    <div
      ref={trapRef}
      className={`pointer-events-auto absolute flex flex-col overflow-hidden rounded-window bg-surface hairline ${
        focused ? "" : "saturate-[.85]"
      }`}
      style={style}
      data-window-id={win.id}
      data-window-focused={focused}
      onPointerDownCapture={() => focusWindow(win.id)}
    >
      <div
        className={`relative flex flex-none touch-none items-center bg-surface px-3.75 select-none hairline-b ${
          focused ? "titlebar-focused" : ""
        }`}
        style={{ height: TITLE_BAR_HEIGHT }}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onPointerCancel={onTitlePointerCancel}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-window-control]"))
            return;
          toggleMaximize(win.id);
        }}
      >
        <div className="z-2 flex gap-2.25 win-controls" data-window-control>
          {CONTROLS.map(c => (
            <button
              key={c.kind}
              type="button"
              className="win-dot"
              style={{ "--dot-accent": c.accent } as CSSProperties}
              aria-label={`${c.kind} window`}
              onClick={() => onControl(c.kind)}
            >
              <span>{c.glyph}</span>
            </button>
          ))}
        </div>
        <div
          data-window-title
          className={`pointer-events-none absolute inset-x-0 text-center text-[13px] font-semibold ${
            focused ? "text-ink" : "text-ink-2"
          }`}
        >
          {win.title}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Suspense
          fallback={(
            <div className="grid h-full place-items-center">
              <span className="size-2.5 animate-pulse rounded-full bg-accent" />
            </div>
          )}
        >
          <WindowErrorBoundary appName={app.name} onClose={() => closeWindow(win.id)}>
            <AppComponent windowId={win.id} focused={focused} payload={win.payload} />
          </WindowErrorBoundary>
        </Suspense>
      </div>

      {win.mode !== "maximized"
        && RESIZE_HANDLES.map(h => (
          <div
            key={h.edge}
            className={`absolute touch-none ${h.className}`}
            style={{ cursor: h.cursor }}
            onPointerDown={onResizePointerDown(h.edge)}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
          />
        ))}
    </div>
  );
});
Window.displayName = "Window";
