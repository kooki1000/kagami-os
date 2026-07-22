import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import type { NodeMap } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import { useRef, useState } from "react";
import { RenameInput } from "@/components/ui/RenameInput";
import { formatBytes, formatModified } from "@/lib/format";
import { useBlobUrl } from "@/system/fs/useBlobUrl";
import { draggedNodeIds, hasExternalFiles, hasNodeDrag, startNodeDrag } from "./dnd";
import { isImageNode, nodeKind, nodeSize } from "./fileMeta";
import { NodeGlyph } from "./NodeGlyph";

export type SelectMode = "replace" | "toggle" | "range";

export interface FilesViewProps {
  items: FsNode[];
  /** Full tree, for the list view's Size column (B8) — folder sizes are a recursive rollup, so they need more than just the visible `items`. */
  nodes: NodeMap;
  view: "grid" | "list";
  selectedIds: Set<string>;
  /** The roving keyboard-nav cursor (B6) — exactly the item matching this id is a Tab stop; every other item is `tabIndex={-1}` (review-backlog #8). */
  cursorId: string | null;
  /** Items staged as a Finder-style Cut (B5) — rendered dimmed until pasted or replaced. */
  cutIds: Set<string>;
  renamingId: string | null;
  emptyLabel: string;
  onSelectNode: (node: FsNode, mode: SelectMode) => void;
  onClearSelection: () => void;
  onMarqueeSelect: (ids: Set<string>) => void;
  onOpen: (node: FsNode) => void;
  onItemContextMenu: (e: ReactMouseEvent, node: FsNode) => void;
  onBackgroundContextMenu: (e: ReactMouseEvent) => void;
  onRenameCommit: (id: string, name: string) => void;
  onRenameCancel: () => void;
  onDropInto: (folderId: string, nodeIds: string[]) => void;
  /** A drag from the host OS was dropped onto this folder (B2 upload). */
  onUploadInto: (folderId: string, dataTransfer: DataTransfer) => void;
  /** The folder `onUploadInto` targets when a drop lands on the background. */
  cwdId: string;
  /** Exposes the scroll container so the parent's keyboard nav (B6) can read the live grid column count and scroll the cursor item into view. */
  registerContainer?: (el: HTMLDivElement | null) => void;
}

/** Grid-view image preview: an uploaded/blob-backed image, or inline data URL. */
function Thumbnail({ node }: { node: FsNode }) {
  const blobUrl = useBlobUrl(node.contentRef);
  const src = node.content ?? blobUrl;
  if (isImageNode(node) && src) {
    return (
      <img
        src={src}
        alt={node.name}
        draggable={false}
        className="size-full object-cover"
      />
    );
  }
  return (
    <NodeGlyph
      node={node}
      className={`size-8 ${node.type === "folder" ? "text-accent" : "text-ink-2"}`}
      strokeWidth={1.4}
    />
  );
}

interface MarqueeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function rectsOverlap(a: MarqueeRect, b: DOMRect): boolean {
  const left = Math.min(a.x0, a.x1);
  const right = Math.max(a.x0, a.x1);
  const top = Math.min(a.y0, a.y1);
  const bottom = Math.max(a.y0, a.y1);
  return b.left < right && b.right > left && b.top < bottom && b.bottom > top;
}

/** Grid (icon) and list presentation of one folder's children. */
export function FilesView(props: FilesViewProps) {
  const {
    items,
    nodes,
    view,
    selectedIds,
    cursorId,
    cutIds,
    renamingId,
    emptyLabel,
    onSelectNode,
    onClearSelection,
    onMarqueeSelect,
    onOpen,
    onItemContextMenu,
    onBackgroundContextMenu,
    onRenameCommit,
    onRenameCancel,
    onDropInto,
    onUploadInto,
    cwdId,
    registerContainer,
  } = props;

  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [draggingOverBackground, setDraggingOverBackground] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const itemsRef = useRef(new Map<string, HTMLElement>());
  const suppressClickRef = useRef(false);

  function registerItemRef(id: string) {
    return (el: HTMLElement | null) => {
      if (el)
        itemsRef.current.set(id, el);
      else itemsRef.current.delete(id);
    };
  }

  /** Rubber-band select: drag on the empty background to select everything it crosses. */
  function beginMarquee(e: ReactMouseEvent): void {
    if (e.button !== 0)
      return;
    const additive = e.metaKey || e.ctrlKey || e.shiftKey;
    const base = additive ? new Set(selectedIds) : new Set<string>();
    const originX = e.clientX;
    const originY = e.clientY;
    let engaged = false;

    function apply(x1: number, y1: number): void {
      const rect: MarqueeRect = { x0: originX, y0: originY, x1, y1 };
      setMarquee(rect);
      const hits = new Set(base);
      for (const [id, el] of itemsRef.current) {
        if (rectsOverlap(rect, el.getBoundingClientRect()))
          hits.add(id);
      }
      onMarqueeSelect(hits);
    }

    function onMove(ev: globalThis.MouseEvent): void {
      if (!engaged) {
        if (Math.abs(ev.clientX - originX) < 4 && Math.abs(ev.clientY - originY) < 4)
          return;
        engaged = true;
        suppressClickRef.current = true;
      }
      apply(ev.clientX, ev.clientY);
    }
    function onUp(): void {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setMarquee(null);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function dropHandlers(node: FsNode) {
    if (node.type !== "folder")
      return {};
    return {
      onDragOver: (e: DragEvent) => {
        if (!hasNodeDrag(e) && !hasExternalFiles(e))
          return;
        e.preventDefault();
        e.stopPropagation();
        setDropFolderId(node.id);
      },
      onDragLeave: () =>
        setDropFolderId(current => (current === node.id ? null : current)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropFolderId(null);
        const dragged = draggedNodeIds(e);
        if (dragged.length > 0 && !dragged.includes(node.id))
          onDropInto(node.id, dragged);
        else if (hasExternalFiles(e))
          onUploadInto(node.id, e.dataTransfer);
      },
    };
  }

  // `index` only matters when nothing has a cursor yet (a freshly opened,
  // never-navigated folder) — it seeds the roving tab stop on the first item
  // instead of leaving every item at `tabIndex={-1}` and the list untabbable.
  function itemProps(node: FsNode, index: number) {
    const isCursorItem = cursorId ? node.id === cursorId : index === 0;
    return {
      "ref": registerItemRef(node.id),
      // Item names can collide with the sidebar's "Places" labels (e.g. a
      // folder named "Documents"), so give the item itself a stable,
      // unambiguous hook rather than relying on text content.
      "data-node-name": node.name,
      // Stable hook for the keyboard cursor (B6) to scroll itself into view.
      "data-node-id": node.id,
      "role": "option",
      "aria-selected": selectedIds.has(node.id),
      // Roving tabIndex (review-backlog #8): exactly one item is ever a Tab
      // stop, matching the ARIA listbox pattern.
      "tabIndex": isCursorItem ? 0 : -1,
      "draggable": renamingId !== node.id,
      "onMouseDown": (e: ReactMouseEvent) => e.stopPropagation(),
      "onDragStart": (e: DragEvent) => {
        const ids = selectedIds.has(node.id) && selectedIds.size > 1 ? [...selectedIds] : [node.id];
        startNodeDrag(e, ids);
      },
      "onClick": (e: ReactMouseEvent) => {
        e.stopPropagation();
        // Move real DOM focus onto the clicked item so the container's
        // keydown listener (bound to actual focus, not a window-level
        // gate) has something inside it to bubble from.
        (e.currentTarget as HTMLElement).focus();
        const mode: SelectMode = e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "toggle" : "replace";
        onSelectNode(node, mode);
      },
      "onDoubleClick": () => onOpen(node),
      "onContextMenu": (e: ReactMouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedIds.has(node.id))
          onSelectNode(node, "replace");
        onItemContextMenu(e, node);
      },
      ...dropHandlers(node),
    };
  }

  const backgroundProps = {
    onMouseDown: beginMarquee,
    onClick: () => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onClearSelection();
    },
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault();
      onBackgroundContextMenu(e);
    },
    // Folder tiles stop propagation on both events, so this only fires for
    // drops that land outside any tile — i.e. "upload into the open folder".
    onDragOver: (e: DragEvent) => {
      if (!hasExternalFiles(e))
        return;
      e.preventDefault();
      setDraggingOverBackground(true);
    },
    onDragLeave: () => setDraggingOverBackground(false),
    onDrop: (e: DragEvent) => {
      if (!hasExternalFiles(e))
        return;
      e.preventDefault();
      setDraggingOverBackground(false);
      onUploadInto(cwdId, e.dataTransfer);
    },
  };
  const backgroundDropRing = draggingOverBackground
    ? "outline-2 -outline-offset-4 outline-dashed outline-accent/60"
    : "";

  const marqueeOverlay = marquee && (
    <div
      className="pointer-events-none fixed z-40 rounded-[3px] border border-accent bg-accent/10"
      style={{
        left: Math.min(marquee.x0, marquee.x1),
        top: Math.min(marquee.y0, marquee.y1),
        width: Math.abs(marquee.x1 - marquee.x0),
        height: Math.abs(marquee.y1 - marquee.y0),
      }}
    />
  );

  if (items.length === 0) {
    return (
      <>
        <div
          ref={registerContainer}
          role="listbox"
          aria-multiselectable="true"
          className={`grid flex-1 place-items-center text-[13px] text-ink-2 ${backgroundDropRing}`}
          {...backgroundProps}
        >
          {emptyLabel}
        </div>
        {marqueeOverlay}
      </>
    );
  }

  if (view === "grid") {
    return (
      <>
        <div
          ref={registerContainer}
          role="listbox"
          aria-multiselectable="true"
          className={`grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(120px,1fr))] content-start gap-3 overflow-auto p-3.5 ${backgroundDropRing}`}
          {...backgroundProps}
        >
          {items.map((node, index) => {
            const selected = selectedIds.has(node.id);
            return (
              <div
                key={node.id}
                className={`flex cursor-default flex-col gap-1.5 rounded-[11px] p-1.5 ${
                  selected ? "bg-ph-2" : "hover:bg-ph"
                } ${cutIds.has(node.id) ? "opacity-45" : ""}`}
                {...itemProps(node, index)}
              >
                <div
                  className={`grid aspect-4/3 place-items-center overflow-hidden rounded-[9px] bg-ph hairline ${
                    dropFolderId === node.id ? "ring-2 ring-accent" : ""
                  }`}
                >
                  <Thumbnail node={node} />
                </div>
                {renamingId === node.id
                  ? (
                      <RenameInput
                        value={node.name}
                        selectStem={node.type === "file"}
                        className="text-center"
                        onCommit={name => onRenameCommit(node.id, name)}
                        onCancel={onRenameCancel}
                      />
                    )
                  : (
                      <span
                        className={`truncate text-center text-[12px] font-medium ${
                          selected ? "text-ink" : "text-ink-2"
                        }`}
                      >
                        {node.name}
                      </span>
                    )}
              </div>
            );
          })}
        </div>
        {marqueeOverlay}
      </>
    );
  }

  return (
    <>
      <div
        ref={registerContainer}
        role="listbox"
        aria-multiselectable="true"
        className={`flex-1 overflow-auto ${backgroundDropRing}`}
        {...backgroundProps}
      >
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-ink-2">
              <th className="px-4 py-1.5 font-medium hairline-b">Name</th>
              <th className="w-28 px-2 py-1.5 font-medium hairline-b">Modified</th>
              <th className="w-24 px-2 py-1.5 font-medium hairline-b">Kind</th>
              <th className="w-20 px-2 py-1.5 text-right font-medium hairline-b">Size</th>
            </tr>
          </thead>
          <tbody>
            {items.map((node, index) => {
              const selected = selectedIds.has(node.id);
              return (
                <tr
                  key={node.id}
                  className={`cursor-default ${
                    selected ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]" : "hover:bg-ph"
                  } ${dropFolderId === node.id ? "outline-1 -outline-offset-1 outline-accent" : ""} ${
                    cutIds.has(node.id) ? "opacity-45" : ""
                  }`}
                  {...itemProps(node, index)}
                >
                  <td className="px-4 py-1.5">
                    <span className="flex items-center gap-2">
                      <NodeGlyph
                        node={node}
                        className={`size-[15px] flex-none ${
                          node.type === "folder" ? "text-accent" : "text-ink-2"
                        }`}
                        strokeWidth={1.7}
                      />
                      {renamingId === node.id
                        ? (
                            <RenameInput
                              value={node.name}
                              selectStem={node.type === "file"}
                              onCommit={name => onRenameCommit(node.id, name)}
                              onCancel={onRenameCancel}
                            />
                          )
                        : (
                            <span className="truncate text-ink">{node.name}</span>
                          )}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-ink-2">{formatModified(node.modifiedAt)}</td>
                  <td className="px-2 py-1.5 text-ink-2">{nodeKind(node)}</td>
                  <td className="px-2 py-1.5 text-right text-ink-2">{formatBytes(nodeSize(nodes, node))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {marqueeOverlay}
    </>
  );
}
