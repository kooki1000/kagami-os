import { describe, expect, it } from "vitest";
import { lastStepIndex, nextStepIndex, prevStepIndex, tourSteps } from "./tourSteps";

describe("tourSteps shape", () => {
  it("has at least one step", () => {
    expect(tourSteps.length).toBeGreaterThan(0);
  });

  it("gives every step a non-empty title and body", () => {
    for (const step of tourSteps) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("pairs every action with a label to show on its button", () => {
    for (const step of tourSteps) {
      if (step.action) {
        expect(typeof step.action).toBe("function");
        expect(step.actionLabel?.trim().length).toBeGreaterThan(0);
      }
      else {
        expect(step.actionLabel).toBeUndefined();
      }
    }
  });

  it("has no duplicate titles (used as React list keys)", () => {
    const titles = tourSteps.map(s => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("nextStepIndex", () => {
  it("advances by one", () => {
    expect(nextStepIndex(0, 5)).toBe(1);
  });

  it("never advances past the last index", () => {
    expect(nextStepIndex(4, 5)).toBe(4);
    expect(nextStepIndex(99, 5)).toBe(4);
  });

  it("returns 0 for an empty/invalid total", () => {
    expect(nextStepIndex(0, 0)).toBe(0);
  });
});

describe("prevStepIndex", () => {
  it("retreats by one", () => {
    expect(prevStepIndex(3)).toBe(2);
  });

  it("never retreats before the first index", () => {
    expect(prevStepIndex(0)).toBe(0);
  });
});

describe("lastStepIndex", () => {
  it("is one less than the total", () => {
    expect(lastStepIndex(5)).toBe(4);
  });

  it("clamps to 0 for an empty total", () => {
    expect(lastStepIndex(0)).toBe(0);
  });

  it("matches the real tour's step count", () => {
    expect(lastStepIndex(tourSteps.length)).toBe(tourSteps.length - 1);
  });
});
