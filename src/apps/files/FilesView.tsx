import type { DragEvent, MouseEvent } from "react";
import type { FsNode } from "@/system/fs/types";
import { useState } from "react";
import { RenameInput } from "@/components/ui/RenameInput";
import { formatModified } from "@/lib/format";
import { draggedNodeId, hasNodeDrag, startNodeDrag } from "./dnd";
import { isImageNode, nodeKind } from "./fileMeta";
import { NodeGlyph } from "./NodeGlyph";

export interface FilesViewProps {
  items: FsNode[];
  view: "grid" | "list";
  selectedId: string | null;
  renamingId: string | null;
  emptyLabel: string;
  onSelect: (id: string | null) => void;
  onOpen: (node: FsNode) => void;
  onItemContextMenu: (e: MouseEvent, node: FsNode) => void;
  onBackgroundContextMenu: (e: MouseEvent) => void;
  onRenameCommit: (id: string, name: string) => void;
  onRenameCancel: () => void;
  onDropInto: (folderId: string, nodeId: string) => void;
}

/** Grid (icon) and list presentation of one folder's children. */
export function FilesView(props: FilesViewProps) {
  const {
    items,
    view,
    selectedId,
    renamingId,
    emptyLabel,
    onSelect,
    onOpen,
    onItemContextMenu,
    onBackgroundContextMenu,
    onRenameCommit,
    onRenameCancel,
    onDropInto,
  } = props;

  const [dropFolderId, setDropFolderId] = useState<string | null>(null);

  function dropHandlers(node: FsNode) {
    if (node.type !== "folder")
      return {};
    return {
      onDragOver: (e: DragEvent) => {
        if (!hasNodeDrag(e))
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
        const dragged = draggedNodeId(e);
        if (dragged && dragged !== node.id)
          onDropInto(node.id, dragged);
      },
    };
  }

  function itemProps(node: FsNode) {
    return {
      draggable: renamingId !== node.id,
      onDragStart: (e: DragEvent) => startNodeDrag(e, node.id),
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        onSelect(node.id);
      },
      onDoubleClick: () => onOpen(node),
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(node.id);
        onItemContextMenu(e, node);
      },
      ...dropHandlers(node),
    };
  }

  const backgroundProps = {
    onClick: () => onSelect(null),
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      onBackgroundContextMenu(e);
    },
  };

  if (items.length === 0) {
    return (
      <div
        className="grid flex-1 place-items-center text-[13px] text-ink-2"
        {...backgroundProps}
      >
        {emptyLabel}
      </div>
    );
  }

  if (view === "grid") {
    return (
      <div
        className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(120px,1fr))] content-start gap-3 overflow-auto p-3.5"
        {...backgroundProps}
      >
        {items.map((node) => {
          const selected = selectedId === node.id;
          return (
            <div
              key={node.id}
              className={`flex cursor-default flex-col gap-1.5 rounded-[11px] p-1.5 ${
                selected ? "bg-ph-2" : "hover:bg-ph"
              }`}
              {...itemProps(node)}
            >
              <div
                className={`grid aspect-4/3 place-items-center overflow-hidden rounded-[9px] bg-ph hairline ${
                  dropFolderId === node.id ? "ring-2 ring-accent" : ""
                }`}
              >
                {isImageNode(node) && node.content
                  ? (
                      <img
                        src={node.content}
                        alt={node.name}
                        draggable={false}
                        className="size-full object-cover"
                      />
                    )
                  : (
                      <NodeGlyph
                        node={node}
                        className={`size-8 ${node.type === "folder" ? "text-accent" : "text-ink-2"}`}
                        strokeWidth={1.4}
                      />
                    )}
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
    );
  }

  return (
    <div className="flex-1 overflow-auto" {...backgroundProps}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] text-ink-2">
            <th className="px-4 py-1.5 font-medium hairline-b">Name</th>
            <th className="w-28 px-2 py-1.5 font-medium hairline-b">Modified</th>
            <th className="w-28 px-2 py-1.5 font-medium hairline-b">Kind</th>
          </tr>
        </thead>
        <tbody>
          {items.map((node) => {
            const selected = selectedId === node.id;
            return (
              <tr
                key={node.id}
                className={`cursor-default ${
                  selected ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]" : "hover:bg-ph"
                } ${dropFolderId === node.id ? "outline-1 -outline-offset-1 outline-accent" : ""}`}
                {...itemProps(node)}
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
