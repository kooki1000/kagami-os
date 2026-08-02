import type { StopwatchState, TimerState } from "./clockEngine";
import type { AppWindowProps } from "@/system/apps/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { currentLocale, formatClockTime, formatDuration } from "@/lib/format";
import { notify } from "@/system/notifications/notificationStore";
import { useSettingsStore } from "@/system/settings/settingsStore";
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

type Tab = "clock" | "stopwatch" | "timer";

/**
 * Ticks `Date.now()` on an interval only while `active`, so a tab that isn't
 * showing causes no re-renders. No eager sync call on activation (matching
 * `MenuBar.tsx`'s own `Clock`) — the first tick lands within one
 * `intervalMs`, imperceptible at the intervals used here.
 */
function useTicker(active: boolean, intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active)
      return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

// Matches Settings' `Segmented` control exactly (SettingsApp.tsx) — a
// neutral bg-ph pill with a bg-surface + shadow active segment, the app's
// one established segmented-control pattern, rather than a filled accent tab.
function tabButtonClass(active: boolean): string {
  return `flex-1 rounded-btn px-3 py-[calc(6px*var(--ui-scale))] text-12 transition-colors ${
    active
      ? "bg-surface font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.14)]"
      : "font-medium text-ink-2 hover:text-ink"
  }`;
}
// Secondary/primary pair matches WindowErrorBoundary.tsx's "Close window"/"Reload app" buttons.
const actionButtonClass = "rounded-btn bg-ph px-3 py-[calc(6px*var(--ui-scale))] text-12 font-medium text-ink enabled:hover:bg-surface-2 disabled:opacity-35";
const primaryButtonClass = "rounded-btn bg-accent px-4 py-[calc(6px*var(--ui-scale))] text-12 font-semibold text-white disabled:opacity-35";

export default function ClockApp(_props: AppWindowProps) {
  const [tab, setTab] = useState<Tab>("clock");

  return (
    <div className="flex h-full flex-col bg-surface select-none">
      <div className="m-2 flex flex-none rounded-[9px] bg-ph p-0.75">
        <button type="button" className={tabButtonClass(tab === "clock")} onClick={() => setTab("clock")}>Clock</button>
        <button type="button" className={tabButtonClass(tab === "stopwatch")} onClick={() => setTab("stopwatch")}>Stopwatch</button>
        <button type="button" className={tabButtonClass(tab === "timer")} onClick={() => setTab("timer")}>Timer</button>
      </div>
      {/* All three panes stay mounted so Stopwatch/Timer keep running (and
          the Timer's completion watcher keeps polling) while another tab is
          showing — only visibility, not the subtree, toggles with the tab. */}
      <div className="relative min-h-0 flex-1 p-4">
        <div className="absolute inset-0 flex items-center justify-center" hidden={tab !== "clock"}>
          <ClockFace active={tab === "clock"} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center" hidden={tab !== "stopwatch"}>
          <Stopwatch active={tab === "stopwatch"} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center" hidden={tab !== "timer"}>
          <Timer active={tab === "timer"} />
        </div>
      </div>
    </div>
  );
}

function ClockFace({ active }: { active: boolean }) {
  const hour12 = useSettingsStore(s => s.clockHour12);
  const showSeconds = useSettingsStore(s => s.clockShowSeconds);
  const now = useTicker(active, showSeconds ? 1000 : 15_000);
  const date = new Date(now);
  const weekday = date.toLocaleDateString(currentLocale(), { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="font-mono text-[calc(40px*var(--ui-scale))] leading-tight text-ink tabular-nums">
        {formatClockTime(date, { hour12, showSeconds })}
      </div>
      <div className="text-13 text-ink-2">{weekday}</div>
    </div>
  );
}

function Stopwatch({ active }: { active: boolean }) {
  const [state, setState] = useState<StopwatchState>(INITIAL_STOPWATCH);
  const now = useTicker(active && state.running, 250);
  const elapsedMs = getElapsedMs(state, now);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="font-mono text-[calc(36px*var(--ui-scale))] leading-tight text-ink tabular-nums">
        {formatDuration(elapsedMs / 1000)}
        <span className="text-[calc(18px*var(--ui-scale))] text-ink-2">
          .
          {Math.floor((elapsedMs % 1000) / 100)}
        </span>
      </div>
      <div className="flex gap-2">
        <button type="button" className={actionButtonClass} onClick={() => setState(resetStopwatch)} disabled={elapsedMs === 0 && !state.running}>
          Reset
        </button>
        {state.running
          ? <button type="button" className={primaryButtonClass} onClick={() => setState(s => pauseStopwatch(s, Date.now()))}>Pause</button>
          : <button type="button" className={primaryButtonClass} onClick={() => setState(s => startStopwatch(s, Date.now()))}>Start</button>}
      </div>
    </div>
  );
}

const DEFAULT_TIMER_MINUTES = 5;

function Timer({ active }: { active: boolean }) {
  const [state, setState] = useState<TimerState>(() => initialTimer(DEFAULT_TIMER_MINUTES * 60 * 1000));
  const [minutesInput, setMinutesInput] = useState(DEFAULT_TIMER_MINUTES);
  const [secondsInput, setSecondsInput] = useState(0);
  const now = useTicker(active && state.running, 250);

  // Editable only at rest (never started, or freshly reset) — once a
  // countdown has actually begun, Pause/Resume/Reset are the only ways to
  // change it, matching how a physical countdown timer behaves. While at
  // rest the big readout tracks the input fields live; once started it
  // tracks the engine's own remaining time.
  const atRest = !state.running && state.remainingAtStart === state.durationMs;
  const configuredMs = (minutesInput * 60 + secondsInput) * 1000;
  const remainingMs = atRest ? configuredMs : getRemainingMs(state, now);
  const done = !atRest && isTimerDone(state, now);

  // Completion detection runs independently of which tab is active or
  // visible, so the notification fires even if the user switched to Clock
  // or Stopwatch while this counted down — polled via a ref rather than
  // closing over `state`, so the interval doesn't need to be torn down and
  // rebuilt on every tick.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });
  useEffect(() => {
    if (!state.running)
      return;
    const id = window.setInterval(() => {
      const current = stateRef.current;
      if (current.running && isTimerDone(current, Date.now())) {
        setState(s => pauseTimer(s, Date.now()));
        notify({ title: "Timer finished", body: "Your countdown has reached zero.", appId: "clock", tone: "accent" });
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [state.running]);

  function handleStart(): void {
    setState((s) => {
      const withDuration = atRest ? setTimerDuration(s, configuredMs) : s;
      return startTimer(withDuration, Date.now());
    });
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`font-mono text-[calc(36px*var(--ui-scale))] leading-tight tabular-nums ${done ? "text-accent" : "text-ink"}`}>
        {formatDuration(remainingMs / 1000)}
      </div>
      {atRest && (
        <div className="flex items-center gap-1.5 text-12 text-ink-2">
          <input
            type="number"
            min={0}
            max={99}
            value={minutesInput}
            onChange={e => setMinutesInput(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
            className="w-12 rounded-[6px] bg-ph px-2 py-1 text-center text-ink tabular-nums outline-none"
            aria-label="Minutes"
          />
          <span>min</span>
          <input
            type="number"
            min={0}
            max={59}
            value={secondsInput}
            onChange={e => setSecondsInput(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
            className="w-12 rounded-[6px] bg-ph px-2 py-1 text-center text-ink tabular-nums outline-none"
            aria-label="Seconds"
          />
          <span>sec</span>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className={actionButtonClass} onClick={() => setState(resetTimer)} disabled={atRest}>
          Reset
        </button>
        {state.running
          ? <button type="button" className={primaryButtonClass} onClick={() => setState(s => pauseTimer(s, Date.now()))}>Pause</button>
          : <button type="button" className={primaryButtonClass} onClick={handleStart} disabled={remainingMs <= 0}>Start</button>}
      </div>
    </div>
  );
}
