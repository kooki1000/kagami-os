import { useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuEntry {
  label: string;
  /** Omit when `children` makes this a submenu opener instead of a leaf. */
  run?: () => void;
  disabled?: boolean;
  danger?: boolean;
  dividerAfter?: boolean;
  /** Presence turns this row into an "Open With ▸"-style flyout opener. */
  children?: ContextMenuEntry[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  header?: string;
  entries: ContextMenuEntry[];
  onClose: () => void;
}

const SUBMENU_WIDTH = 176; // matches min-w-44

function EntryRow({ entry, onClose }: {
  entry: ContextMenuEntry;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; upward: boolean } | null>(null);

  const rowClass = `block w-full rounded-btn px-2.5 py-1 text-left text-[13px] ${
    entry.disabled
      ? "text-ink-2 opacity-50"
      : entry.danger
        ? "text-accent-2 hover:bg-accent-2 hover:text-white"
        : "text-ink hover:bg-accent hover:text-white"
  }`;

  return (
    <div key={entry.label} className="relative">
      <button
        type="button"
        disabled={entry.disabled}
        className={rowClass}
        onClick={(e) => {
          if (entry.disabled)
            return;
          if (entry.children) {
            const rect = e.currentTarget.getBoundingClientRect();
            const overflowsRight = rect.right + SUBMENU_WIDTH > window.innerWidth;
            setPos({
              left: overflowsRight ? rect.left - SUBMENU_WIDTH : rect.right,
              top: rect.top,
              upward: rect.top > window.innerHeight - 200,
            });
            setOpen(o => !o);
            return;
          }
          entry.run?.();
          onClose();
        }}
      >
        {entry.label}
        {entry.children && <span className="float-right text-ink-2">▸</span>}
      </button>
      {entry.dividerAfter && <div className="mx-2 my-1 hairline-b" />}
      {entry.children && open && pos && createPortal(
        // Portaled to <body> rather than nested here: the top-level menu
        // gets `transform: translateY(-100%)` when it opens upward, and a
        // transformed ancestor becomes the containing block for any
        // `position: fixed` descendant (CSS spec, not a browser quirk) —
        // without the portal this flyout's viewport-relative coordinates
        // would be measured against that ancestor instead and render
        // off-screen whenever the parent menu happens to open upward.
        <div
          className="fixed z-50 min-w-44 rounded-[10px] p-1 shadow-(--shadow-deep) chrome hairline"
          style={{
            left: pos.left,
            top: pos.upward ? pos.top - 6 : pos.top + 2,
            transform: pos.upward ? "translateY(-100%)" : undefined,
          }}
        >
          {entry.children.map(child => (
            <EntryRow key={child.label} entry={child} onClose={onClose} />
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Floating right-click menu in the shell chrome style. */
export function ContextMenu({ x, y, header, entries, onClose }: ContextMenuProps) {
  const openUpward = y > window.innerHeight - 200;
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 min-w-44 rounded-[10px] p-1 shadow-(--shadow-deep) chrome hairline"
        style={{
          left: Math.min(x, window.innerWidth - 190),
          top: openUpward ? y - 6 : y + 2,
          transform: openUpward ? "translateY(-100%)" : undefined,
        }}
      >
        {header && (
          <div className="px-2.5 py-1 text-[11px] font-semibold text-ink-2">
            {header}
          </div>
        )}
        {entries.map(entry => (
          <EntryRow key={entry.label} entry={entry} onClose={onClose} />
        ))}
      </div>
    </>
  );
}
