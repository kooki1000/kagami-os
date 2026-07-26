import type { FsNode } from "@/system/fs/types";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { formatBytes } from "@/lib/format";
import { useOverlayOpen } from "@/system/overlay/overlayRegistry";
import { fileBytes, nodeKind } from "./fileMeta";
import { Thumbnail } from "./Thumbnail";

interface QuickLookOverlayProps {
  node: FsNode;
  onClose: () => void;
}

/**
 * U14 Quick Look (Space key): a large preview of the selected item, reusing
 * `Thumbnail`'s rendering (so an image shows the same source `<img>` Quick
 * Look and the grid tile both use) and `NodeInfoPanel`'s modal/focus-trap
 * pattern rather than inventing new overlay plumbing. Space (in addition to
 * Escape) closes it — mirrors the real macOS shortcut that opened it.
 */
export function QuickLookOverlay({ node, onClose }: QuickLookOverlayProps) {
  const panelRef = useFocusTrap<HTMLDivElement>({ active: true, onClose, trapFocus: true });
  useOverlayOpen(true);

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${node.name} quick look`}
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-50 flex max-h-[70vh] w-[min(70vw,560px)] -translate-1/2 flex-col overflow-hidden rounded-window shadow-(--shadow-deep) chrome hairline"
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <div className="grid min-h-56 flex-1 place-items-center overflow-hidden bg-ph p-6">
          <Thumbnail
            node={node}
            imgClassName="max-h-full max-w-full object-contain"
            glyphClassName={`size-20 ${node.type === "folder" ? "text-accent" : "text-ink-2"}`}
          />
        </div>
        <div className="flex flex-none items-center justify-between gap-3 px-4 py-[calc(10px*var(--ui-scale))] hairline-t">
          <span className="truncate text-13 font-semibold text-ink">{node.name}</span>
          <span className="flex-none text-11.5 text-ink-2">
            {nodeKind(node)}
            {node.type === "file" && ` · ${formatBytes(fileBytes(node))}`}
          </span>
        </div>
      </div>
    </>
  );
}
