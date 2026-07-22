import type { ChangeEvent, MouseEvent } from "react";
import type { SelectMode } from "./FilesView";
import type { UploadEntry } from "./upload";
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
  Upload,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { formatBytes } from "@/lib/format";
import { useAppCommand } from "@/system/appCommands";
import { appIdForFile, candidateAppsForFile, openFile, openFileWithApp } from "@/system/apps/openFile";
import { getApp } from "@/system/apps/registry";
import { blobStore } from "@/system/fs/blobStore";
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
import { useClipboardStore } from "./clipboardStore";
import { downloadMany } from "./download";
import { nodeSize } from "./fileMeta";
import { FilesSidebar } from "./FilesSidebar";
import { FilesView } from "./FilesView";
import { NodeInfoPanel } from "./NodeInfoPanel";
import { entriesFromDataTransfer, entriesFromFileList, uploadEntries } from "./upload";

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

/** Launch payload for opening Files scoped to a specific folder (B7: Desktop icons open into their folder rather than always landing on Home). */
function payloadFolderId(payload: unknown): string | null {
  if (
    payload
    && typeof payload === "object"
    && "folderId" in payload
    && typeof (payload as { folderId: unknown }).folderId === "string"
  ) {
    return (payload as { folderId: string }).folderId;
  }
  return null;
}

export default function FilesApp({ windowId, payload }: AppWindowProps) {
  const nodes = useFsStore(s => s.nodes);
  const ready = useFsStore(s => s.ready);
  const createFolder = useFsStore(s => s.createFolder);
  const createFile = useFsStore(s => s.createFile);
  const createBlobFile = useFsStore(s => s.createBlobFile);
  const rename = useFsStore(s => s.rename);
  const move = useFsStore(s => s.move);
  const duplicate = useFsStore(s => s.duplicate);
  const moveToTrash = useFsStore(s => s.moveToTrash);
  const restoreFromTrash = useFsStore(s => s.restoreFromTrash);
  const emptyTrash = useFsStore(s => s.emptyTrash);
  const deleteForever = useFsStore(s => s.deleteForever);

  const sortByFolder = useViewPrefsStore(s => s.sortByFolder);
  const setSortPref = useViewPrefsStore(s => s.setSort);

  const clipboardIds = useClipboardStore(s => s.ids);
  const clipboardMode = useClipboardStore(s => s.mode);
  const setClipboard = useClipboardStore(s => s.setClipboard);
  const clearClipboard = useClipboardStore(s => s.clear);

  const [history, setHistory] = useState<string[]>(() => [payloadFolderId(payload) ?? HOME_ID]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [view, setView] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  // The roving keyboard-nav cursor (B6): always tracks the last item touched
  // by click or arrow key, distinct from `anchorId` — which ⇧-range
  // selection deliberately leaves pinned at the start of the range.
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number } | null>(null);
  const [infoNode, setInfoNode] = useState<FsNode | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Held as state, not a plain ref: the container element is swapped out
  // whenever `view` toggles grid/list (FilesView renders a different DOM
  // node for each), and the keydown listener below needs to re-attach to
  // whichever one is current rather than the one it saw on mount.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const typeAheadRef = useRef({ text: "", at: 0 });
  // `webkitdirectory` has no React prop; stamp it on the DOM node directly.
  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const cwd = history[historyIndex] ?? HOME_ID;
  const inTrash = cwd === TRASH_ID;
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
    if (selectedIds.size > 0)
      setSelectedIds(new Set());
    if (anchorId !== null)
      setAnchorId(null);
    if (cursorId !== null)
      setCursorId(null);
  }

  function navigate(id: string): void {
    if (id === cwd || !nodes[id])
      return;
    const next = [...history.slice(0, historyIndex + 1), id];
    setHistory(next);
    setHistoryIndex(next.length - 1);
    setQuery("");
    setSelectedIds(new Set());
    setAnchorId(null);
    setCursorId(null);
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
    setSelectedIds(new Set([node.id]));
    setAnchorId(node.id);
    setCursorId(node.id);
    setRenamingId(node.id);
  }

  /** Trash one or more items (B4 bulk) and offer a one-click Undo via the notification. */
  function trashManyWithUndo(ids: string[]): void {
    // Already in the Trash: moveToTrash would no-op, so don't include those —
    // an Undo that pulls them back out would be surprising.
    const targets = ids
      .map(id => nodes[id])
      .filter((n): n is FsNode => !!n && n.parentId !== TRASH_ID);
    if (targets.length === 0)
      return;
    targets.forEach(t => moveToTrash(t.id));
    setSelectedIds(new Set());
    const label = targets.length === 1 ? `“${targets[0].name}”` : `${targets.length} items`;
    notify({
      title: "Moved to Trash",
      body: `${label} ${targets.length === 1 ? "was" : "were"} moved to the Trash.`,
      appId: "files",
      action: { label: "Undo", run: () => targets.forEach(t => restoreFromTrash(t.id)) },
    });
  }

  function handleDrop(targetFolderId: string, nodeIds: string[]): void {
    if (targetFolderId === TRASH_ID) {
      trashManyWithUndo(nodeIds);
      return;
    }
    nodeIds.forEach((id) => {
      if (id !== targetFolderId)
        move(id, targetFolderId);
    });
  }

  /** B5: stage the selection on the clipboard for a later Paste. */
  function copySelection(): void {
    if (selectedIds.size === 0)
      return;
    setClipboard([...selectedIds], "copy");
  }

  function cutSelection(): void {
    const ids = [...selectedIds].filter(id => !isSystemNode(id));
    if (ids.length === 0)
      return;
    setClipboard(ids, "cut");
  }

  /** Copy duplicates into `cwd`; Cut moves the originals here and clears the clipboard. */
  function pasteClipboard(): void {
    if (inTrash || clipboardIds.length === 0)
      return;
    const ids = clipboardIds.filter(id => nodes[id]);
    if (ids.length === 0) {
      clearClipboard();
      return;
    }
    const landed: string[] = [];
    if (clipboardMode === "cut") {
      ids.forEach((id) => {
        if (move(id, cwd))
          landed.push(id);
      });
      clearClipboard();
    }
    else {
      ids.forEach((id) => {
        const copy = duplicate(id, cwd);
        if (copy)
          landed.push(copy.id);
      });
    }
    if (landed.length > 0) {
      setSelectedIds(new Set(landed));
      setAnchorId(landed[landed.length - 1]);
      setCursorId(landed[landed.length - 1]);
    }
  }

  /** Import files/folders into `targetFolderId` (B2), toasting the result. */
  async function handleUpload(targetFolderId: string, entries: UploadEntry[]): Promise<void> {
    if (entries.length === 0)
      return;
    if (targetFolderId === TRASH_ID) {
      notify({ title: "Can’t upload here", body: "Items can’t be uploaded directly into the Trash.", tone: "danger" });
      return;
    }
    const result = await uploadEntries(
      targetFolderId,
      entries,
      { createFolder, createFile, createBlobFile },
      () => useFsStore.getState().nodes,
    );
    if (result.fileCount > 0) {
      notify({
        title: `Uploaded ${result.fileCount} ${result.fileCount === 1 ? "file" : "files"}`,
        body: `${formatBytes(result.totalBytes)} added${result.failed > 0 ? ` · ${result.failed} failed` : ""}.`,
        appId: "files",
        tone: result.failed > 0 ? "danger" : "default",
      });
    }
    else if (result.failed > 0) {
      notify({ title: "Upload failed", body: `${result.failed} ${result.failed === 1 ? "item" : "items"} couldn’t be uploaded.`, tone: "danger" });
    }
  }

  function onUploadInto(targetFolderId: string, dataTransfer: DataTransfer): void {
    void entriesFromDataTransfer(dataTransfer).then(entries => handleUpload(targetFolderId, entries));
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const { files } = e.target;
    if (files && files.length > 0)
      void handleUpload(cwd, entriesFromFileList(files));
    e.target.value = "";
  }

  /** Download a file, a folder as a zip (B3), or a multi-selection as one zip (B4), to the host OS. */
  async function handleDownload(items: FsNode[]): Promise<void> {
    try {
      await downloadMany(items, nodes, blobStore);
    }
    catch (error) {
      notify({
        title: "Download failed",
        body: error instanceof Error
          ? error.message
          : items.length === 1
            ? `“${items[0].name}” couldn’t be downloaded.`
            : "Some items couldn’t be downloaded.",
        tone: "danger",
      });
    }
  }

  function openNode(node: FsNode): void {
    if (node.type === "folder")
      navigate(node.id);
    else openFile(node);
  }

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
  const cutIds = useMemo(
    () => (clipboardMode === "cut" ? new Set(clipboardIds) : new Set<string>()),
    [clipboardMode, clipboardIds],
  );
  // `infoNode` only ever holds the snapshot captured when "Get Info" was
  // invoked; re-derive the live node from `nodes` on every render so the
  // panel reflects renames/moves made elsewhere while it's open, and closes
  // itself (by simply not rendering) if the node is deleted out from under it.
  const liveInfoNode = infoNode ? (nodes[infoNode.id] ?? null) : null;

  useAppCommand(windowId, (command) => {
    switch (command) {
      case "files.newFolder":
        newFolder();
        break;
      case "files.uploadFiles":
        fileInputRef.current?.click();
        break;
      case "files.uploadFolder":
        folderInputRef.current?.click();
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
      case "files.selectAll":
        setSelectedIds(new Set(visible.map(n => n.id)));
        setAnchorId(null);
        setCursorId(null);
        break;
      case "files.copy":
        copySelection();
        break;
      case "files.cut":
        cutSelection();
        break;
      case "files.paste":
        pasteClipboard();
        break;
      case "files.getInfo": {
        const target = primaryTarget();
        if (target)
          setInfoNode(target);
        break;
      }
    }
  });

  // Click-selection for one item (B4): plain click replaces, ⌘/⌃ toggles, ⇧
  // extends from the anchor. Also the entry point for keyboard nav (B6) —
  // see `moveCursor` — which is why every branch updates `cursorId` even
  // though only "replace"/"toggle" also move the anchor.
  function handleSelectNode(node: FsNode, mode: SelectMode): void {
    setCursorId(node.id);
    if (mode === "toggle") {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id))
          next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      setAnchorId(node.id);
      return;
    }
    if (mode === "range") {
      const ids = visible.map(n => n.id);
      const anchor = anchorId ?? node.id;
      const from = ids.indexOf(anchor);
      const to = ids.indexOf(node.id);
      if (from === -1 || to === -1) {
        setSelectedIds(new Set([node.id]));
        setAnchorId(node.id);
        return;
      }
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      setSelectedIds(new Set(ids.slice(lo, hi + 1)));
      return;
    }
    setSelectedIds(new Set([node.id]));
    setAnchorId(node.id);
  }

  // Live grid column count (B6), read from the actual laid-out CSS grid
  // rather than guessed from viewport width, so it tracks window resizes and
  // the `auto-fill` track count exactly. 1 in list view (a single column).
  function columnCount(): number {
    if (view !== "grid" || !container)
      return 1;
    const tracks = getComputedStyle(container).gridTemplateColumns.split(" ").filter(Boolean);
    return tracks.length || 1;
  }

  function scrollNodeIntoView(id: string): void {
    container
      ?.querySelector(`[data-node-id="${id}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  // Roving tabIndex (review-backlog #8) means only the cursor item is ever a
  // Tab stop — real DOM focus has to follow the keyboard cursor as it moves,
  // not just the visual selection highlight, or the item that last had a
  // click stays the one actually focused.
  function focusNode(id: string): void {
    container
      ?.querySelector<HTMLElement>(`[data-node-id="${id}"]`)
      ?.focus();
  }

  // Arrow-key roving focus (B6): move the cursor `delta` positions through
  // `visible` (±1 for left/right, ±columnCount() for up/down); ⇧ extends the
  // selection from the fixed anchor via the same "range" path clicks use.
  function moveCursor(delta: number, extend: boolean): void {
    if (visible.length === 0)
      return;
    const currentIdx = cursorId ? visible.findIndex(n => n.id === cursorId) : -1;
    const nextIdx = currentIdx === -1
      ? (delta > 0 ? 0 : visible.length - 1)
      : Math.min(Math.max(currentIdx + delta, 0), visible.length - 1);
    const node = visible[nextIdx];
    if (!node)
      return;
    handleSelectNode(node, extend ? "range" : "replace");
    scrollNodeIntoView(node.id);
    focusNode(node.id);
  }

  // Type-ahead (B6): letters typed within 800ms of each other accumulate
  // into a search string; jumps to the first visible item whose name starts
  // with it (case-insensitive).
  function typeAhead(char: string): void {
    const state = typeAheadRef.current;
    const now = Date.now();
    state.text = now - state.at < 800 ? state.text + char.toLowerCase() : char.toLowerCase();
    state.at = now;
    const match = visible.find(n => n.name.toLowerCase().startsWith(state.text));
    if (match) {
      setSelectedIds(new Set([match.id]));
      setAnchorId(match.id);
      setCursorId(match.id);
      scrollNodeIntoView(match.id);
      focusNode(match.id);
    }
  }

  // Keep real DOM focus following the roving cursor (review-backlog #8) even
  // when it moves for a reason other than a direct click on the item — e.g.
  // a new folder's rename committing, or a paste landing on new items — so
  // the container's keydown listener always has something focused inside it
  // to bubble from. Skipped while a rename is in progress: the RenameInput's
  // own autofocus should win, not have this effect steal it back.
  useEffect(() => {
    if (renamingId || !cursorId)
      return;
    container?.querySelector<HTMLElement>(`[data-node-id="${cursorId}"]`)?.focus();
  }, [cursorId, renamingId, container]);

  // The item Enter/F2 act on: the cursor when it's part of the selection,
  // else the sole selected item — never ambiguous across a multi-selection.
  function primaryTarget(): FsNode | null {
    if (cursorId && selectedIds.has(cursorId))
      return nodes[cursorId] ?? null;
    if (selectedIds.size === 1) {
      const [id] = selectedIds;
      return nodes[id] ?? null;
    }
    return null;
  }

  // Full roving-focus keyboard nav (B6): arrow keys move/extend the
  // selection, Enter opens the cursor item, F2 renames it, printable
  // characters do type-ahead search, Escape clears the selection, and
  // Delete/Backspace trashes it. Scoped to this window being focused, and
  // skipped while typing (filter, rename) — the outer listener below filters
  // those by event target. Mirrors useAppCommand's ref-indirection so the
  // listener itself never needs to be re-subscribed as selection/nodes change.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      // The Get Info panel is a modal dialog with its own focus trap and
      // Escape handler (review-backlog #6) — while it's open, this handler
      // must be a complete no-op rather than let Delete/F2/arrows/type-ahead
      // act on the file list hidden behind it.
      if (liveInfoNode)
        return;
      switch (e.key) {
        case "Escape":
          if (selectedIds.size > 0) {
            e.preventDefault();
            setSelectedIds(new Set());
          }
          return;
        case "Delete":
        case "Backspace":
          if (selectedIds.size > 0 && !inTrash) {
            e.preventDefault();
            trashManyWithUndo([...selectedIds]);
          }
          return;
        case "Enter": {
          const target = primaryTarget();
          if (target) {
            e.preventDefault();
            openNode(target);
          }
          return;
        }
        case "F2": {
          const target = primaryTarget();
          if (target && !isSystemNode(target.id)) {
            e.preventDefault();
            setRenamingId(target.id);
          }
          return;
        }
        case "ArrowLeft":
          e.preventDefault();
          moveCursor(-1, e.shiftKey);
          return;
        case "ArrowRight":
          e.preventDefault();
          moveCursor(1, e.shiftKey);
          return;
        case "ArrowUp":
          e.preventDefault();
          moveCursor(-columnCount(), e.shiftKey);
          return;
        case "ArrowDown":
          e.preventDefault();
          moveCursor(columnCount(), e.shiftKey);
          return;
        default:
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            typeAhead(e.key);
          }
      }
    };
  });

  // Bound to the container itself (review-backlog #8) rather than `window`,
  // so it fires only from real DOM focus inside this list — a second Files
  // window, or focus anywhere else in the shell, no longer needs a
  // `focusedId` string-comparison gate to stay silent; the browser's own
  // focus/bubbling already scopes it correctly.
  useEffect(() => {
    if (!container)
      return;
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
        return;
      keyHandlerRef.current(e);
    }
    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [container]);

  function menuEntries(state: MenuState): ContextMenuEntry[] {
    const node = state.node;
    if (!node) {
      return [
        { label: "New Folder", run: newFolder, disabled: inTrash, dividerAfter: true },
        { label: "Paste", run: pasteClipboard, disabled: inTrash || clipboardIds.length === 0 },
      ];
    }
    const multi = selectedIds.has(node.id) && selectedIds.size > 1;
    const targets = multi
      ? [...selectedIds].map(id => nodes[id]).filter((n): n is FsNode => !!n)
      : [node];
    if (inTrash) {
      return [
        {
          label: multi ? `Restore ${targets.length} Items` : "Restore",
          run: () => targets.forEach(t => restoreFromTrash(t.id)),
          dividerAfter: true,
        },
        {
          label: multi ? `Delete ${targets.length} Items Permanently` : "Delete Permanently",
          run: () => targets.forEach(t => deleteForever(t.id)),
          danger: true,
        },
      ];
    }
    const system = targets.some(t => isSystemNode(t.id));
    const openable = !multi && (node.type === "folder" || appIdForFile(node) !== null);
    const openWithCandidates = multi || node.type === "folder" ? [] : candidateAppsForFile(node);
    const currentAppId = openWithCandidates.length ? appIdForFile(node) : null;
    return [
      ...(openable ? [{ label: "Open", run: () => openNode(node) }] : []),
      ...(openWithCandidates.length
        ? [{
            label: "Open With",
            children: openWithCandidates.map(appId => ({
              label: `${appId === currentAppId ? "✓  " : "  "}${getApp(appId)?.name ?? appId}`,
              run: () => openFileWithApp(node, appId),
            })),
          }]
        : []),
      { label: multi ? `Copy ${targets.length} Items` : "Copy", run: copySelection },
      { label: multi ? `Cut ${targets.length} Items` : "Cut", run: cutSelection, disabled: system, dividerAfter: true },
      {
        label: multi
          ? `Download ${targets.length} Items as Zip`
          : node.type === "folder" ? "Download as Zip" : "Download",
        run: () => handleDownload(targets),
        dividerAfter: true,
      },
      ...(multi
        ? []
        : [
            { label: "Get Info", run: () => setInfoNode(node) },
            { label: "Rename", run: () => setRenamingId(node.id), disabled: system, dividerAfter: true },
          ]),
      {
        label: multi ? `Move ${targets.length} Items to Trash` : "Move to Trash",
        run: () => trashManyWithUndo(targets.map(t => t.id)),
        disabled: system,
        danger: true,
      },
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
      {liveInfoNode && (
        <NodeInfoPanel
          node={liveInfoNode}
          size={nodeSize(nodes, liveInfoNode)}
          location={liveInfoNode.parentId
            ? pathOf(nodes, liveInfoNode.parentId).slice(1).map(n => n.name).join(" / ")
            : ""}
          onClose={() => setInfoNode(null)}
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
                aria-label="Upload files"
                title="Upload…"
                className="grid size-6 place-items-center rounded-[6px] hover:bg-ph"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-4" />
              </button>
            )}
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
          nodes={nodes}
          view={view}
          selectedIds={selectedIds}
          cursorId={cursorId}
          cutIds={cutIds}
          renamingId={renamingId}
          emptyLabel={
            query
              ? `Nothing matches “${query}”`
              : inTrash
                ? "The Trash is empty"
                : "This folder is empty"
          }
          onSelectNode={handleSelectNode}
          onClearSelection={() => setSelectedIds(new Set())}
          onMarqueeSelect={setSelectedIds}
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
          onUploadInto={onUploadInto}
          cwdId={cwd}
          registerContainer={setContainer}
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

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={onFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        onChange={onFileInputChange}
      />
    </div>
  );
}
