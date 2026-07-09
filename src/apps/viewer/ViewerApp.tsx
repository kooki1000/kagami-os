import type { AppWindowProps } from "@/system/apps/types";
import {
  Image,
  Maximize,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppCommand } from "@/system/appCommands";
import { payloadFileId } from "@/system/apps/openFile";
import { useFsStore } from "@/system/fs/fsStore";
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
  const fitStateRef = useRef({ fitted, rotatedWidth, rotatedHeight });
  fitStateRef.current = { fitted, rotatedWidth, rotatedHeight };

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

  function zoomBy(factor: number): void {
    setFitted(false);
    setZoom(z => Math.min(Math.max(z * factor, MIN_ZOOM), MAX_ZOOM));
  }

  function fit(): void {
    setFitted(true);
    setZoom(fitZoomFor(rotatedWidth, rotatedHeight));
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

  if (!node?.content) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-2 select-none">
        <Image className="size-7" strokeWidth={1.4} />
        <span className="text-[13px]">
          {fileId ? "This image is no longer available" : "Open an image from Files"}
        </span>
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

      <div ref={bodyRef} className="flex min-h-0 flex-1 overflow-auto bg-surface-2 p-4">
        <div
          className="m-auto grid flex-none place-items-center"
          style={{
            width: rotatedWidth * zoom || undefined,
            height: rotatedHeight * zoom || undefined,
          }}
        >
          <img
            src={node.content}
            alt={node.name}
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
