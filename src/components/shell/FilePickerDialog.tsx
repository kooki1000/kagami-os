import type { FsNode } from "@/system/fs/types";
import { ChevronLeft, File as FileIcon, Folder } from "lucide-react";
import { useState } from "react";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { formatBytes } from "@/lib/format";
import { useWindowFilesStore } from "@/system/apps/windowFilesStore";
import { childrenOf, fileBytes, useFsStore } from "@/system/fs/fsStore";
import { effectiveMimeType, mimeMatchesPattern } from "@/system/fs/mimeTypes";
import { APPS_ID, ROOT_ID, TRASH_ID } from "@/system/fs/types";
import { useOverlayOpen } from "@/system/overlay/overlayRegistry";

/** Folders a picker never lists: the Trash, and the installed apps' own bundles. */
const HIDDEN_FOLDER_IDS: readonly string[] = [TRASH_ID, APPS_ID];

function accepts(patterns: readonly string[], node: FsNode): boolean {
  return patterns.length === 0 || patterns.some(pattern => mimeMatchesPattern(pattern, effectiveMimeType(node)));
}

/**
 * Step 17 (D8.11) — the shell-drawn file picker behind `fs.pick`. The frame
 * never sees this UI or the tree behind it; it learns only which single file
 * the user chose. Naming the asking app in the header is what lets the user
 * tell the shell is asking, not the page.
 */
export function FilePickerDialog() {
  const pending = useWindowFilesStore(s => s.pending);
  if (!pending)
    return null;
  // Keyed per request so folder state never leaks from one ask to the next.
  return <PickerPanel key={pending.windowId} appName={pending.appName} accept={pending.accept} />;
}

function PickerPanel({ appName, accept }: { appName: string; accept: string[] }) {
  const settle = useWindowFilesStore(s => s.settle);
  const nodes = useFsStore(s => s.nodes);
  const [folderId, setFolderId] = useState(ROOT_ID);
  const panelRef = useFocusTrap<HTMLDivElement>({ active: true, onClose: () => settle(null), trapFocus: true });
  useOverlayOpen(true);

  const folder = nodes[folderId] ?? nodes[ROOT_ID];
  const entries = childrenOf(nodes, folder?.id ?? ROOT_ID).filter(n => !HIDDEN_FOLDER_IDS.includes(n.id));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onPointerDown={() => settle(null)} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a file for ${appName}`}
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(80vh,480px)] w-[min(90vw,420px)] -translate-1/2 flex-col overflow-hidden rounded-window shadow-(--shadow-deep) chrome hairline"
      >
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-13 font-semibold text-ink">{`${appName} wants to open a file`}</h2>
          <p className="mt-0.5 text-11.5 text-ink-2">It can read only the one you choose.</p>
        </div>
        <div className="flex items-center gap-1 px-3 py-1.5 hairline-t">
          <button
            type="button"
            aria-label="Up one folder"
            disabled={!folder?.parentId}
            className="grid size-6 flex-none place-items-center rounded-btn text-ink-2 hover:bg-ph disabled:opacity-30"
            onClick={() => folder?.parentId && setFolderId(folder.parentId)}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="truncate text-12 font-medium text-ink">{folder?.name}</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {entries.length === 0 && <li className="px-3 py-4 text-12 text-ink-2">Nothing here.</li>}
          {entries.map((node) => {
            const isFolder = node.type === "folder";
            const selectable = isFolder || accepts(accept, node);
            return (
              <li key={node.id}>
                <button
                  type="button"
                  disabled={!selectable}
                  className="flex w-full items-center gap-2 rounded-btn px-3 py-[calc(6px*var(--ui-scale))] text-left text-12 text-ink hover:bg-ph disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={() => (isFolder ? setFolderId(node.id) : settle(node.id))}
                >
                  {isFolder ? <Folder size={14} className="flex-none" /> : <FileIcon size={14} className="flex-none" />}
                  <span className="min-w-0 flex-1 truncate">{node.name}</span>
                  {!isFolder && <span className="flex-none text-11 text-ink-2">{formatBytes(fileBytes(node))}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end px-5 py-3 hairline-t">
          <button
            type="button"
            className="rounded-btn bg-ph px-3 py-[calc(6px*var(--ui-scale))] text-12 font-medium text-ink hover:bg-ph-2"
            onClick={() => settle(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
