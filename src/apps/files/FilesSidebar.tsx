import type { LucideIcon } from "lucide-react";
import type { FsNode } from "@/system/fs/types";
import {
  Clock,
  Download,
  House,
  Image,
  Monitor,
  NotebookText,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useFsStore } from "@/system/fs/fsStore";
import {
  DESKTOP_ID,
  DOCUMENTS_ID,
  DOWNLOADS_ID,
  HOME_ID,
  PICTURES_ID,
  TRASH_ID,
} from "@/system/fs/types";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { useViewPrefsStore } from "@/system/settings/viewPrefsStore";
import { draggedNodeIds, hasNodeDrag } from "./dnd";
import { NodeGlyph } from "./NodeGlyph";
import { RECENTS_ID } from "./places";

const PLACES: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: HOME_ID, label: "Home", icon: House },
  { id: DESKTOP_ID, label: "Desktop", icon: Monitor },
  { id: DOCUMENTS_ID, label: "Documents", icon: NotebookText },
  { id: DOWNLOADS_ID, label: "Downloads", icon: Download },
  { id: PICTURES_ID, label: "Pictures", icon: Image },
];

const SIDEBAR_ROW_BASE = "flex w-full items-center gap-[9px] rounded-[8px] px-[9px] py-[calc(6px*var(--ui-scale))] text-left text-12.5 font-medium";
function sidebarRowTone(active: boolean): string {
  return active
    ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-accent"
    : "text-ink-2 hover:bg-ph";
}

interface SidebarItemProps {
  id: string;
  label: string;
  icon: LucideIcon;
  trailing?: string;
  title?: string;
  active: boolean;
  isDropTarget: boolean;
  onNavigate: (id: string) => void;
  onDropNode: (targetFolderId: string, nodeIds: string[]) => void;
  onDropHover: (id: string | null) => void;
}

function SidebarItem({
  id,
  label,
  icon,
  trailing,
  title,
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
      title={title}
      className={`${SIDEBAR_ROW_BASE} ${sidebarRowTone(active)} ${isDropTarget ? "ring-1 ring-accent" : ""}`}
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
        const nodeIds = draggedNodeIds(e);
        if (nodeIds.length > 0)
          onDropNode(id, nodeIds);
      }}
    >
      <Icon className="size-[15px] opacity-80" strokeWidth={1.8} />
      <span className="flex-1">{label}</span>
      {trailing && <span className="text-[calc(10.5px*var(--ui-scale))] opacity-60">{trailing}</span>}
    </button>
  );
}

interface FavouriteRowProps {
  node: FsNode;
  active: boolean;
  onOpenNode: (node: FsNode) => void;
  onUnpin: (id: string) => void;
}

/** A pinned favourite (U14) — like `SidebarItem`, but opens (rather than always navigating) and offers an unpin affordance. */
function FavouriteRow({ node, active, onOpenNode, onUnpin }: FavouriteRowProps) {
  return (
    <div
      className={`group ${SIDEBAR_ROW_BASE} ${sidebarRowTone(active)}`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-[9px]"
        onClick={() => onOpenNode(node)}
      >
        <NodeGlyph
          node={node}
          className="size-[15px] flex-none opacity-80"
          strokeWidth={1.8}
        />
        <span className="flex-1 truncate">{node.name}</span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${node.name} from Favourites`}
        title="Remove from Favourites"
        className="grid size-4 flex-none place-items-center rounded-[4px] opacity-0 group-hover:opacity-70 hover:bg-ph-2 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onUnpin(node.id);
        }}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

interface FilesSidebarProps {
  cwd: string;
  trashCount: number;
  onNavigate: (id: string) => void;
  /** Opens a favourite (navigates for a folder, launches the associated app for a file) — `FilesApp`'s `openNode`. */
  onOpenNode: (node: FsNode) => void;
  onDropNode: (targetFolderId: string, nodeIds: string[]) => void;
}

export function FilesSidebar({ cwd, trashCount, onNavigate, onOpenNode, onDropNode }: FilesSidebarProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [favouritesDropActive, setFavouritesDropActive] = useState(false);
  const autoEmptyTrash = useSettingsStore(s => s.autoEmptyTrash);
  const nodes = useFsStore(s => s.nodes);
  const favouriteIds = useViewPrefsStore(s => s.favouriteIds);
  const toggleFavourite = useViewPrefsStore(s => s.toggleFavourite);
  const recentCount = useViewPrefsStore(s => s.recentIds.length);

  const favourites = favouriteIds
    .map(id => nodes[id])
    .filter((n): n is FsNode => !!n);

  const shared = {
    onNavigate,
    onDropNode,
    onDropHover: setDropTarget,
  };

  return (
    <div className="flex w-[150px] flex-none flex-col gap-[calc(2px*var(--ui-scale))] overflow-y-auto bg-surface-2 px-[9px] py-3 select-none hairline-r">
      <div className="mx-1.5 mt-2 mb-1 font-mono text-[calc(9.5px*var(--ui-scale))] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-70">
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
      {/* U14 "Recents" — a synthetic place, not a real folder; see places.ts. */}
      <SidebarItem
        id={RECENTS_ID}
        label="Recents"
        icon={Clock}
        trailing={recentCount > 0 ? String(recentCount) : undefined}
        active={cwd === RECENTS_ID}
        isDropTarget={false}
        {...shared}
      />

      {/* U14 favourites: a persisted list of pinned node ids. The header
          itself is a drop target — drag an item from the main view and drop
          it here to pin it — separate from each row's own click-to-open. */}
      <div
        className={`mx-1.5 mt-3 mb-1 flex items-center gap-1 font-mono text-[calc(9.5px*var(--ui-scale))] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-70 ${
          favouritesDropActive ? "text-accent opacity-100" : ""
        }`}
        onDragOver={(e) => {
          if (!hasNodeDrag(e))
            return;
          e.preventDefault();
          setFavouritesDropActive(true);
        }}
        onDragLeave={() => setFavouritesDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setFavouritesDropActive(false);
          for (const id of draggedNodeIds(e)) {
            if (!favouriteIds.includes(id))
              toggleFavourite(id);
          }
        }}
      >
        <Star className="size-[10px]" />
        Favourites
      </div>
      {favourites.length === 0
        ? <div className="mx-1.5 text-11 text-ink-2 opacity-60">Drag items here</div>
        : favourites.map(node => (
            <FavouriteRow
              key={node.id}
              node={node}
              active={cwd === node.id}
              onOpenNode={onOpenNode}
              onUnpin={toggleFavourite}
            />
          ))}

      <div className="mx-1.5 mt-3 mb-1 font-mono text-[calc(9.5px*var(--ui-scale))] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-70">
        System
      </div>
      <SidebarItem
        id={TRASH_ID}
        label="Trash"
        icon={Trash2}
        trailing={trashCount > 0 ? String(trashCount) : undefined}
        title={autoEmptyTrash ? "Items are removed automatically after 30 days" : undefined}
        active={cwd === TRASH_ID}
        isDropTarget={dropTarget === TRASH_ID}
        {...shared}
      />
    </div>
  );
}
