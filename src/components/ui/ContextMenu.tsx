import type { RefObject } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { useOverlayOpen } from "@/system/overlay/overlayRegistry";

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

/** Keeps a fixed-position box fully inside the viewport, ~8px from any edge. */
function clamp(anchor: number, size: number, viewport: number, margin = 8): number {
  return Math.max(margin, Math.min(anchor, viewport - size - margin));
}

/**
 * Measures `ref`'s real size once mounted and clamps `anchor` against the
 * viewport — shared by the top-level menu and its submenu, both of which
 * render at a raw point first, then correct once the true size is known.
 */
function useClampedPosition<T extends HTMLElement>(
  ref: RefObject<T | null>,
  anchor: { left: number; top: number } | null,
  active: boolean,
): { left: number; top: number } | null {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!active || !anchor)
      return;
    const el = ref.current;
    if (!el)
      return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: clamp(anchor.left, width, window.innerWidth),
      top: clamp(anchor.top, height, window.innerHeight),
    });
  }, [active, anchor, ref]);

  return pos;
}

function EntryRow({ entry, onClose }: {
  entry: ContextMenuEntry;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Raw anchor point captured at click time (never overwritten by the
  // clamped result below), so the correction effect has a stable,
  // non-circular dependency to key off.
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(submenuRef, anchor, open);

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
        role="menuitem"
        disabled={entry.disabled}
        aria-haspopup={entry.children ? "menu" : undefined}
        aria-expanded={entry.children ? open : undefined}
        className={rowClass}
        onClick={(e) => {
          if (entry.disabled)
            return;
          if (entry.children) {
            const rect = e.currentTarget.getBoundingClientRect();
            setAnchor({ left: rect.right, top: rect.top });
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
      {entry.children && open && anchor && createPortal(
        // Portaled to <body>: this flyout's viewport-relative coordinates
        // need to escape the parent menu's own `overflow-y: auto` +
        // `max-height` clamp (for menus taller than the viewport), which
        // would otherwise clip it.
        <div
          ref={submenuRef}
          role="menu"
          className="fixed z-50 min-w-44 overflow-y-auto rounded-[10px] p-1 shadow-(--shadow-deep) chrome hairline"
          style={{
            left: (pos ?? anchor).left,
            top: (pos ?? anchor).top,
            maxHeight: "calc(100vh - 16px)",
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
  useOverlayOpen(true);
  const menuRef = useFocusTrap<HTMLDivElement>({ active: true, onClose, trapFocus: false });
  // Render at the raw point first, then correct once measured — replaces
  // the old hardcoded `y > innerHeight - 200` / `innerWidth - 190` guesses,
  // which didn't match the real rendered menu.
  const anchor = useMemo(() => ({ left: x, top: y }), [x, y]);
  const pos = useClampedPosition(menuRef, anchor, true) ?? anchor;

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
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        className="fixed z-50 min-w-44 overflow-y-auto rounded-[10px] p-1 shadow-(--shadow-deep) chrome hairline"
        style={{
          left: pos.left,
          top: pos.top,
          maxHeight: "calc(100vh - 16px)",
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
