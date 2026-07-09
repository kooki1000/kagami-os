export interface ContextMenuEntry {
  label: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
  dividerAfter?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  header?: string;
  entries: ContextMenuEntry[];
  onClose: () => void;
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
          <div key={entry.label}>
            <button
              type="button"
              disabled={entry.disabled}
              className={`block w-full rounded-btn px-2.5 py-1 text-left text-[13px] ${
                entry.disabled
                  ? "text-ink-2 opacity-50"
                  : entry.danger
                    ? "text-accent-2 hover:bg-accent-2 hover:text-white"
                    : "text-ink hover:bg-accent hover:text-white"
              }`}
              onClick={() => {
                if (entry.disabled)
                  return;
                entry.run();
                onClose();
              }}
            >
              {entry.label}
            </button>
            {entry.dividerAfter && <div className="mx-2 my-1 hairline-b" />}
          </div>
        ))}
      </div>
    </>
  );
}
