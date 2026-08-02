/**
 * Pure undo stack over stroke records, split out from `PaintApp.tsx` so
 * it's unit-testable in Vitest's `node` environment (no canvas). Strokes,
 * not raw `ImageData`, are the unit of history — cheaper to keep around and
 * exact to undo, at the cost of the component always redrawing the whole
 * canvas from history rather than drawing incrementally.
 */

export interface Point { x: number; y: number }

export interface Stroke {
  points: Point[];
  color: string;
  size: number;
  erase: boolean;
}

export function appendPoint(stroke: Stroke, point: Point): Stroke {
  return { ...stroke, points: [...stroke.points, point] };
}

export function pushStroke(history: Stroke[], stroke: Stroke): Stroke[] {
  return [...history, stroke];
}

export function undo(history: Stroke[]): Stroke[] {
  return history.slice(0, -1);
}

export function clearHistory(): Stroke[] {
  return [];
}
