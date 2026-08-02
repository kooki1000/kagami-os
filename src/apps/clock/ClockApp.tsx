import type { StopwatchState, TimerState } from "./clockEngine";
import type { AppWindowProps } from "@/system/apps/types";
import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
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

const TAB_OPTIONS = [
  { value: "clock", label: "Clock" },
  { value: "stopwatch", label: "Stopwatch" },
  { value: "timer", label: "Timer" },
] as const satisfies { value: Tab; label: string }[];

/** Ticks `Date.now()` only while `active`, so a hidden tab causes no re-renders (mirrors `MenuBar.tsx`'s `Clock`). */
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

// Secondary/primary pair matches WindowErrorBoundary.tsx's "Close window"/"Reload app" buttons.
const actionButtonClass = "rounded-btn bg-ph px-3 py-[calc(6px*var(--ui-scale))] text-12 font-medium text-ink enabled:hover:bg-surface-2 disabled:opacity-35";
const primaryButtonClass = "rounded-btn bg-accent px-4 py-[calc(6px*var(--ui-scale))] text-12 font-semibold text-white disabled:opacity-35";

export default function ClockApp(_props: AppWindowProps) {
  const [tab, setTab] = useState<Tab>("clock");

  return (
    <div className="flex h-full flex-col bg-surface select-none">
      <div className="m-2">
        <Segmented value={tab} onChange={setTab} options={TAB_OPTIONS} />
      </div>
      {/* All three panes stay mounted so Stopwatch/Timer keep running while
          another tab is showing — only visibility, not the subtree, toggles. */}
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

  // Editable only at rest (never started or freshly reset) — once running,
  // only Pause/Resume/Reset apply. The readout tracks the input fields live
  // while at rest, and the engine's own remaining time once started.
  const atRest = !state.running && state.remainingAtStart === state.durationMs;
  const configuredMs = (minutesInput * 60 + secondsInput) * 1000;
  const remainingMs = atRest ? configuredMs : getRemainingMs(state, now);
  const done = !atRest && isTimerDone(state, now);

  // A single scheduled callback rather than a polling interval — the exact
  // completion instant is already knowable from `state`. Independent of
  // which tab is active, so the notification fires even if the user
  // switched away mid-countdown.
  useEffect(() => {
    if (!state.running)
      return;
    const id = window.setTimeout(() => {
      setState(s => pauseTimer(s, Date.now()));
      notify({ title: "Timer finished", body: "Your countdown has reached zero.", appId: "clock", tone: "accent" });
    }, getRemainingMs(state, Date.now()));
    return () => window.clearTimeout(id);
  }, [state]);

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
