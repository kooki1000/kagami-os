import type { Stroke } from "./paintHistory";
import { describe, expect, it } from "vitest";
import { appendPoint, clearHistory, pushStroke, undo } from "./paintHistory";

function stroke(overrides: Partial<Stroke> = {}): Stroke {
  return { points: [{ x: 0, y: 0 }], color: "#000000", size: 4, erase: false, ...overrides };
}

describe("appendPoint", () => {
  it("appends without mutating the original stroke", () => {
    const original = stroke();
    const next = appendPoint(original, { x: 5, y: 5 });
    expect(original.points).toHaveLength(1);
    expect(next.points).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  });
});

describe("pushStroke / undo", () => {
  it("push appends without mutating the original history", () => {
    const history = [stroke()];
    const next = pushStroke(history, stroke({ color: "#ff0000" }));
    expect(history).toHaveLength(1);
    expect(next).toHaveLength(2);
  });

  it("undo removes only the most recent stroke", () => {
    const history = [stroke({ color: "#000" }), stroke({ color: "#fff" })];
    const next = undo(history);
    expect(next).toEqual([stroke({ color: "#000" })]);
  });

  it("undo on an empty history is a no-op", () => {
    expect(undo([])).toEqual([]);
  });

  it("clearHistory always returns an empty stack", () => {
    expect(clearHistory()).toEqual([]);
  });
});
