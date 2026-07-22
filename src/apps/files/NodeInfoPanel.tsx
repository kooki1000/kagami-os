import type { FsNode } from "@/system/fs/types";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { formatBytes } from "@/lib/format";
import { useOverlayOpen } from "@/system/overlay/overlayRegistry";
import { nodeKind } from "./fileMeta";
import { NodeGlyph } from "./NodeGlyph";

interface NodeInfoPanelProps {
  node: FsNode;
  size: number;
  /** Breadcrumb path of the containing folder, e.g. "Home / Documents". */
  location: string;
  onClose: () => void;
}

/** "Get Info" (B8): name, kind, size, location, and timestamps for one item. */
export function NodeInfoPanel({ node, size, location, onClose }: NodeInfoPanelProps) {
  // Always "active" for the lifetime this component is mounted — the panel
  // unmounts entirely when closed, so there's no separate open/closed state
  // to track here (see review-backlog #6).
  const panelRef = useFocusTrap<HTMLDivElement>({ active: true, onClose, trapFocus: true });
  useOverlayOpen(true);

  const rows: [string, string][] = [
    ["Kind", nodeKind(node)],
    ["Size", node.type === "folder" ? `${formatBytes(size)} (rolled up)` : formatBytes(size)],
    ["Location", location],
    ["Created", new Date(node.createdAt).toLocaleString()],
    ["Modified", new Date(node.modifiedAt).toLocaleString()],
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${node.name} info`}
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-50 w-72 -translate-1/2 rounded-window p-4 shadow-(--shadow-deep) chrome hairline"
      >
        <div className="flex items-center gap-2.5 pb-3">
          <NodeGlyph
            node={node}
            className={`size-8 flex-none ${node.type === "folder" ? "text-accent" : "text-ink-2"}`}
            strokeWidth={1.4}
          />
          <span className="truncate text-[13px] font-semibold text-ink">{node.name}</span>
        </div>
        <dl className="space-y-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 text-[11.5px]">
              <dt className="flex-none text-ink-2">{label}</dt>
              <dd className="truncate text-right text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          className="mt-4 w-full rounded-btn bg-ph px-2 py-1.5 text-[12px] font-medium text-ink hover:bg-ph-2"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </>
  );
}
