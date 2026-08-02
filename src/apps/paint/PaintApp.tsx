import type { Point, Stroke } from "./paintHistory";
import type { AppWindowProps } from "@/system/apps/types";
import { Eraser, Paintbrush, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppCommand } from "@/system/appCommands";
import { useFsStore } from "@/system/fs/fsStore";
import { PICTURES_ID } from "@/system/fs/types";
import { notify } from "@/system/notifications/notificationStore";
import { appendPoint, clearHistory, pushStroke, undo } from "./paintHistory";

const COLORS = ["#1e1e1e", "#e0654b", "#e8a23b", "#3f9e6d", "#3d7fc7", "#8a5fd6", "#ffffff"];
const SIZES = [2, 4, 8, 16];

function getPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: Pick<Stroke, "color" | "size" | "erase">): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.size;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
}

/** A full polyline for one stroke — used for the from-history redraw (undo/clear/resize). */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0)
    return;
  ctx.save();
  applyStrokeStyle(ctx, stroke);
  if (stroke.points.length === 1) {
    const [p] = stroke.points;
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  else {
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const p of stroke.points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** One incremental segment, drawn live as the pointer moves (redrawing the whole canvas on every move would be wasteful). */
function drawSegment(ctx: CanvasRenderingContext2D, from: Point, to: Point, style: Pick<Stroke, "color" | "size" | "erase">): void {
  ctx.save();
  applyStrokeStyle(ctx, style);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function redrawAll(canvas: HTMLCanvasElement, history: Stroke[], dpr: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx)
    return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  for (const stroke of history) drawStroke(ctx, stroke);
}

function toolButtonClass(active: boolean): string {
  return `grid size-7 place-items-center rounded-btn ${
    active ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-accent" : "text-ink-2 hover:bg-ph hover:text-ink"
  }`;
}
const actionButtonClass = "grid size-7 place-items-center rounded-btn text-ink-2 enabled:hover:bg-ph enabled:hover:text-ink disabled:opacity-35";

export default function PaintApp({ windowId }: AppWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dprRef = useRef(1);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const historyRef = useRef<Stroke[]>([]);

  const [history, setHistory] = useState<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(SIZES[1]);
  const [erase, setErase] = useState(false);

  useLayoutEffect(() => {
    historyRef.current = history;
  });

  // Full redraw whenever the committed stroke list changes (undo/redo/clear).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas)
      redrawAll(canvas, history, dprRef.current);
  }, [history]);

  // Track the container's box and keep the canvas's backing store crisp at
  // the device pixel ratio; a resize necessarily wipes canvas pixels, so it
  // redraws from `historyRef` (kept fresh via the layout effect above, so
  // this observer doesn't need to be torn down and rebuilt every stroke).
  useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas)
      return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0)
        return;
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      redrawAll(canvas, historyRef.current, dpr);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = getPoint(e);
    const stroke: Stroke = { points: [point], color, size: brushSize, erase };
    currentStrokeRef.current = stroke;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      drawStroke(ctx, stroke); // renders the single-point dot immediately, so a click-without-drag still marks the canvas
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    const stroke = currentStrokeRef.current;
    if (!stroke)
      return;
    const point = getPoint(e);
    const prev = stroke.points[stroke.points.length - 1];
    currentStrokeRef.current = appendPoint(stroke, point);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      drawSegment(ctx, prev, point, stroke);
    }
  }

  function handlePointerUp(): void {
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (stroke)
      setHistory(h => pushStroke(h, stroke));
  }

  function handleUndo(): void {
    setHistory(undo);
  }

  function handleClear(): void {
    setHistory(clearHistory);
  }

  async function handleSave(): Promise<void> {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) {
      notify({ title: "Nothing to save", body: "Draw something first.", tone: "danger" });
      return;
    }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      notify({ title: "Save failed", body: "Couldn't export the canvas as an image.", tone: "danger" });
      return;
    }
    const node = await useFsStore.getState().createBlobFile(PICTURES_ID, "Drawing.png", blob, "image/png");
    notify({ title: "Saved", body: `“${node.name}” was added to Pictures.`, appId: "paint" });
  }

  useAppCommand(windowId, (command) => {
    switch (command) {
      case "paint.new":
        handleClear();
        break;
      case "paint.save":
        void handleSave();
        break;
    }
  });

  return (
    <div className="flex h-full flex-col bg-surface select-none">
      <div className="flex flex-none flex-wrap items-center gap-3 p-2 hairline-b">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Brush" aria-pressed={!erase} className={toolButtonClass(!erase)} onClick={() => setErase(false)}>
            <Paintbrush className="size-4" />
          </button>
          <button type="button" aria-label="Eraser" aria-pressed={erase} className={toolButtonClass(erase)} onClick={() => setErase(true)}>
            <Eraser className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              className={`size-5 rounded-full ${color === c ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "hairline"}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <input
            type="color"
            aria-label="Custom color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
        </div>

        <div className="flex items-center gap-1">
          {SIZES.map(s => (
            <button
              key={s}
              type="button"
              aria-label={`Brush size ${s}`}
              aria-pressed={brushSize === s}
              className={toolButtonClass(brushSize === s)}
              onClick={() => setBrushSize(s)}
            >
              <span className="rounded-full bg-current" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Undo" className={actionButtonClass} disabled={history.length === 0} onClick={handleUndo}>
            <Undo2 className="size-4" />
          </button>
          <button type="button" aria-label="Clear canvas" className={actionButtonClass} disabled={history.length === 0} onClick={handleClear}>
            <Trash2 className="size-4" />
          </button>
          <button type="button" aria-label="Save to Pictures" className={actionButtonClass} disabled={history.length === 0} onClick={() => void handleSave()}>
            <Save className="size-4" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 p-2">
        <canvas
          ref={canvasRef}
          className="size-full touch-none rounded-btn hairline"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </div>
  );
}
