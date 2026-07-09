import type { MouseEvent } from "react";
import type { ContextMenuEntry } from "@/components/ui/ContextMenu";
import type { AppWindowProps } from "@/system/apps/types";
import type { SortKey } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  LayoutGrid,
  List,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { useAppCommand } from "@/system/appCommands";
import { appIdForFile, openFile } from "@/system/apps/openFile";
import {
  childrenOf,
  isSystemNode,
  isValidNodeName,
  pathOf,
  useFsStore,
} from "@/system/fs/fsStore";
import {
  DOCUMENTS_ID,
  HOME_ID,
  PICTURES_ID,
  TRASH_ID,
} from "@/system/fs/types";
import { notify } from "@/system/notifications/notificationStore";
import { sortForFolder, useViewPrefsStore } from "@/system/settings/viewPrefsStore";
import { FilesSidebar } from "./FilesSidebar";
import { FilesView } from "./FilesView";

type ViewMode = "grid" | "list";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  date: "Date Added",
  kind: "Kind",
};

interface MenuState {
  x: number;
  y: number;
  node: FsNode | null;
}

export default function FilesApp({ windowId }: AppWindowProps) {
  const nodes = useFsStore(s => s.nodes);
  const ready = useFsStore(s => s.ready);
  const createFolder = useFsStore(s => s.createFolder);
  const rename = useFsStore(s => s.rename);
  const move = useFsStore(s => s.move);
  const moveToTrash = useFsStore(s => s.moveToTrash);
  const restoreFromTrash = useFsStore(s => s.restoreFromTrash);
  const emptyTrash = useFsStore(s => s.emptyTrash);
  const deleteForever = useFsStore(s => s.deleteForever);

  const sortByFolder = useViewPrefsStore(s => s.sortByFolder);
  const setSortPref = useViewPrefsStore(s => s.setSort);

  const [history, setHistory] = useState<string[]>([HOME_ID]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [view, setView] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const cwd = history[historyIndex] ?? HOME_ID;
  const sort = sortForFolder(sortByFolder, cwd);

  /** Pick a sort key for the current folder; re-picking it flips direction. */
  function applySort(key: SortKey): void {
    setSortPref(
      cwd,
      key === sort.key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  function toggleSortDir(): void {
    setSortPref(cwd, { key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" });
  }

  // If the current folder vanished (trashed/deleted elsewhere), go home.
  if (ready && !nodes[cwd]) {
    setHistory([HOME_ID]);
    setHistoryIndex(0);
  }

  function navigate(id: string): void {
    if (id === cwd || !nodes[id])
      return;
    const next = [...history.slice(0, historyIndex + 1), id];
    setHistory(next);
    setHistoryIndex(next.length - 1);
    setQuery("");
    setSelectedId(null);
    setRenamingId(null);
    setConfirmEmpty(false);
  }

  function goBack(): void {
    if (historyIndex > 0)
      setHistoryIndex(historyIndex - 1);
  }

  function goForward(): void {
    if (historyIndex < history.length - 1)
      setHistoryIndex(historyIndex + 1);
  }

  function newFolder(): void {
    const target = cwd === TRASH_ID ? HOME_ID : cwd;
    if (target !== cwd)
      navigate(target);
    const node = createFolder(target);
    setSelectedId(node.id);
    setRenamingId(node.id);
  }

  /** Trash an item and offer a one-click Undo via the notification. */
  function trashWithUndo(id: string): void {
    const node = nodes[id];
    // Already in the Trash: moveToTrash would no-op, so don't show a
    // "Moved to Trash" toast whose Undo would pull the item out.
    if (!node || node.parentId === TRASH_ID)
      return;
    const name = node.name;
    moveToTrash(id);
    notify({
      title: "Moved to Trash",
      body: `“${name}” was moved to the Trash.`,
      appId: "files",
      action: { label: "Undo", run: () => restoreFromTrash(id) },
    });
  }

  function handleDrop(targetFolderId: string, nodeId: string): void {
    if (targetFolderId === TRASH_ID)
      trashWithUndo(nodeId);
    else move(nodeId, targetFolderId);
  }

  function openNode(node: FsNode): void {
    if (node.type === "folder")
      navigate(node.id);
    else openFile(node);
  }

  useAppCommand(windowId, (command) => {
    switch (command) {
      case "files.newFolder":
        newFolder();
        break;
      case "files.viewGrid":
        setView("grid");
        break;
      case "files.viewList":
        setView("list");
        break;
      case "files.sortName":
        applySort("name");
        break;
      case "files.sortDate":
        applySort("date");
        break;
      case "files.sortKind":
        applySort("kind");
        break;
      case "files.sortReverse":
        toggleSortDir();
        break;
      case "files.goHome":
        navigate(HOME_ID);
        break;
      case "files.goDocuments":
        navigate(DOCUMENTS_ID);
        break;
      case "files.goPictures":
        navigate(PICTURES_ID);
        break;
      case "files.goTrash":
        navigate(TRASH_ID);
        break;
    }
  });

  const inTrash = cwd === TRASH_ID;
  const children = useMemo(() => childrenOf(nodes, cwd, sort), [nodes, cwd, sort]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? children.filter(n => n.name.toLowerCase().includes(q)) : children;
  }, [children, query]);
  const crumbs = useMemo(() => pathOf(nodes, cwd).slice(1), [nodes, cwd]);
  const trashCount = useMemo(
    () => childrenOf(nodes, TRASH_ID).length,
    [nodes],
  );

  function menuEntries(state: MenuState): ContextMenuEntry[] {
    const node = state.node;
    if (!node) {
      return [
        { label: "New Folder", run: newFolder, disabled: inTrash },
      ];
    }
    if (inTrash) {
      return [
        { label: "Restore", run: () => restoreFromTrash(node.id), dividerAfter: true },
        { label: "Delete Permanently", run: () => deleteForever(node.id), danger: true },
      ];
    }
    const system = isSystemNode(node.id);
    const openable = node.type === "folder" || appIdForFile(node) !== null;
    return [
      ...(openable ? [{ label: "Open", run: () => openNode(node) }] : []),
      { label: "Rename", run: () => setRenamingId(node.id), disabled: system, dividerAfter: true },
      { label: "Move to Trash", run: () => trashWithUndo(node.id), disabled: system, danger: true },
    ];
  }

  function sortEntries(): ContextMenuEntry[] {
    const check = (on: boolean) => (on ? "✓  " : "  ");
    return [
      ...(Object.keys(SORT_LABELS) as SortKey[]).map((key, i, arr) => ({
        label: `${check(sort.key === key)}${SORT_LABELS[key]}`,
        run: () => applySort(key),
        dividerAfter: i === arr.length - 1,
      })),
      { label: `${check(sort.dir === "desc")}Reverse order`, run: toggleSortDir },
    ];
  }

  function onItemContextMenu(e: MouseEvent, node: FsNode): void {
    setMenu({ x: e.clientX, y: e.clientY, node });
  }

  function onBackgroundContextMenu(e: MouseEvent): void {
    setMenu({ x: e.clientX, y: e.clientY, node: null });
  }

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <span className="size-2.5 animate-pulse rounded-full bg-accent" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={menuEntries(menu)}
          onClose={() => setMenu(null)}
        />
      )}
      {sortMenu && (
        <ContextMenu
          x={sortMenu.x}
          y={sortMenu.y}
          header="Sort By"
          entries={sortEntries()}
          onClose={() => setSortMenu(null)}
        />
      )}
      <FilesSidebar
        cwd={cwd}
        trashCount={trashCount}
        onNavigate={navigate}
        onDropNode={handleDrop}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[38px] flex-none items-center gap-2 px-3 text-[12px] text-ink-2 select-none hairline-b">
          <button
            type="button"
            aria-label="Back"
            disabled={historyIndex === 0}
            className="grid size-6 place-items-center rounded-[6px] enabled:hover:bg-ph disabled:opacity-35"
            onClick={goBack}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Forward"
            disabled={historyIndex >= history.length - 1}
            className="grid size-6 place-items-center rounded-[6px] enabled:hover:bg-ph disabled:opacity-35"
            onClick={goForward}
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            {crumbs.map((crumb, i) => (
              <span key={crumb.id} className="flex items-center gap-1">
                {i > 0 && <span className="opacity-50">›</span>}
                <button
                  type="button"
                  className={`max-w-32 truncate rounded-[5px] px-1 py-0.5 ${
                    i === crumbs.length - 1
                      ? "font-semibold text-ink"
                      : "hover:bg-ph"
                  }`}
                  onClick={() => navigate(crumb.id)}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {inTrash && trashCount > 0 && (
              <button
                type="button"
                className={`rounded-btn px-2 py-1 text-[11.5px] font-medium ${
                  confirmEmpty
                    ? "bg-accent-2 text-white"
                    : "bg-ph text-ink hover:bg-ph-2"
                }`}
                onClick={() => {
                  if (confirmEmpty) {
                    const count = trashCount;
                    emptyTrash();
                    setConfirmEmpty(false);
                    notify({
                      title: "Trash emptied",
                      body: `${count} ${count === 1 ? "item" : "items"} permanently deleted.`,
                      appId: "files",
                      tone: "danger",
                    });
                  }
                  else {
                    setConfirmEmpty(true);
                    window.setTimeout(setConfirmEmpty, 3000, false);
                  }
                }}
              >
                {confirmEmpty ? "Click again to confirm" : "Empty Trash"}
              </button>
            )}
            <div className="flex items-center gap-1.5 rounded-btn bg-ph px-2 py-1">
              <Search className="size-3 opacity-60" />
              <input
                value={query}
                placeholder="Filter"
                className="w-24 bg-transparent text-[11.5px] text-ink outline-none placeholder:text-ink-2"
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              aria-label="Sort"
              title={`Sort by ${SORT_LABELS[sort.key]} (${sort.dir === "asc" ? "ascending" : "descending"})`}
              className="grid size-6 place-items-center rounded-[6px] hover:bg-ph"
              onClick={e =>
                setSortMenu({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom })}
            >
              <ArrowUpDown className="size-4" />
            </button>
            {!inTrash && (
              <button
                type="button"
                aria-label="New folder"
                className="grid size-6 place-items-center rounded-[6px] hover:bg-ph"
                onClick={newFolder}
              >
                <FolderPlus className="size-4" />
              </button>
            )}
            <div className="flex gap-0.5 rounded-btn bg-ph p-0.5">
              {(["grid", "list"] as const).map((mode) => {
                const Icon = mode === "grid" ? LayoutGrid : List;
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-label={`View as ${mode}`}
                    className={`grid h-[18px] w-6 place-items-center rounded-[5px] ${
                      view === mode
                        ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.12)]"
                        : "text-ink-2"
                    }`}
                    onClick={() => setView(mode)}
                  >
                    <Icon className="size-3" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <FilesView
          items={visible}
          view={view}
          selectedId={selectedId}
          renamingId={renamingId}
          emptyLabel={
            query
              ? `Nothing matches “${query}”`
              : inTrash
                ? "The Trash is empty"
                : "This folder is empty"
          }
          onSelect={setSelectedId}
          onOpen={openNode}
          onItemContextMenu={onItemContextMenu}
          onBackgroundContextMenu={onBackgroundContextMenu}
          onRenameCommit={(id, name) => {
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
          }}
          onRenameCancel={() => setRenamingId(null)}
          onDropInto={handleDrop}
        />

        <div className="flex h-6 flex-none items-center px-3 text-[11px] text-ink-2 select-none hairline-t">
          {visible.length}
          {" "}
          {visible.length === 1 ? "item" : "items"}
          {inTrash && trashCount > 0 && (
            <span className="ml-2 opacity-70">
              · Items here are deleted forever when you empty the Trash
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
