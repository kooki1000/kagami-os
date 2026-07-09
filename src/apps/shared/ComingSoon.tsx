import type { ComponentType } from "react";

interface ComingSoonProps {
  appName: string;
  phase: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number | string }>;
  blurb: string;
}

/** Placeholder body for apps whose real implementation lands in a later phase. */
export function ComingSoon({ appName, phase, icon: Icon, blurb }: ComingSoonProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center select-none">
      <div className="grid size-16 place-items-center rounded-tile bg-ph">
        <Icon className="size-7 text-ink-2" strokeWidth={1.5} />
      </div>
      <div className="text-[15px] font-semibold text-ink">{appName}</div>
      <p className="max-w-72 text-[13px] leading-relaxed text-ink-2">{blurb}</p>
      <span className="mt-1 rounded-full bg-ph px-3 py-1 text-[11px] font-medium text-ink-2">
        Arriving in build phase
        {" "}
        {phase}
      </span>
    </div>
  );
}
