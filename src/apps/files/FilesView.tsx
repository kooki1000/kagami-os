import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import type { SortKey, SortSpec } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RenameInput } from "@/components/ui/RenameInput";
import { formatBytes, formatModified } from "@/lib/format";
import { nodeLabelById } from "@/system/fs/nodeLabels";
import { draggedNodeIds, hasExternalFiles, hasNodeDrag, startNodeDrag } from "./dnd";
import { fileBytes, nodeKind } from "./fileMeta";
import { chunkIntoRows, gridColumnCount } from "./gridLayout";
import { NodeGlyph } from "./NodeGlyph";
import { Thumbnail } from "./Thumbnail";

export type SelectMode = "replace" | "toggle" | "range";
/** U14: "detail" is the new third mode — a sortable, multi-column table — alongside the existing icon grid and single-column list. */
export type FilesViewMode = "grid" | "list" | "detail";

/** Mouse movement (px) past which a background mousedown becomes a marquee drag rather than a plain click. */
const MARQUEE_ENGAGE_THRESHOLD_PX = 4;
/** Seed estimates for react-virtual before it measures real rendered sizes (`measureElement` below) — only affects initial scroll math, never final layout. */
const GRID_ROW_ESTIMATE_PX = 148;
const ROW_ESTIMATE_PX = 30;
const GRID_TILE_MIN_PX = 120;
const GRID_GAP_PX = 12;

export interface FilesViewProps {
  items: FsNode[];
  /** Every folder's rolled-up byte size (B8), computed once (`folderSizes(nodes)`, memoized per `nodes` identity) rather than per row — the list view's Size column looks folders up here instead of recursing inline. */
  folderSizes: Map<string, number>;
  view: FilesViewMode;
  /** Current sort — only consulted by the "detail" header to show the active column/direction. */
  sort: SortSpec;
  /** Fires when a "detail" column header is clicked (re-clicking the active column flips direction, same as `applySort`). */
  onSortColumn: (key: SortKey) => void;
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
  /** Return `false` to reject the name — see `RenameInput`'s `onCommit` contract (review-backlog #4). */
  onRenameCommit: (id: string, name: string) => boolean;
  onRenameCancel: () => void;
  onDropInto: (folderId: string, nodeIds: string[]) => void;
  /** A drag from the host OS was dropped onto this folder (B2 upload). */
  onUploadInto: (folderId: string, dataTransfer: DataTransfer) => void;
  /** The folder `onUploadInto` targets when a drop lands on the background. */
  cwdId: string;
  /** Exposes the scroll container so the parent's keyboard nav (B6) can read the live grid column count and scroll the cursor item into view. */
  registerContainer?: (el: HTMLDivElement | null) => void;
  /** U14: lets the parent's keyboard nav ask the virtualizer to bring an off-screen item into range before it queries the DOM for it. */
  registerScrollToId?: (fn: (id: string) => void) => void;
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

interface ColumnDef {
  key: "name" | "modified" | "kind" | "size";
  header: string;
  sortKey?: SortKey;
  /** Fixed track width; omitted for the flexible name column. */
  widthPx?: number;
  align?: "right";
}

// Shared by "list" and "detail" — both show the same Name/Modified/Kind/Size
// columns (matching the original pre-virtualization list view's columns, an
// existing contract e2e specs assert on); "detail" additionally wires the
// sortable columns' headers to `onSortColumn`, "list"'s headers stay plain
// labels, same as the original static `<th>`s.
const TABLE_COLUMNS: ColumnDef[] = [
  { key: "name", header: "Name", sortKey: "name" },
  { key: "modified", header: "Modified", sortKey: "date", widthPx: 112 },
  { key: "kind", header: "Kind", sortKey: "kind", widthPx: 96 },
  { key: "size", header: "Size", widthPx: 80, align: "right" },
];

function gridTemplateFor(columns: ColumnDef[]): string {
  return columns.map(c => (c.widthPx ? `${c.widthPx}px` : "minmax(0,1fr)")).join(" ");
}

/** Grid (icon), list, and detail (sortable column table) presentation of one folder's children — all three virtualized (U14/T7). */
export function FilesView(props: FilesViewProps) {
  const {
    items,
    folderSizes,
    view,
    sort,
    onSortColumn,
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
    registerScrollToId,
  } = props;

  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [draggingOverBackground, setDraggingOverBackground] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const itemsRef = useRef(new Map<string, HTMLElement>());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  // Imperative cleanup for the marquee's document-level listeners, so a
  // FilesView unmount mid-drag (e.g. ⌘W while the button is still held)
  // doesn't leave them attached forever (review-backlog #18) — they're
  // started outside React's effect lifecycle (from a mousedown handler), so
  // this is the only hook available to tear them down on unmount.
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanupRef.current?.(), []);

  // Tracks the container's live width so `gridColumnCount` can compute columns
  // without a rendered grid to measure (see gridLayout.ts).
  useEffect(() => {
    const el = containerRef.current;
    if (!el)
      return;
    setContainerWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined)
        setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [view]);

  function setContainerRef(el: HTMLDivElement | null): void {
    containerRef.current = el;
    registerContainer?.(el);
  }

  const columns = view === "grid" ? gridColumnCount(containerWidth, GRID_TILE_MIN_PX, GRID_GAP_PX) : 1;
  const gridRows = useMemo(
    () => (view === "grid" ? chunkIntoRows(items, columns) : []),
    [view, items, columns],
  );

  const gridVirtualizer = useVirtualizer({
    count: view === "grid" ? gridRows.length : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => GRID_ROW_ESTIMATE_PX,
    overscan: 4,
  });
  const rowVirtualizer = useVirtualizer({
    count: view !== "grid" ? items.length : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 8,
  });

  // Re-registered every render (cheap — just updates a ref in the parent)
  // rather than memoized, so the closure below always sees the current
  // `items`/`columns`/virtualizer instances without a stale-closure bug.
  useEffect(() => {
    registerScrollToId?.((id: string) => {
      const flatIndex = items.findIndex(n => n.id === id);
      if (flatIndex === -1)
        return;
      if (view === "grid")
        gridVirtualizer.scrollToIndex(Math.floor(flatIndex / Math.max(columns, 1)), { align: "auto" });
      else
        rowVirtualizer.scrollToIndex(flatIndex, { align: "auto" });
    });
  });

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
        if (Math.abs(ev.clientX - originX) < MARQUEE_ENGAGE_THRESHOLD_PX && Math.abs(ev.clientY - originY) < MARQUEE_ENGAGE_THRESHOLD_PX)
          return;
        engaged = true;
        suppressClickRef.current = true;
      }
      apply(ev.clientX, ev.clientY);
    }
    function onUp(): void {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      dragCleanupRef.current = null;
      setMarquee(null);
      // Clear on a fresh tick regardless of where the drag ended
      // (review-backlog #18): if it ended outside this container, no click
      // ever arrives here to consume the flag, which would otherwise stick
      // and eat the next unrelated click. The `setTimeout` still lets a
      // same-container click see the flag as true first, so it can swallow
      // itself.
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    dragCleanupRef.current = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
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
        // Match onContextMenu below: dragging an item outside the current
        // selection replaces the selection with just that item, instead of
        // moving it alone while leaving the old selection's highlight
        // stale on screen (review-backlog #18).
        if (!selectedIds.has(node.id))
          onSelectNode(node, "replace");
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

  // Shared by all three layouts below (empty state, grid, list/detail) —
  // only the className and inner content differ per case.
  const containerProps = {
    "role": "listbox" as const,
    "aria-multiselectable": "true" as const,
    // axe's aria-input-field-name rule flags roving-tabindex listboxes with
    // no accessible name (H1 a11y audit).
    "aria-label": "Files",
    ...backgroundProps,
  };

  function labelDot(node: FsNode, sizePx: number) {
    const label = nodeLabelById(node.label);
    if (!label)
      return null;
    return (
      <span
        aria-hidden="true"
        className="flex-none rounded-full"
        style={{ width: sizePx, height: sizePx, backgroundColor: label.hex }}
      />
    );
  }

  /** The Name column/cell shared by list and detail rows — icon, label dot, name (or its `RenameInput`). */
  function nameCell(node: FsNode) {
    return (
      <span className="flex min-w-0 items-center gap-[calc(6px*var(--ui-scale))]">
        <NodeGlyph
          node={node}
          className={`size-[15px] flex-none ${node.type === "folder" ? "text-accent" : "text-ink-2"}`}
          strokeWidth={1.7}
        />
        {labelDot(node, 7)}
        {renamingId === node.id
          ? (
              <RenameInput
                value={node.name}
                selectStem={node.type === "file"}
                onCommit={name => onRenameCommit(node.id, name)}
                onCancel={onRenameCancel}
              />
            )
          : <span className="truncate text-ink">{node.name}</span>}
      </span>
    );
  }

  function rowCell(node: FsNode, col: ColumnDef) {
    switch (col.key) {
      case "name":
        return nameCell(node);
      case "modified":
        return <span className="truncate text-ink-2">{formatModified(node.modifiedAt)}</span>;
      case "kind":
        return <span className="truncate text-ink-2">{nodeKind(node)}</span>;
      case "size":
        return (
          <span className="truncate text-right text-ink-2">
            {formatBytes(node.type === "folder" ? (folderSizes.get(node.id) ?? 0) : fileBytes(node))}
          </span>
        );
    }
  }

  let content;
  if (items.length === 0) {
    content = (
      <div
        ref={setContainerRef}
        className={`grid flex-1 place-items-center text-13 text-ink-2 ${backgroundDropRing}`}
        {...containerProps}
      >
        {emptyLabel}
      </div>
    );
  }
  else if (view === "grid") {
    content = (
      <div
        ref={setContainerRef}
        className={`flex-1 overflow-auto ${backgroundDropRing}`}
        {...containerProps}
      >
        <div style={{ position: "relative", height: gridVirtualizer.getTotalSize(), width: "100%" }}>
          {gridVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowItems = gridRows[virtualRow.index] ?? [];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={gridVirtualizer.measureElement}
                className="absolute top-0 left-0 grid w-full auto-rows-min grid-cols-[repeat(auto-fill,minmax(120px,1fr))] content-start gap-3 px-3.5 py-1.5"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {rowItems.map((node, col) => {
                  const flatIndex = virtualRow.index * columns + col;
                  const selected = selectedIds.has(node.id);
                  return (
                    <div
                      key={node.id}
                      className={`flex cursor-default flex-col gap-[calc(6px*var(--ui-scale))] rounded-[11px] p-1.5 ${
                        selected ? "bg-ph-2" : "hover:bg-ph"
                      } ${cutIds.has(node.id) ? "opacity-45" : ""}`}
                      {...itemProps(node, flatIndex)}
                    >
                      <div
                        className={`grid aspect-4/3 place-items-center overflow-hidden rounded-[9px] bg-ph hairline ${
                          dropFolderId === node.id ? "ring-2 ring-accent" : ""
                        }`}
                      >
                        <Thumbnail node={node} />
                      </div>
                      <span className="flex items-center justify-center gap-[calc(4px*var(--ui-scale))]">
                        {labelDot(node, 6)}
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
                                className={`truncate text-center text-12 font-medium ${
                                  selected ? "text-ink" : "text-ink-2"
                                }`}
                              >
                                {node.name}
                              </span>
                            )}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  else {
    const gridTemplate = gridTemplateFor(TABLE_COLUMNS);
    content = (
      <div
        ref={setContainerRef}
        className={`flex-1 overflow-auto ${backgroundDropRing}`}
        {...containerProps}
      >
        <div
          className="sticky top-0 z-10 grid gap-x-3 bg-surface px-4 py-[calc(6px*var(--ui-scale))] text-11 text-ink-2 select-none hairline-b"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {TABLE_COLUMNS.map(col =>
            // "detail" wires sortable columns' headers to `onSortColumn`;
            // "list" keeps a plain, non-interactive label — same as the
            // original static `<th>`s it replaces.
            (view === "detail" && col.sortKey
              ? (
                  <button
                    key={col.key}
                    type="button"
                    role="columnheader"
                    className={`flex items-center gap-0.5 truncate text-left font-medium hover:text-ink ${
                      col.align === "right" ? "justify-end" : ""
                    } ${sort.key === col.sortKey ? "text-ink" : ""}`}
                    onClick={() => onSortColumn(col.sortKey!)}
                  >
                    {col.header}
                    {sort.key === col.sortKey
                      && (sort.dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
                  </button>
                )
              : (
                  <span
                    key={col.key}
                    role="columnheader"
                    className={`truncate font-medium ${col.align === "right" ? "text-right" : ""}`}
                  >
                    {col.header}
                  </span>
                )),
          )}
        </div>
        <div style={{ position: "relative", height: rowVirtualizer.getTotalSize(), width: "100%" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const node = items[virtualRow.index];
            if (!node)
              return null;
            const selected = selectedIds.has(node.id);
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                className={`absolute top-0 left-0 grid w-full cursor-default items-center gap-x-3 px-4 py-[calc(6px*var(--ui-scale))] text-12.5 ${
                  selected ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]" : "hover:bg-ph"
                } ${dropFolderId === node.id ? "outline-1 -outline-offset-1 outline-accent" : ""} ${
                  cutIds.has(node.id) ? "opacity-45" : ""
                }`}
                style={{ gridTemplateColumns: gridTemplate, transform: `translateY(${virtualRow.start}px)` }}
                {...itemProps(node, virtualRow.index)}
                ref={(el) => {
                  // Two independent refs need the same DOM node: react-virtual's
                  // dynamic size measurement, and the marquee hit-test map
                  // `itemProps` normally wires up on its own — an explicit
                  // `ref` after the `itemProps` spread wins over its `ref`, so
                  // this calls both instead of silently dropping one.
                  rowVirtualizer.measureElement(el);
                  registerItemRef(node.id)(el);
                }}
              >
                {TABLE_COLUMNS.map(col => (
                  <span key={col.key} role="cell" className="min-w-0">{rowCell(node, col)}</span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {content}
      {marqueeOverlay}
    </>
  );
}
