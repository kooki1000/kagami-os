import type { LucideIcon } from "lucide-react";
import {
  Download,
  House,
  Image,
  Monitor,
  NotebookText,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  DESKTOP_ID,
  DOCUMENTS_ID,
  DOWNLOADS_ID,
  HOME_ID,
  PICTURES_ID,
  TRASH_ID,
} from "@/system/fs/types";
import { draggedNodeId, hasNodeDrag } from "./dnd";

const PLACES: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: HOME_ID, label: "Home", icon: House },
  { id: DESKTOP_ID, label: "Desktop", icon: Monitor },
  { id: DOCUMENTS_ID, label: "Documents", icon: NotebookText },
  { id: DOWNLOADS_ID, label: "Downloads", icon: Download },
  { id: PICTURES_ID, label: "Pictures", icon: Image },
];

interface SidebarItemProps {
  id: string;
  label: string;
  icon: LucideIcon;
  trailing?: string;
  active: boolean;
  isDropTarget: boolean;
  onNavigate: (id: string) => void;
  onDropNode: (targetFolderId: string, nodeId: string) => void;
  onDropHover: (id: string | null) => void;
}

function SidebarItem({
  id,
  label,
  icon,
  trailing,
  active,
  isDropTarget,
  onNavigate,
  onDropNode,
  onDropHover,
}: SidebarItemProps) {
  const Icon = icon;
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-[9px] rounded-[8px] px-[9px] py-1.5 text-left text-[12.5px] font-medium ${
        active
          ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-accent"
          : "text-ink-2 hover:bg-ph"
      } ${isDropTarget ? "ring-1 ring-accent" : ""}`}
      onClick={() => onNavigate(id)}
      onDragOver={(e) => {
        if (!hasNodeDrag(e))
          return;
        e.preventDefault();
        onDropHover(id);
      }}
      onDragLeave={() => onDropHover(null)}
      onDrop={(e) => {
        e.preventDefault();
        onDropHover(null);
        const nodeId = draggedNodeId(e);
        if (nodeId)
          onDropNode(id, nodeId);
      }}
    >
      <Icon className="size-[15px] opacity-80" strokeWidth={1.8} />
      <span className="flex-1">{label}</span>
      {trailing && <span className="text-[10.5px] opacity-60">{trailing}</span>}
    </button>
  );
}

interface FilesSidebarProps {
  cwd: string;
  trashCount: number;
  onNavigate: (id: string) => void;
  onDropNode: (targetFolderId: string, nodeId: string) => void;
}

export function FilesSidebar({ cwd, trashCount, onNavigate, onDropNode }: FilesSidebarProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const shared = {
    onNavigate,
    onDropNode,
    onDropHover: setDropTarget,
  };

  return (
    <div className="flex w-[150px] flex-none flex-col gap-0.5 bg-surface-2 px-[9px] py-3 select-none hairline-r">
      <div className="mx-1.5 mt-2 mb-1 font-mono text-[9.5px] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-70">
        Places
      </div>
      {PLACES.map(place => (
        <SidebarItem
          key={place.id}
          id={place.id}
          label={place.label}
          icon={place.icon}
          active={cwd === place.id}
          isDropTarget={dropTarget === place.id}
          {...shared}
        />
      ))}
      <div className="mx-1.5 mt-3 mb-1 font-mono text-[9.5px] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-70">
        System
      </div>
      <SidebarItem
        id={TRASH_ID}
        label="Trash"
        icon={Trash2}
        trailing={trashCount > 0 ? String(trashCount) : undefined}
        active={cwd === TRASH_ID}
        isDropTarget={dropTarget === TRASH_ID}
        {...shared}
      />
    </div>
  );
}
