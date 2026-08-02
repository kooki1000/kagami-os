/**
 * Pure stopwatch/countdown-timer math, split out from `ClockApp.tsx` so it's
 * unit-testable in Vitest's `node` environment (mirrors
 * `src/apps/documents/pageNav.ts`). Every function takes an explicit `now`
 * timestamp rather than reading `Date.now()` itself, so tests never need
 * real timers. Formatting is deliberately NOT reimplemented here — the
 * component calls the existing `formatClockTime`/`formatDuration` from
 * `@/lib/format` for display.
 */

export interface StopwatchState {
  running: boolean;
  /** Timestamp the current run segment started, or resumed, at. */
  startedAt: number | null;
  /** Elapsed time banked from previous run segments. */
  accumulatedMs: number;
}

export const INITIAL_STOPWATCH: StopwatchState = { running: false, startedAt: null, accumulatedMs: 0 };

export function startStopwatch(state: StopwatchState, now: number): StopwatchState {
  return state.running ? state : { ...state, running: true, startedAt: now };
}

export function pauseStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (!state.running || state.startedAt === null)
    return state;
  return { running: false, startedAt: null, accumulatedMs: state.accumulatedMs + (now - state.startedAt) };
}

export function resetStopwatch(): StopwatchState {
  return INITIAL_STOPWATCH;
}

export function getElapsedMs(state: StopwatchState, now: number): number {
  if (state.running && state.startedAt !== null)
    return state.accumulatedMs + (now - state.startedAt);
  return state.accumulatedMs;
}

export interface TimerState {
  running: boolean;
  /** Timestamp the current run segment started, or resumed, at. */
  startedAt: number | null;
  /** Remaining time as of `startedAt` (or, while paused, right now). */
  remainingAtStart: number;
  /** The configured countdown length, kept so `reset` can restore it. */
  durationMs: number;
}

export function initialTimer(durationMs = 0): TimerState {
  return { running: false, startedAt: null, remainingAtStart: durationMs, durationMs };
}

/** Sets the countdown length. Ignored while running — pause or reset first. */
export function setTimerDuration(state: TimerState, durationMs: number): TimerState {
  if (state.running)
    return state;
  return { running: false, startedAt: null, remainingAtStart: durationMs, durationMs };
}

export function startTimer(state: TimerState, now: number): TimerState {
  if (state.running || state.remainingAtStart <= 0)
    return state;
  return { ...state, running: true, startedAt: now };
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (!state.running || state.startedAt === null)
    return state;
  const remaining = Math.max(0, state.remainingAtStart - (now - state.startedAt));
  return { ...state, running: false, startedAt: null, remainingAtStart: remaining };
}

export function resetTimer(state: TimerState): TimerState {
  return initialTimer(state.durationMs);
}

export function getRemainingMs(state: TimerState, now: number): number {
  if (state.running && state.startedAt !== null)
    return Math.max(0, state.remainingAtStart - (now - state.startedAt));
  return state.remainingAtStart;
}

/** True once a started countdown has run out. A never-started (0-duration) timer is not "done". */
export function isTimerDone(state: TimerState, now: number): boolean {
  return state.durationMs > 0 && getRemainingMs(state, now) <= 0;
}
