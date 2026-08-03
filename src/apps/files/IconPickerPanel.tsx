import type { ReactNode } from "react";
import type { FsNode } from "@/system/fs/types";
import { createElement, useState } from "react";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { NODE_ICONS } from "@/system/fs/nodeIcons";
import { NODE_LABELS } from "@/system/fs/nodeLabels";
import { useOverlayOpen } from "@/system/overlay/overlayRegistry";
import { NodeGlyph } from "./NodeGlyph";

interface IconPickerPanelProps {
  /** The node whose icon is being edited — also the live preview subject. */
  node: FsNode;
  /**
   * Every node the change applies to. A multi-selection edits them all from
   * one panel; `node` is just the one whose current icon seeds the form.
   */
  targets: FsNode[];
  onApply: (iconGlyph: string | undefined, iconTint: string | undefined) => void;
  onClose: () => void;
}

/**
 * "Customize Icon…" — a glyph grid plus the tint swatch row, in the same
 * modal-panel shape as `NodeInfoPanel` (focus-trapped, overlay-registered,
 * click-outside to dismiss).
 *
 * A panel rather than a context submenu: 28 glyphs read as a grid and are
 * unusable as a 28-row flyout, and the tint needs to be visible *while*
 * choosing a glyph for the pairing to be judgeable. Selection is local state
 * so the preview updates live and nothing is committed until Apply — a
 * multi-selection would otherwise write once per keystroke of browsing.
 */
export function IconPickerPanel({ node, targets, onApply, onClose }: IconPickerPanelProps) {
  const panelRef = useFocusTrap<HTMLDivElement>({ active: true, onClose, trapFocus: true });
  useOverlayOpen(true);

  const [glyph, setGlyph] = useState(node.iconGlyph);
  const [tint, setTint] = useState(node.iconTint);

  // Clicking the active option again clears it, so "no custom glyph" and "no
  // tint" are reachable without hunting for a separate control.
  const toggleGlyph = (id: string) => setGlyph(current => (current === id ? undefined : id));
  const toggleTint = (id: string) => setTint(current => (current === id ? undefined : id));

  const multi = targets.length > 1;
  const preview: FsNode = { ...node, iconGlyph: glyph, iconTint: tint };

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={multi ? `Customize icon for ${targets.length} items` : `Customize icon for ${node.name}`}
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-50 w-[calc(300px*var(--ui-scale))] -translate-1/2 rounded-window p-4 shadow-(--shadow-deep) chrome hairline"
      >
        <div className="flex items-center gap-[calc(10px*var(--ui-scale))] pb-3.5">
          <NodeGlyph
            node={preview}
            className={`size-8 flex-none ${node.type === "folder" ? "text-accent" : "text-ink-2"}`}
            strokeWidth={1.4}
          />
          <span className="truncate text-13 font-semibold text-ink">
            {multi ? `${targets.length} items` : node.name}
          </span>
        </div>

        <Section label="Icon">
          <div role="radiogroup" aria-label="Icon" className="grid grid-cols-7 gap-1">
            {NODE_ICONS.map(option => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={glyph === option.id}
                aria-label={option.name}
                title={option.name}
                className={`grid aspect-square place-items-center rounded-btn transition-colors ${
                  glyph === option.id
                    ? "bg-(--accent)/16 text-accent"
                    : "text-ink-2 hover:bg-ph hover:text-ink"
                }`}
                onClick={() => toggleGlyph(option.id)}
              >
                {createElement(option.icon, {
                  className: "size-[calc(15px*var(--ui-scale))]",
                  strokeWidth: 1.6,
                })}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Tint">
          <div role="radiogroup" aria-label="Tint" className="flex flex-wrap gap-2">
            {NODE_LABELS.map(option => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={tint === option.id}
                aria-label={option.name}
                title={option.name}
                style={{ background: option.hex }}
                className={`size-[calc(20px*var(--ui-scale))] rounded-full border-[1.5px] border-black/10 ${
                  tint === option.id
                    ? "shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]"
                    : ""
                }`}
                onClick={() => toggleTint(option.id)}
              />
            ))}
          </div>
        </Section>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-none rounded-btn bg-ph px-3 py-[calc(6px*var(--ui-scale))] text-12 font-medium text-ink hover:bg-ph-2 disabled:opacity-40"
            disabled={glyph === undefined && tint === undefined}
            onClick={() => {
              setGlyph(undefined);
              setTint(undefined);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="flex-1 rounded-btn bg-accent-strong px-3 py-[calc(6px*var(--ui-scale))] text-12 font-semibold text-white"
            onClick={() => {
              onApply(glyph, tint);
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

/** A labelled block inside the panel — the prototype's uppercase mono section header. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pb-3">
      <div className="mb-2 font-mono text-[calc(9.5px*var(--ui-scale))] font-semibold tracking-[.5px] text-ink-2 uppercase opacity-70">
        {label}
      </div>
      {children}
    </div>
  );
}
