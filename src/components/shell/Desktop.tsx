import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { ContextMenuEntry } from "@/components/ui/ContextMenu";
import type { FsNode } from "@/system/fs/types";
import { useMemo, useRef, useState } from "react";
import { useClipboardStore } from "@/apps/files/clipboardStore";
import { downloadMany } from "@/apps/files/download";
import { nodeSize } from "@/apps/files/fileMeta";
import { NodeGlyph } from "@/apps/files/NodeGlyph";
import { NodeInfoPanel } from "@/apps/files/NodeInfoPanel";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { RenameInput } from "@/components/ui/RenameInput";
import { launchApp } from "@/system/apps/launch";
import { appIdForFile, candidateAppsForFile, openFile, openFileWithApp } from "@/system/apps/openFile";
import { getApp } from "@/system/apps/registry";
import { autoPosition, clampIconPosition, DESKTOP_CELL_W } from "@/system/desktop/desktopLayout";
import { useDesktopLayoutStore } from "@/system/desktop/desktopLayoutStore";
import { blobStore } from "@/system/fs/blobStore";
import { childrenOf, isSystemNode, isValidNodeName, pathOf, useFsStore } from "@/system/fs/fsStore";
import { DESKTOP_ID } from "@/system/fs/types";
import { notify } from "@/system/notifications/notificationStore";
import { useWindowStore } from "@/system/windows/windowStore";

// B7: the Desktop folder's direct children rendered as icons on the
// wallpaper. Deliberately a lighter sibling of Files rather than a reuse of
// FilesView: single selection only (no marquee/multi-select), freeform
// pointer-drag repositioning instead of Files' HTML5 DnD (moving an icon
// onto another doesn't move it *into* that folder — a known scope cut).
// Presentational/logic pieces that don't carry FilesApp-local state
// (NodeGlyph, fileMeta, download, clipboardStore) are reused directly
// rather than duplicated.

const DRAG_THRESHOLD_PX = 4;

interface MenuState {
  x: number;
  y: number;
  node: FsNode | null;
}

interface DragState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

/** Wallpaper layer, including the Desktop folder's icons (B7). */
export function Desktop() {
  const blurAll = useWindowStore(s => s.blurAll);
  const viewport = useWindowStore(s => s.viewport);
  const nodes = useFsStore(s => s.nodes);
  const ready = useFsStore(s => s.ready);
  const rename = useFsStore(s => s.rename);
  const createFolder = useFsStore(s => s.createFolder);
  const move = useFsStore(s => s.move);
  const duplicate = useFsStore(s => s.duplicate);
  const moveToTrash = useFsStore(s => s.moveToTrash);
  const restoreFromTrash = useFsStore(s => s.restoreFromTrash);
  const positions = useDesktopLayoutStore(s => s.positions);
  const setPosition = useDesktopLayoutStore(s => s.setPosition);
  const clipboardIds = useClipboardStore(s => s.ids);
  const clipboardMode = useClipboardStore(s => s.mode);
  const setClipboard = useClipboardStore(s => s.setClipboard);
  const clearClipboard = useClipboardStore(s => s.clear);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [infoNode, setInfoNode] = useState<FsNode | null>(null);

  const dragRef = useRef<DragState | null>(null);

  const children = useMemo(
    () => (ready ? childrenOf(nodes, DESKTOP_ID) : []),
    [nodes, ready],
  );

  function positionFor(node: FsNode, index: number) {
    const stored = positions[node.id];
    return stored
      ? clampIconPosition(stored, viewport)
      : autoPosition(index, viewport.height);
  }

  function openNode(node: FsNode): void {
    if (node.type === "folder")
      launchApp("files", { payload: { folderId: node.id } });
    else openFile(node);
  }

  function newFolder(): void {
    const node = createFolder(DESKTOP_ID);
    setSelectedId(node.id);
    setRenamingId(node.id);
  }

  function trashWithUndo(node: FsNode): void {
    moveToTrash(node.id);
    setSelectedId(null);
    notify({
      title: "Moved to Trash",
      body: `“${node.name}” was moved to the Trash.`,
      appId: "files",
      action: { label: "Undo", run: () => restoreFromTrash(node.id) },
    });
  }

  async function handleDownload(node: FsNode): Promise<void> {
    try {
      await downloadMany([node], nodes, blobStore);
    }
    catch (error) {
      notify({
        title: "Download failed",
        body: error instanceof Error ? error.message : `“${node.name}” couldn’t be downloaded.`,
        tone: "danger",
      });
    }
  }

  function pasteClipboard(): void {
    if (clipboardIds.length === 0)
      return;
    const ids = clipboardIds.filter(id => nodes[id]);
    if (ids.length === 0) {
      clearClipboard();
      return;
    }
    let lastLanded: string | null = null;
    if (clipboardMode === "cut") {
      ids.forEach((id) => {
        if (move(id, DESKTOP_ID))
          lastLanded = id;
      });
      clearClipboard();
    }
    else {
      ids.forEach((id) => {
        const copy = duplicate(id, DESKTOP_ID);
        if (copy)
          lastLanded = copy.id;
      });
    }
    if (lastLanded)
      setSelectedId(lastLanded);
  }

  function commitRename(id: string, name: string): void {
    if (name.trim() && !isValidNodeName(name)) {
      notify({
        title: "Can’t rename",
        body: "Names can’t contain a slash (/).",
        tone: "danger",
      });
      return;
    }
    rename(id, name);
    setRenamingId(null);
  }

  function menuEntries(state: MenuState): ContextMenuEntry[] {
    const node = state.node;
    if (!node) {
      return [
        { label: "New Folder", run: newFolder, dividerAfter: true },
        { label: "Paste", run: pasteClipboard, disabled: clipboardIds.length === 0 },
      ];
    }
    const system = isSystemNode(node.id);
    const openWithCandidates = node.type === "folder" ? [] : candidateAppsForFile(node);
    const currentAppId = openWithCandidates.length ? appIdForFile(node) : null;
    return [
      { label: "Open", run: () => openNode(node) },
      ...(openWithCandidates.length
        ? [{
            label: "Open With",
            children: openWithCandidates.map(appId => ({
              label: `${appId === currentAppId ? "✓  " : "  "}${getApp(appId)?.name ?? appId}`,
              run: () => openFileWithApp(node, appId),
            })),
          }]
        : []),
      { label: "Copy", run: () => setClipboard([node.id], "copy") },
      { label: "Cut", run: () => setClipboard([node.id], "cut"), disabled: system, dividerAfter: true },
      {
        label: node.type === "folder" ? "Download as Zip" : "Download",
        run: () => handleDownload(node),
        dividerAfter: true,
      },
      { label: "Get Info", run: () => setInfoNode(node) },
      { label: "Rename", run: () => setRenamingId(node.id), disabled: system, dividerAfter: true },
      { label: "Move to Trash", run: () => trashWithUndo(node), disabled: system, danger: true },
    ];
  }

  function onIconPointerDown(e: ReactPointerEvent<HTMLDivElement>, node: FsNode, pos: { x: number; y: number }): void {
    if (e.button !== 0)
      return;
    // Stop the background handler from re-blurring/deselecting right after
    // this handler runs (it fires on the icon first, then would bubble) —
    // the blur is replicated below so the side effect still happens.
    e.stopPropagation();
    blurAll();
    setSelectedId(node.id);
    dragRef.current = {
      id: node.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onIconPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId)
      return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX)
      return;
    drag.moved = true;
    setPosition(
      drag.id,
      clampIconPosition({ x: drag.originX + dx, y: drag.originY + dy }, viewport),
    );
  }

  function onIconPointerUp(e: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId === e.pointerId)
      dragRef.current = null;
  }

  return (
    <div
      className="wallpaper z-0"
      onPointerDown={() => {
        blurAll();
        setSelectedId(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setSelectedId(null);
        setMenu({ x: e.clientX, y: e.clientY, node: null });
      }}
    >
      <div className="wallpaper-ring" />

      {ready && children.map((node, index) => {
        const pos = positionFor(node, index);
        return (
          <div
            key={node.id}
            data-desktop-icon={node.id}
            className="absolute flex flex-col items-center gap-1 select-none"
            style={{ left: pos.x, top: pos.y, width: DESKTOP_CELL_W }}
            onPointerDown={e => onIconPointerDown(e, node, pos)}
            onPointerMove={onIconPointerMove}
            onPointerUp={onIconPointerUp}
            onDoubleClick={() => openNode(node)}
            onContextMenu={(e: ReactMouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedId(node.id);
              setMenu({ x: e.clientX, y: e.clientY, node });
            }}
          >
            {renamingId === node.id
              ? (
                  <RenameInput
                    value={node.name}
                    selectStem={node.type === "file"}
                    className="text-center"
                    onCommit={name => commitRename(node.id, name)}
                    onCancel={() => setRenamingId(null)}
                  />
                )
              : (
                  <>
                    <div className={`grid size-12 place-items-center rounded-tile ${selectedId === node.id ? "bg-white/25" : ""}`}>
                      <NodeGlyph node={node} className="size-7 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.5)]" strokeWidth={1.4} />
                    </div>
                    <span
                      className={`max-w-full truncate rounded-[4px] px-1 text-[11px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,.6)] ${
                        selectedId === node.id ? "bg-accent" : ""
                      }`}
                    >
                      {node.name}
                    </span>
                  </>
                )}
          </div>
        );
      })}

      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries(menu)} onClose={() => setMenu(null)} />}

      {infoNode && (
        <NodeInfoPanel
          node={infoNode}
          size={nodeSize(nodes, infoNode)}
          location={infoNode.parentId
            ? pathOf(nodes, infoNode.parentId).slice(1).map(n => n.name).join(" / ")
            : ""}
          onClose={() => setInfoNode(null)}
        />
      )}
    </div>
  );
}
