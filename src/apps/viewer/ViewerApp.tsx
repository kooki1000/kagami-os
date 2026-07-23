import type { AppWindowProps } from "@/system/apps/types";
import {
  Image,
  Maximize,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppCommand } from "@/system/appCommands";
import { payloadFileId } from "@/system/apps/openFile";
import { useFsStore } from "@/system/fs/fsStore";
import { useBlobUrl } from "@/system/fs/useBlobUrl";
import { useWindowStore } from "@/system/windows/windowStore";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const BODY_PADDING = 32;

interface NaturalSize {
  width: number;
  height: number;
}

export default function ViewerApp({ windowId, payload }: AppWindowProps) {
  const fileId = payloadFileId(payload);
  const node = useFsStore(s => (fileId ? s.nodes[fileId] : undefined));
  const blobUrl = useBlobUrl(node?.contentRef);
  const src = node?.content ?? blobUrl ?? undefined;
  const setWindowTitle = useWindowStore(s => s.setWindowTitle);

  // Viewer windows are titled after their file; keep the title bar in step
  // when the file is renamed elsewhere (Files, Terminal) while it's open.
  useEffect(() => {
    if (node?.name)
      setWindowTitle(windowId, node.name);
  }, [node?.name, windowId, setWindowTitle]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitted, setFitted] = useState(true);
  const [rotation, setRotation] = useState(0);

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
    body.setPointerCapture(e.pointerId);
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
    bodyRef.current?.releasePointerCapture(e.pointerId);
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
    }
  });

  // Blob-backed images resolve their object URL asynchronously; a node with
  // a contentRef but no `src` yet is loading, not missing — don't flash the
  // "no longer available" message while that read is in flight.
  const hasSource = !!(node?.content || node?.contentRef);
  if (!hasSource) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-2 select-none">
        <Image className="size-7" strokeWidth={1.4} />
        <span className="text-[13px]">
          {fileId ? "This image is no longer available" : "Open an image from Files"}
        </span>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="grid h-full place-items-center">
        <span className="size-2.5 animate-pulse rounded-full bg-accent" />
      </div>
    );
  }

  const toolButton
    = "grid size-6 place-items-center rounded-[6px] text-ink-2 hover:bg-ph hover:text-ink";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[38px] flex-none items-center gap-1 px-3 select-none hairline-b">
        <button type="button" aria-label="Zoom out" className={toolButton} onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <ZoomOut className="size-4" />
        </button>
        <span className="w-12 text-center font-mono text-[11px] text-ink-2 tabular-nums">
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
        <span className="ml-auto truncate text-[11.5px] text-ink-2">
          {natural ? `${natural.width} × ${natural.height}` : ""}
        </span>
      </div>

      <div
        ref={bodyRef}
        className={`flex min-h-0 flex-1 overflow-auto bg-surface-2 p-4 ${fitted ? "" : isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onBodyPointerDown}
        onPointerMove={onBodyPointerMove}
        onPointerUp={endBodyPan}
        onPointerCancel={endBodyPan}
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
    </div>
  );
}
