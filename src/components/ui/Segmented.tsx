export interface SegmentOption<T> {
  value: T;
  label: string;
  /** Tooltip for options whose label has to stay short to fit. */
  title?: string;
}

/** Compact enough for a 150px sidebar; `md` is the default control size. */
const SIZES = {
  md: "rounded-btn px-3 py-[calc(6px*var(--ui-scale))] text-12",
  sm: "rounded-[5px] px-1.5 py-0.5 text-[calc(10px*var(--ui-scale))]",
} as const;

/** A pill segmented control — shared by Settings, Clock and Notes. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  width,
  size = "md",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  width?: number;
  size?: keyof typeof SIZES;
}) {
  return (
    <div className={`flex bg-ph ${size === "sm" ? "gap-0.5 rounded-btn p-0.5" : "rounded-[9px] p-0.75"}`} style={{ width }}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          className={`flex-1 transition-colors ${SIZES[size]} ${
            value === option.value
              // --shadow-chip, not a raw black: the same rgba under a light
              // chip on a dark surface reads as a smudge rather than a lift,
              // so the token carries a different value per theme.
              ? "bg-surface font-semibold text-ink shadow-(--shadow-chip)"
              : "font-medium text-ink-2 hover:text-ink"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
