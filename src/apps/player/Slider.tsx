import { useRef } from "react";
import { clamp01 } from "@/lib/math";
import { capturePointer, releasePointer } from "@/lib/pointerCapture";

/**
 * A custom 0–1 slider (scrub bar, volume) in the shell's design language —
 * click/drag over a filled track, no native `<input type="range">`. Part of
 * U12's custom transport replacing native media `controls` entirely.
 *
 * Keyboard: a real ARIA slider (arrow keys nudge by `step`, Home/End jump to
 * the ends), with the key handler stopping propagation so it doesn't also
 * trigger Player's window-scoped bare-arrow-key seek/track-skip listener —
 * that listener is for when the slider *isn't* focused.
 */
export function Slider({
  value,
  onChange,
  ariaLabel,
  step = 0.05,
  className = "",
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  step?: number;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const clamped = clamp01(value);

  function ratioFromPointer(clientX: number): number {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0)
      return clamped;
    const rect = track.getBoundingClientRect();
    return clamp01((clientX - rect.left) / rect.width);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0)
      return;
    capturePointer(e.currentTarget, e.pointerId);
    onChange(ratioFromPointer(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.buttons !== 1)
      return;
    onChange(ratioFromPointer(e.clientX));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    releasePointer(e.currentTarget, e.pointerId);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp")
      next = Math.min(1, clamped + step);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
      next = Math.max(0, clamped - step);
    else if (e.key === "Home")
      next = 0;
    else if (e.key === "End")
      next = 1;
    if (next !== null) {
      e.preventDefault();
      e.stopPropagation();
      onChange(next);
    }
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Math.round(clamped * 100) / 100}
      className={`group relative h-1 cursor-pointer touch-none rounded-full bg-ph focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${clamped * 100}%` }} />
      <div
        className="absolute top-1/2 size-2.5 -translate-1/2 rounded-full bg-accent opacity-0 shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-opacity group-hover:opacity-100"
        style={{ left: `${clamped * 100}%` }}
      />
    </div>
  );
}
