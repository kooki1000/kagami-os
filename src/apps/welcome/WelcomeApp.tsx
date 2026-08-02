import type { AppWindowProps } from "@/system/apps/types";
import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { useWindowStore } from "@/system/windows/windowStore";
import { lastStepIndex, nextStepIndex, prevStepIndex, tourSteps } from "./tourSteps";

const DISMISS_LABEL = "Don't show this tour again";

export default function WelcomeApp({ windowId }: AppWindowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const tourDismissed = useSettingsStore(s => s.tourDismissed);
  const setTourDismissed = useSettingsStore(s => s.setTourDismissed);

  const total = tourSteps.length;
  const step = tourSteps[stepIndex];
  const isLast = stepIndex === lastStepIndex(total);

  function finish() {
    useWindowStore.getState().closeWindow(windowId);
  }

  return (
    <div className="flex h-full flex-col select-none">
      <div className="flex-1 overflow-auto p-8">
        <div className="mb-1 flex items-center gap-3">
          <span
            className="size-5 rotate-45 rounded-[5px]"
            style={{ background: "var(--accent)" }}
          />
          <h1 className="text-[calc(24px*var(--ui-scale))] font-bold tracking-tight text-ink">
            {step.title}
          </h1>
        </div>

        <p className="mt-4 max-w-md text-13/relaxed text-ink-2">
          {step.body}
        </p>

        {step.action && (
          <button
            type="button"
            className="mt-5 rounded-btn bg-accent px-[calc(14px*var(--ui-scale))] py-[calc(8px*var(--ui-scale))] text-12.5 font-semibold text-white"
            onClick={step.action}
          >
            {step.actionLabel}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-8 py-5 hairline-t">
        {/* A `<label>` can't name a `role="switch"` button, so `Switch` carries
            its own `aria-label` — which must match the visible text verbatim
            (WCAG 2.5.3), not paraphrase it as this pair used to. */}
        <span className="flex items-center gap-2 text-11.5 text-ink-2">
          <Switch
            checked={tourDismissed}
            onChange={setTourDismissed}
            label={DISMISS_LABEL}
            size="sm"
          />
          {DISMISS_LABEL}
        </span>

        <div className="flex items-center gap-1.5" role="tablist" aria-label="Tour progress">
          {tourSteps.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === stepIndex}
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              onClick={() => setStepIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? "w-5 bg-accent" : "w-1.5 bg-ph"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!isLast && (
            <button
              type="button"
              className="rounded-btn px-[calc(10px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] text-12 font-medium text-ink-2 hover:bg-ph hover:text-ink"
              onClick={() => setStepIndex(lastStepIndex(total))}
            >
              Skip
            </button>
          )}
          <button
            type="button"
            disabled={stepIndex === 0}
            className="rounded-btn bg-ph px-[calc(10px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] text-12 font-medium text-ink hover:bg-ph-2 disabled:opacity-40"
            onClick={() => setStepIndex(i => prevStepIndex(i))}
          >
            Back
          </button>
          <button
            type="button"
            className="rounded-btn bg-ink px-[calc(12px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] text-12 font-semibold text-surface"
            onClick={() => (isLast ? finish() : setStepIndex(i => nextStepIndex(i, total)))}
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
