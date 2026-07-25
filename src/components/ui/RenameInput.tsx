import { useEffect, useRef } from "react";
import { nameStem } from "@/lib/format";

interface RenameInputProps {
  value: string;
  /** Preselect only the name stem (keep the ".ext" suffix out of selection). */
  selectStem?: boolean;
  className?: string;
  /** Return `false` to reject the name and keep editing (review-backlog #4) — the field stays open and regains focus rather than sticking around unfocused. */
  onCommit: (name: string) => boolean;
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
      className={`w-full rounded-[5px] bg-surface px-1 py-[calc(2px*var(--ui-scale))] text-12 text-ink ring-1 ring-accent outline-none ${className}`}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter")
          onCommit(e.currentTarget.value);
        else if (e.key === "Escape")
          onCancel();
      }}
      onBlur={(e) => {
        // A rejected commit (review-backlog #4) means the caller left
        // `renamingId` set on purpose — refocus so the field doesn't sit
        // there editable but unfocused, silently re-firing on the next
        // stray blur.
        if (!onCommit(e.target.value))
          e.target.focus();
      }}
    />
  );
}
