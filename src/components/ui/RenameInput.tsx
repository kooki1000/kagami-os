import { useEffect, useRef } from "react";
import { nameStem } from "@/lib/format";

interface RenameInputProps {
  value: string;
  /** Preselect only the name stem (keep the ".ext" suffix out of selection). */
  selectStem?: boolean;
  className?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/** Inline rename field used by Files items and Notes' sidebar. */
export function RenameInput({ value, selectStem = false, className = "", onCommit, onCancel }: RenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input)
      return;
    input.focus();
    input.setSelectionRange(0, selectStem ? nameStem(value).length : value.length);
  }, [value, selectStem]);

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      className={`w-full rounded-[5px] bg-surface px-1 py-0.5 text-[12px] text-ink ring-1 ring-accent outline-none ${className}`}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter")
          onCommit(e.currentTarget.value);
        else if (e.key === "Escape")
          onCancel();
      }}
      onBlur={e => onCommit(e.target.value)}
    />
  );
}
