import { describe, expect, it } from "vitest";
import {
  getElapsedMs,
  getRemainingMs,
  INITIAL_STOPWATCH,
  initialTimer,
  isTimerDone,
  pauseStopwatch,
  pauseTimer,
  resetStopwatch,
  resetTimer,
  setTimerDuration,
  startStopwatch,
  startTimer,
} from "./clockEngine";

describe("stopwatch", () => {
  it("accumulates elapsed time while running", () => {
    const running = startStopwatch(INITIAL_STOPWATCH, 1000);
    expect(getElapsedMs(running, 1000)).toBe(0);
    expect(getElapsedMs(running, 4500)).toBe(3500);
  });

  it("starting twice is a no-op (doesn't reset the run segment)", () => {
    const running = startStopwatch(INITIAL_STOPWATCH, 1000);
    const startedAgain = startStopwatch(running, 5000);
    expect(startedAgain).toBe(running);
  });

  it("pause banks elapsed time and freezes it", () => {
    let s = startStopwatch(INITIAL_STOPWATCH, 1000);
    s = pauseStopwatch(s, 3000);
    expect(getElapsedMs(s, 3000)).toBe(2000);
    expect(getElapsedMs(s, 9000)).toBe(2000); // frozen while paused
  });

  it("resume continues accumulating on top of the banked time", () => {
    let s = startStopwatch(INITIAL_STOPWATCH, 0);
    s = pauseStopwatch(s, 1000); // 1000ms banked
    s = startStopwatch(s, 5000); // resume
    expect(getElapsedMs(s, 6500)).toBe(2500); // 1000 banked + 1500 more
  });

  it("reset returns to zero", () => {
    let s = startStopwatch(INITIAL_STOPWATCH, 0);
    s = pauseStopwatch(s, 5000);
    s = resetStopwatch();
    expect(getElapsedMs(s, 99_999)).toBe(0);
  });
});

describe("countdown timer", () => {
  it("counts down from the configured duration", () => {
    let t = setTimerDuration(initialTimer(), 10_000);
    t = startTimer(t, 0);
    expect(getRemainingMs(t, 0)).toBe(10_000);
    expect(getRemainingMs(t, 4000)).toBe(6000);
  });

  it("clamps remaining time at zero, never negative", () => {
    let t = setTimerDuration(initialTimer(), 5000);
    t = startTimer(t, 0);
    expect(getRemainingMs(t, 20_000)).toBe(0);
  });

  it("reports done only once a started countdown has actually run out", () => {
    let t = setTimerDuration(initialTimer(), 5000);
    expect(isTimerDone(t, 0)).toBe(false); // not started yet
    t = startTimer(t, 0);
    expect(isTimerDone(t, 4000)).toBe(false);
    expect(isTimerDone(t, 5000)).toBe(true);
  });

  it("a zero-duration timer is never considered done", () => {
    const t = initialTimer(0);
    expect(isTimerDone(t, 0)).toBe(false);
  });

  it("won't start with no time remaining", () => {
    const t = setTimerDuration(initialTimer(), 0);
    expect(startTimer(t, 0)).toBe(t);
  });

  it("pause freezes the remaining time, resume continues from there", () => {
    let t = setTimerDuration(initialTimer(), 10_000);
    t = startTimer(t, 0);
    t = pauseTimer(t, 3000); // 7000ms left
    expect(getRemainingMs(t, 99_999)).toBe(7000); // frozen while paused
    t = startTimer(t, 3000);
    expect(getRemainingMs(t, 5000)).toBe(5000);
  });

  it("reset restores the configured duration", () => {
    let t = setTimerDuration(initialTimer(), 10_000);
    t = startTimer(t, 0);
    t = pauseTimer(t, 8000);
    t = resetTimer(t);
    expect(getRemainingMs(t, 0)).toBe(10_000);
    expect(t.running).toBe(false);
  });

  it("setTimerDuration is ignored while running", () => {
    let t = setTimerDuration(initialTimer(), 10_000);
    t = startTimer(t, 0);
    const unchanged = setTimerDuration(t, 20_000);
    expect(unchanged).toBe(t);
  });
});
