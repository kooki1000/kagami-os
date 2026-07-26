const SWITCH_SIZES = {
  md: { track: "h-[calc(18px*var(--ui-scale))] w-8", knob: "size-[calc(14px*var(--ui-scale))]", knobOn: "left-4" },
  sm: { track: "h-[calc(16px*var(--ui-scale))] w-7", knob: "size-[calc(12px*var(--ui-scale))]", knobOn: "left-3.5" },
} as const;

/** A pill toggle switch — shared by Settings and Welcome. */
export function Switch({
  checked,
  onChange,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  size?: keyof typeof SWITCH_SIZES;
}) {
  const s = SWITCH_SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative ${s.track} flex-none rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-ph"
      }`}
    >
      <span
        className={`absolute top-0.5 ${s.knob} rounded-full bg-white transition-[left] ${
          checked ? s.knobOn : "left-0.5"
        }`}
      />
    </button>
  );
}
