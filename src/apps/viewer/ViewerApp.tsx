import type { AppWindowProps } from "@/system/apps/types";
import type { FsNode } from "@/system/fs/types";
import {
  Copy,
  Expand,
  Image,
  Info,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Shrink,
  SkipBack,
  SkipForward,
  Wallpaper,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { capturePointer, releasePointer } from "@/lib/pointerCapture";
import { useAppCommand } from "@/system/appCommands";
import { usePayloadFileId } from "@/system/apps/filePayload";
import { siblingsOf, stepSibling } from "@/system/apps/siblingNav";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { useBlobUrl } from "@/system/fs/useBlobUrl";
import { notify } from "@/system/notifications/notificationStore";
import { isEditableTarget } from "@/system/shortcuts";
import { useWindowStore } from "@/system/windows/windowStore";
import { resolveFileBytes } from "../files/download";
import { isImageNode } from "../files/fileMeta";
import { buildExifFields } from "./exifInfo";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const BODY_PADDING = 32;
const SLIDESHOW_INTERVAL_MS = 3000;

interface NaturalSize {
  width: number;
  height: number;
}

export default function ViewerApp({ windowId, payload, focused }: AppWindowProps) {
  // Next/Previous move this cursor within the window rather than opening a
  // new one — same shape as Player's identical pattern (D5). Adopting the
  // payload during render (rather than only on mount) is what lets a
  // re-launch from Files re-focus and re-target this window instead of
  // spawning a duplicate (review-backlog #7, fixed here the same way Player
  // already was).
  const [activeId, setActiveId] = usePayloadFileId(payload);
  const nodes = useFsStore(s => s.nodes);
  const node = activeId ? nodes[activeId] : undefined;
  const { url: blobUrl, status: blobStatus } = useBlobUrl(node?.contentRef);
  const src = node?.content ?? blobUrl ?? undefined;
  const setWindowTitle = useWindowStore(s => s.setWindowTitle);

  // Viewer windows are titled after their file; keep the title bar in step
  // when the file is renamed elsewhere (Files, Terminal) while it's open,
  // or when Next/Previous switches images.
  useEffect(() => {
    if (node?.name)
      setWindowTitle(windowId, node.name);
  }, [node?.name, windowId, setWindowTitle]);

  // Every other image in the opened file's folder, in the same order Files
  // lists them — the slideshow's Next/Previous cursor.
  const siblings = useMemo<FsNode[]>(
    () => siblingsOf(nodes, node, isImageNode),
    [nodes, node],
  );

  // Read via a ref rather than a closure so `step` has a stable identity —
  // the slideshow interval and the arrow-key listener below both depend on
  // it, and re-deriving `siblings` on every unrelated fs write (any rename,
  // any Notes autosave) would otherwise tear down and rebuild both.
  const siblingsRef = useRef(siblings);
  useLayoutEffect(() => {
    siblingsRef.current = siblings;
  });
  const step = useCallback((delta: number): void => {
    setActiveId(prev => stepSibling(siblingsRef.current, prev, delta) ?? prev);
  }, [setActiveId]);

  // `playing` can stay stale-true once the folder no longer has enough
  // images to cycle through — nothing renders or acts on it directly, only
  // the derived `slideshowPlaying` below (siblings.length is re-checked
  // wherever that matters), so there's no separate effect to keep it synced.
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || siblings.length <= 1)
      return;
    const id = setInterval(step, SLIDESHOW_INTERVAL_MS, 1);
    return () => clearInterval(id);
  }, [playing, siblings.length, step]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitted, setFitted] = useState(true);
  const [rotation, setRotation] = useState(0);

  // Reset rotation/fit during render when the image changes (React's
  // "adjust state on prop change" recipe, mirroring Notes' payload-identity
  // handling) rather than in an effect, avoiding an extra stale render.
  const [prevActiveId, setPrevActiveId] = useState(activeId);
  if (activeId !== prevActiveId) {
    setPrevActiveId(activeId);
    setRotation(0);
    setFitted(true);
  }

  const sideways = rotation % 180 !== 0;
  const rotatedWidth = natural ? (sideways ? natural.height : natural.width) : 0;
  const rotatedHeight = natural ? (sideways ? natural.width : natural.height) : 0;

  /** Zoom that fits a w×h box into the body (never beyond 100%). */
  function fitZoomFor(width: number, height: number): number {
    const body = bodyRef.current;
    if (!body || !width || !height)
      return 1;
    return Math.min(
      (body.clientWidth - BODY_PADDING) / width,
      (body.clientHeight - BODY_PADDING) / height,
      1,
    );
  }

  // Latest fit inputs for the resize observer, which lives outside renders.
  // Synced in an effect (not during render) so refs stay outside the
  // render phase, per react-hooks/refs.
  const fitStateRef = useRef({ fitted, rotatedWidth, rotatedHeight });
  useLayoutEffect(() => {
    fitStateRef.current = { fitted, rotatedWidth, rotatedHeight };
  });

  useEffect(() => {
    const body = bodyRef.current;
    if (!body)
      return;
    const observer = new ResizeObserver(() => {
      const current = fitStateRef.current;
      if (current.fitted)
        setZoom(fitZoomFor(current.rotatedWidth, current.rotatedHeight));
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  // Stable identity (only ever touches state setters) so the wheel-zoom
  // native listener below can depend on it without reinstalling itself.
  const zoomBy = useCallback((factor: number): void => {
    setFitted(false);
    setZoom(z => Math.min(Math.max(z * factor, MIN_ZOOM), MAX_ZOOM));
  }, []);

  // Trackpad pinch delivers a native `wheel` event with `ctrlKey: true` in
  // every engine — no separate gesture API needed. React attaches its own
  // wheel listener as passive by default, so `preventDefault` there is a
  // silent no-op; a native listener with `{ passive: false }` is required to
  // actually stop the browser's page-zoom.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body)
      return;
    function onWheel(e: WheelEvent): void {
      if (!e.ctrlKey)
        return;
      e.preventDefault();
      zoomBy(1 - e.deltaY * 0.01);
    }
    body.addEventListener("wheel", onWheel, { passive: false });
    return () => body.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  function fit(): void {
    setFitted(true);
    setZoom(fitZoomFor(rotatedWidth, rotatedHeight));
  }

  // Drag-to-pan (only when the image overflows its box): tracked in a ref,
  // not state, so pointermove doesn't re-render on every pixel — `isPanning`
  // is just for the cursor's grab/grabbing affordance.
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  function onBodyPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    const body = bodyRef.current;
    if (!body || e.button !== 0)
      return;
    const overflowing = body.scrollWidth > body.clientWidth || body.scrollHeight > body.clientHeight;
    if (!overflowing)
      return;
    capturePointer(body, e.pointerId);
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: body.scrollLeft,
      startScrollTop: body.scrollTop,
    };
    setIsPanning(true);
  }

  function onBodyPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const pan = panRef.current;
    const body = bodyRef.current;
    if (!pan || !body || pan.pointerId !== e.pointerId)
      return;
    body.scrollLeft = pan.startScrollLeft - (e.clientX - pan.startX);
    body.scrollTop = pan.startScrollTop - (e.clientY - pan.startY);
  }

  function endBodyPan(e: React.PointerEvent<HTMLDivElement>): void {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId)
      return;
    if (bodyRef.current)
      releasePointer(bodyRef.current, e.pointerId);
    panRef.current = null;
    setIsPanning(false);
  }

  function rotate(degrees: number): void {
    const next = (rotation + degrees + 360) % 360;
    setRotation(next);
    if (fitted && natural) {
      const nextSideways = next % 180 !== 0;
      setZoom(fitZoomFor(
        nextSideways ? natural.height : natural.width,
        nextSideways ? natural.width : natural.height,
      ));
    }
  }

  // EXIF-style info panel (U13): a pure function of the node + decoded
  // natural size, recomputed only when either changes.
  const [showInfo, setShowInfo] = useState(false);
  const exifFields = useMemo(() => buildExifFields(node, natural), [node, natural]);

  // Fullscreen/presentation mode (U13): the Fullscreen API owns Escape-to-
  // exit natively (no separate keydown handler needed), so this effect only
  // has to keep the button's icon/label in sync with the real state —
  // `fullscreenchange` also fires for an exit the browser itself drove
  // (e.g. the user's own Escape press).
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    function onFullscreenChange(): void {
      setIsFullscreen(document.fullscreenElement === bodyRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    bodyRef.current?.requestFullscreen().catch(() => {
      notify({ title: "Fullscreen isn’t available", tone: "danger" });
    });
  }

  // "Copy Image" (U13): resolve the node's real bytes across all three B1
  // content paths (same helper `download.ts`'s Save-As flow uses) and hand
  // them to the Async Clipboard API. `ClipboardItem` support for arbitrary
  // image MIME types varies by engine (Chromium is broadest; Safari/Firefox
  // are narrower) — best-effort, matching this feature's spec.
  async function copyImage(): Promise<void> {
    if (!node)
      return;
    if (!navigator.clipboard?.write) {
      notify({ title: "Copy isn’t supported in this browser", tone: "danger" });
      return;
    }
    try {
      const bytes = await resolveFileBytes(node, blobStore);
      const type = node.mimeType || "image/png";
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
      await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      notify({ title: "Image copied", body: node.name });
    }
    catch (err) {
      notify({
        title: "Couldn’t copy image",
        body: err instanceof Error ? err.message : String(err),
        tone: "danger",
      });
    }
  }

  // "Set as wallpaper" (U13): depends on `feat/settings-appearance` adding a
  // wallpaperFileId (or similar) action to settingsStore — not present on
  // this branch yet (only the built-in gradient-preset `wallpaperId` is).
  // TODO(step-15-integration): wire to feat/settings-appearance's wallpaper
  // action once merged; this is a no-op stub until then.
  function setAsWallpaper(): void {
    if (!node)
      return;
    notify({
      title: "Not available yet",
      body: "Setting a custom wallpaper is coming in a future update.",
    });
  }

  useAppCommand(windowId, (command) => {
    switch (command) {
      case "viewer.zoomIn":
        zoomBy(ZOOM_STEP);
        break;
      case "viewer.zoomOut":
        zoomBy(1 / ZOOM_STEP);
        break;
      case "viewer.fit":
        fit();
        break;
      case "viewer.rotateLeft":
        rotate(-90);
        break;
      case "viewer.rotateRight":
        rotate(90);
        break;
      case "viewer.next":
        step(1);
        break;
      case "viewer.previous":
        step(-1);
        break;
      case "viewer.toggleInfo":
        setShowInfo(v => !v);
        break;
      case "viewer.copyImage":
        void copyImage();
        break;
      case "viewer.setWallpaper":
        setAsWallpaper();
        break;
      case "viewer.toggleFullscreen":
        toggleFullscreen();
        break;
    }
  });

  // Bare ←/→: shortcuts.ts's global handler only dispatches ⌘-letter chords,
  // so this needs its own listener. Window-scoped and gated on `focused`
  // rather than Files' B6 container+DOM-focus approach — Viewer has no
  // focusable list to anchor to.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!focused || (e.key !== "ArrowLeft" && e.key !== "ArrowRight") || isEditableTarget(e.target))
        return;
      e.preventDefault();
      step(e.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused, step]);

  // Blob-backed images resolve their object URL asynchronously; a node with
  // a contentRef but no `src` yet is loading, not missing — don't flash the
  // "no longer available" message while that read is in flight. But once
  // `useBlobUrl` settles to "missing" (the hash isn't in the blob store —
  // review-backlog #18), treat it the same as no source at all instead of
  // spinning forever.
  const blobMissing = node?.contentRef !== undefined && blobStatus === "missing";
  const hasSource = !!(node?.content || (node?.contentRef && !blobMissing));
  if (!hasSource) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-2 select-none">
        <Image className="size-7" strokeWidth={1.4} />
        <span className="text-13">
          {activeId ? "This image is no longer available" : "Open an image from Files"}
        </span>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="grid h-full place-items-center">
        <span className="size-[calc(10px*var(--ui-scale))] animate-pulse rounded-full bg-accent" />
      </div>
    );
  }

  const toolButton
    = "grid size-6 place-items-center rounded-[6px] text-ink-2 enabled:hover:bg-ph enabled:hover:text-ink disabled:opacity-35";
  const hasSlideshow = siblings.length > 1;
  const slideshowPlaying = playing && hasSlideshow;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[38px] flex-none items-center gap-1 px-3 select-none hairline-b">
        <button type="button" aria-label="Zoom out" className={toolButton} onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <ZoomOut className="size-4" />
        </button>
        <span className="w-12 text-center font-mono text-11 text-ink-2 tabular-nums">
          {fitted ? "Fit" : `${Math.round(zoom * 100)}%`}
        </span>
        <button type="button" aria-label="Zoom in" className={toolButton} onClick={() => zoomBy(ZOOM_STEP)}>
          <ZoomIn className="size-4" />
        </button>
        <button type="button" aria-label="Zoom to fit" className={toolButton} onClick={fit}>
          <Maximize className="size-4" />
        </button>
        <div className="mx-1.5 h-4 w-px bg-hairline" />
        <button type="button" aria-label="Rotate left" className={toolButton} onClick={() => rotate(-90)}>
          <RotateCcw className="size-4" />
        </button>
        <button type="button" aria-label="Rotate right" className={toolButton} onClick={() => rotate(90)}>
          <RotateCw className="size-4" />
        </button>
        <div className="mx-1.5 h-4 w-px bg-hairline" />
        <button type="button" aria-label="Previous image" disabled={!hasSlideshow} className={toolButton} onClick={() => step(-1)}>
          <SkipBack className="size-4" />
        </button>
        <button
          type="button"
          aria-label={slideshowPlaying ? "Pause slideshow" : "Play slideshow"}
          disabled={!hasSlideshow}
          className={toolButton}
          onClick={() => setPlaying(p => !p)}
        >
          {slideshowPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button type="button" aria-label="Next image" disabled={!hasSlideshow} className={toolButton} onClick={() => step(1)}>
          <SkipForward className="size-4" />
        </button>
        <div className="mx-1.5 h-4 w-px bg-hairline" />
        <button
          type="button"
          aria-label="Copy image"
          className={toolButton}
          onClick={() => void copyImage()}
        >
          <Copy className="size-4" />
        </button>
        <button type="button" aria-label="Set as wallpaper" className={toolButton} onClick={setAsWallpaper}>
          <Wallpaper className="size-4" />
        </button>
        <button
          type="button"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className={toolButton}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Shrink className="size-4" /> : <Expand className="size-4" />}
        </button>
        <button
          type="button"
          aria-label="Toggle image info"
          aria-pressed={showInfo}
          className={`${toolButton} ${showInfo ? "bg-ph text-ink" : ""}`}
          onClick={() => setShowInfo(v => !v)}
        >
          <Info className="size-4" />
        </button>
        <span className="ml-auto truncate text-11.5 text-ink-2">
          {natural ? `${natural.width} × ${natural.height}` : ""}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={bodyRef}
            className={`flex min-h-0 flex-1 overflow-auto bg-surface-2 p-4 ${fitted ? "" : isPanning ? "cursor-grabbing" : "cursor-grab"}`}
            onPointerDown={onBodyPointerDown}
            onPointerMove={onBodyPointerMove}
            onPointerUp={endBodyPan}
            onPointerCancel={endBodyPan}
            onClick={() => {
              if (isFullscreen)
                void document.exitFullscreen();
            }}
          >
            <div
              className="m-auto grid flex-none place-items-center"
              style={{
                width: rotatedWidth * zoom || undefined,
                height: rotatedHeight * zoom || undefined,
              }}
            >
              <img
                src={src}
                alt={node?.name}
                draggable={false}
                className="max-w-none shadow-[0_8px_28px_-10px_rgba(0,0,0,.4)] transition-transform duration-150"
                style={{
                  width: natural ? natural.width * zoom : undefined,
                  height: natural ? natural.height * zoom : undefined,
                  transform: `rotate(${rotation}deg)`,
                }}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  // SVGs without explicit dimensions can report 0.
                  const width = img.naturalWidth || 400;
                  const height = img.naturalHeight || 300;
                  setNatural({ width, height });
                  if (fitted) {
                    setZoom(fitZoomFor(
                      sideways ? height : width,
                      sideways ? width : height,
                    ));
                  }
                }}
              />
            </div>
          </div>

          {siblings.length > 0 && (
            <Filmstrip siblings={siblings} activeId={activeId} onSelect={setActiveId} />
          )}
        </div>

        {showInfo && (
          <div className="w-48 flex-none overflow-auto p-3 hairline-l">
            <h2 className="mb-2 text-11.5 font-medium tracking-wide text-ink-2 uppercase">Info</h2>
            <dl className="flex flex-col gap-2">
              {exifFields.map(field => (
                <div key={field.label}>
                  <dt className="text-11 text-ink-2">{field.label}</dt>
                  <dd className="truncate text-12 text-ink" title={field.value}>{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One folder sibling's thumbnail in the filmstrip — a blob URL resolves
 * asynchronously per node, so this is its own component (mirrors
 * FilesView.tsx's `Thumbnail`) rather than calling `useBlobUrl` in a loop.
 */
function FilmstripThumb({ node, active, onSelect }: { node: FsNode; active: boolean; onSelect: () => void }) {
  const { url: blobUrl } = useBlobUrl(node.contentRef);
  const src = node.content ?? blobUrl ?? undefined;
  return (
    <button
      type="button"
      aria-label={node.name}
      aria-current={active}
      title={node.name}
      onClick={onSelect}
      className={`size-11 flex-none overflow-hidden rounded-[6px] ring-2 ring-offset-1 ring-offset-surface-2 transition-colors ${
        active ? "ring-accent" : "ring-transparent hover:ring-hairline"
      }`}
    >
      {src
        ? <img src={src} alt="" draggable={false} className="size-full object-cover" />
        : <div className="size-full bg-ph" />}
    </button>
  );
}

/**
 * Horizontal strip of the folder's other images (U13), each clickable to
 * jump straight to it — the same `siblings` array Next/Previous already
 * cycles through.
 */
function Filmstrip({ siblings, activeId, onSelect }: {
  siblings: FsNode[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-[62px] flex-none items-center gap-1.5 overflow-x-auto px-2 hairline-t">
      {siblings.map(sibling => (
        <FilmstripThumb
          key={sibling.id}
          node={sibling}
          active={sibling.id === activeId}
          onSelect={() => onSelect(sibling.id)}
        />
      ))}
    </div>
  );
}
