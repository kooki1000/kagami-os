export interface SegmentOption<T> {
  value: T;
  label: string;
}

/** A pill segmented control — shared by Settings and Clock. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  width,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  width?: number;
}) {
  return (
    <div className="flex rounded-[9px] bg-ph p-0.75" style={{ width }}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={`flex-1 rounded-btn px-3 py-[calc(6px*var(--ui-scale))] text-12 transition-colors ${
            value === option.value
              ? "bg-surface font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.14)]"
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
