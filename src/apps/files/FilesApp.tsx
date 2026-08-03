import type { ChangeEvent, MouseEvent } from "react";
import type { FilesViewMode, SelectMode } from "./FilesView";
import type { UploadEntry } from "./upload";
import type { ContextMenuEntry } from "@/components/ui/ContextMenu";
import type { AppWindowProps } from "@/system/apps/types";
import type { NodeMap, SortKey } from "@/system/fs/fsStore";
import type { FsNode } from "@/system/fs/types";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FolderPlus,
  LayoutGrid,
  List,
  Search,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { RenameInput } from "@/components/ui/RenameInput";
import { useArmedConfirm } from "@/components/ui/useArmedConfirm";
import { formatBytes } from "@/lib/format";
import { useAppCommand } from "@/system/appCommands";
import { appIdForFile, candidateAppsForFile, openFile, openFileWithApp } from "@/system/apps/openFile";
import { getApp } from "@/system/apps/registry";
import { blobStore } from "@/system/fs/blobStore";
import {
  cachedFolderSizes,
  childrenOf,
  isSystemNode,
  pathOf,
  useFsStore,
} from "@/system/fs/fsStore";
import { NODE_LABELS } from "@/system/fs/nodeLabels";
import { isCommittableRename } from "@/system/fs/renameCommit";
import {
  DESKTOP_ID,
  DOCUMENTS_ID,
  DOWNLOADS_ID,
  HOME_ID,
  PICTURES_ID,
  TRASH_ID,
} from "@/system/fs/types";
import { notify } from "@/system/notifications/notificationStore";
import { sortForFolder, useViewPrefsStore, viewModeForFolder } from "@/system/settings/viewPrefsStore";
import { pathString, resolveFolderPath } from "./breadcrumbPath";
import { useClipboardStore } from "./clipboardStore";
import { downloadMany } from "./download";
import { fileBytes } from "./fileMeta";
import { FilesSidebar } from "./FilesSidebar";
import { FilesView } from "./FilesView";
import { gridColumnCount } from "./gridLayout";
import { IconPickerPanel } from "./IconPickerPanel";
import { NodeInfoPanel } from "./NodeInfoPanel";
import { isVirtualPlace, RECENTS_ID } from "./places";
import { QuickLookOverlay } from "./QuickLookOverlay";
import { entriesFromDataTransfer, entriesFromFileList, uploadEntries } from "./upload";

type ViewMode = FilesViewMode;

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  date: "Date Added",
  kind: "Kind",
  size: "Size",
};

const VIEW_MODE_ICONS: Record<ViewMode, typeof LayoutGrid> = {
  grid: LayoutGrid,
  list: List,
  detail: Columns3,
};

const DEFAULT_VIEW_MODE: ViewMode = "grid";

/**
 * Narrow a persisted view-mode string. `viewPrefsStore` stores it as a plain
 * `string` so it needn't depend on this app's types, which means a value
 * written by a different build (or a hand-edited localStorage) can be anything
 * — fall back rather than rendering an unknown mode.
 */
function asViewMode(value: string): ViewMode {
  return value in VIEW_MODE_ICONS ? (value as ViewMode) : DEFAULT_VIEW_MODE;
}

/** Letters typed further apart than this start a fresh type-ahead search (B6) rather than extending the previous one. */
const TYPE_AHEAD_RESET_MS = 800;
/** How long the "Empty Trash" button stays armed after a first click before it disarms itself (B4-style confirm-by-clicking-again). */
const EMPTY_TRASH_CONFIRM_MS = 3000;

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

/** Resolve ids to their live nodes, silently dropping any that no longer exist. */
function nodesForIds(nodes: NodeMap, ids: string[]): FsNode[] {
  return ids.map(id => nodes[id]).filter((n): n is FsNode => !!n);
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

  const setLabel = useFsStore(s => s.setLabel);
  const setIcon = useFsStore(s => s.setIcon);

  const sortByFolder = useViewPrefsStore(s => s.sortByFolder);
  const setSortPref = useViewPrefsStore(s => s.setSort);
  // U14 "Recents": a synthetic place (`RECENTS_ID`), not a real folder —
  // `visible` below reads straight off this ring buffer instead of
  // `childrenOf` when `cwd` is it.
  const recentIds = useViewPrefsStore(s => s.recentIds);
  // U14 favourites: the context menu's "Add/Remove Favourites" toggle reads
  // and writes the same store the sidebar's Favourites section renders.
  const favouriteIds = useViewPrefsStore(s => s.favouriteIds);
  const toggleFavourite = useViewPrefsStore(s => s.toggleFavourite);

  const clipboardIds = useClipboardStore(s => s.ids);
  const clipboardMode = useClipboardStore(s => s.mode);
  const setClipboard = useClipboardStore(s => s.setClipboard);
  const clearClipboard = useClipboardStore(s => s.clear);

  const [history, setHistory] = useState<string[]>(() => [payloadFolderId(payload) ?? HOME_ID]);
  const [historyIndex, setHistoryIndex] = useState(0);
  // View mode is persisted per folder (like sort), not held in component
  // state: a folder of images wants icons while a folder of documents wants
  // details, and re-choosing on every visit was the papercut.
  const viewByFolder = useViewPrefsStore(s => s.viewByFolder);
  const setViewPref = useViewPrefsStore(s => s.setViewMode);
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
  // Ids, not node snapshots: the panel edits a whole selection, and re-deriving
  // from `nodes` each render keeps it correct if one is renamed or deleted
  // while it's open (same reason `liveInfoNode` exists below).
  const [iconPickerIds, setIconPickerIds] = useState<string[] | null>(null);
  // U14 Quick Look (Space key).
  const [quickLookNode, setQuickLookNode] = useState<FsNode | null>(null);
  // U14 editable breadcrumb — click-to-edit-as-text-path.
  const [editingPath, setEditingPath] = useState(false);
  const { armed: confirmEmpty, arm: armEmptyTrash, disarm: disarmEmptyTrash } = useArmedConfirm<true>(EMPTY_TRASH_CONFIRM_MS);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // State, not a plain ref: `view` toggling grid/list/detail swaps the
  // container's DOM node (FilesView renders a different one for each), and
  // the keydown listener needs to re-attach to whichever is current.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const typeAheadRef = useRef({ text: "", at: 0 });
  // U14: FilesView's virtualizer needs a nudge to bring an off-screen item
  // into range before the existing querySelector-based focus logic below
  // can find it in the DOM — see `focusAndScrollIntoView`.
  const scrollToIdRef = useRef<(id: string) => void>(() => {});
  // `webkitdirectory` has no React prop; stamp it on the DOM node directly.
  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const cwd = history[historyIndex] ?? HOME_ID;
  const view = asViewMode(viewModeForFolder(viewByFolder, cwd, DEFAULT_VIEW_MODE));
  const setView = useCallback(
    (mode: ViewMode) => setViewPref(cwd, mode),
    [cwd, setViewPref],
  );
  const inTrash = cwd === TRASH_ID;
  // U14 "Recents": a synthetic place, not a real folder — gates the same
  // folder-only affordances (New Folder, upload, drop-to-move) `inTrash`
  // already gates.
  const inRecents = cwd === RECENTS_ID;
  const noRealFolder = inTrash || inRecents;
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
  // Guarded explicitly on `cwd !== HOME_ID` (review-backlog #18) rather than
  // relying on HOME_ID always existing to make this converge — without it,
  // a store somehow missing HOME_ID too would render-loop resetting `cwd`
  // to a still-missing HOME_ID forever. With the guard it just settles on
  // `cwd === HOME_ID` and renders through the empty `visible` list.
  if (ready && cwd !== HOME_ID && !nodes[cwd] && !isVirtualPlace(cwd)) {
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
    if (id === cwd || (!nodes[id] && !isVirtualPlace(id)))
      return;
    const next = [...history.slice(0, historyIndex + 1), id];
    setHistory(next);
    setHistoryIndex(next.length - 1);
    setQuery("");
    setSelectedIds(new Set());
    setAnchorId(null);
    setCursorId(null);
    setRenamingId(null);
    disarmEmptyTrash();
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
    const targets = nodesForIds(nodes, ids).filter(t => t.parentId !== TRASH_ID);
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
    if (targetFolderId === TRASH_ID || isVirtualPlace(targetFolderId)) {
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

  // One linear pass over the whole tree (review-backlog #5), reused by
  // every row in FilesView's list view instead of each row recursing/
  // rescanning `nodes` for its own folder size.
  // `cachedFolderSizes`, not a bare `folderSizes` in a `useMemo`: the "size"
  // sort inside `childrenOf` needs the same rollup, and the shared per-commit
  // cache means the two of them cost one pass rather than two.
  const sizes = useMemo(() => cachedFolderSizes(nodes), [nodes]);
  // U14 "Recents": not a real folder, so its listing comes straight off the
  // ring buffer (most-recent-first) instead of `childrenOf` — sort doesn't
  // apply here, recency order *is* the point of the place.
  const children = useMemo(
    () => (inRecents ? nodesForIds(nodes, recentIds) : childrenOf(nodes, cwd, sort)),
    [nodes, cwd, sort, inRecents, recentIds],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? children.filter(n => n.name.toLowerCase().includes(q)) : children;
  }, [children, query]);
  // Shared by both "Select All" and range-selection below — no need for either
  // to re-derive its own copy of the same id list.
  const visibleIds = useMemo(() => visible.map(n => n.id), [visible]);
  const crumbs = useMemo(
    () => (inRecents ? [{ id: RECENTS_ID, name: "Recents" }] : pathOf(nodes, cwd).slice(1)),
    [nodes, cwd, inRecents],
  );
  // A plain count, so a full childrenOf sort (which we'd throw away anyway) is skipped.
  const trashCount = useMemo(
    () => Object.values(nodes).filter(n => n.parentId === TRASH_ID).length,
    [nodes],
  );
  const cutIds = useMemo(
    () => (clipboardMode === "cut" ? new Set(clipboardIds) : new Set<string>()),
    [clipboardMode, clipboardIds],
  );
  // Total bytes of the selection, for the status bar. Folders use the same
  // rolled-up `sizes` map Get Info reads, so a selected folder counts its
  // whole subtree rather than zero.
  const selectionBytes = useMemo(
    () => nodesForIds(nodes, [...selectedIds])
      .reduce((sum, n) => sum + (n.type === "folder" ? (sizes.get(n.id) ?? 0) : fileBytes(n)), 0),
    [nodes, selectedIds, sizes],
  );
  // `infoNode` holds the snapshot captured when "Get Info" was invoked;
  // re-derive the live node from `nodes` each render so the panel reflects
  // renames/moves elsewhere, and closes itself (not rendering) if the node
  // is deleted out from under it.
  const liveInfoNode = infoNode ? (nodes[infoNode.id] ?? null) : null;
  const iconPickerTargets = iconPickerIds
    ? iconPickerIds.map(id => nodes[id]).filter((n): n is FsNode => Boolean(n))
    : [];

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
      case "files.viewDetail":
        setView("detail");
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
      case "files.sortSize":
        applySort("size");
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
        setSelectedIds(new Set(visibleIds));
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
      case "files.quickLook": {
        const target = primaryTarget();
        if (target)
          setQuickLookNode(target);
        break;
      }
      case "files.rename": {
        const target = primaryTarget();
        if (target && !isSystemNode(target.id))
          setRenamingId(target.id);
        break;
      }
      case "files.customizeIcon": {
        const ids = selectedIds.size > 0 ? [...selectedIds] : [];
        if (ids.length > 0)
          setIconPickerIds(ids);
        break;
      }
      case "files.duplicate":
        duplicateSelection();
        break;
      case "files.trash":
        if (selectedIds.size > 0)
          trashManyWithUndo([...selectedIds]);
        break;
      case "files.goDesktop":
        navigate(DESKTOP_ID);
        break;
      case "files.goDownloads":
        navigate(DOWNLOADS_ID);
        break;
      case "files.goUp": {
        // "Enclosing Folder": the virtual places have no parent to rise to.
        const parentId = isVirtualPlace(cwd) ? null : nodes[cwd]?.parentId;
        if (parentId)
          navigate(parentId);
        break;
      }
      case "files.back":
        goBack();
        break;
      case "files.forward":
        goForward();
        break;
    }
  });

  /**
   * "Duplicate" — copies each selected item beside itself. Reuses the store's
   * `duplicate` (the same deep-copy the clipboard's paste uses, so blob-backed
   * files share bytes rather than doubling them) targeted at the item's own
   * parent.
   */
  function duplicateSelection(): void {
    for (const target of nodesForIds(nodes, [...selectedIds])) {
      if (target.parentId)
        duplicate(target.id, target.parentId);
    }
  }

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
      const anchor = anchorId ?? node.id;
      const from = visibleIds.indexOf(anchor);
      const to = visibleIds.indexOf(node.id);
      if (from === -1 || to === -1) {
        setSelectedIds(new Set([node.id]));
        setAnchorId(node.id);
        return;
      }
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      setSelectedIds(new Set(visibleIds.slice(lo, hi + 1)));
      return;
    }
    setSelectedIds(new Set([node.id]));
    setAnchorId(node.id);
  }

  // A marquee drag (FilesView) reports its live hit set; sync anchor/cursor
  // to it too (review-backlog #18), not just the selection — otherwise an
  // arrow key right after marqueeing jumps from a stale prior cursor instead
  // of continuing from the marquee. `ids` preserves visible-list order, so
  // the last id is a reasonable cursor to land on.
  function handleMarqueeSelect(ids: Set<string>): void {
    setSelectedIds(ids);
    const last = [...ids].at(-1) ?? null;
    setAnchorId(last);
    setCursorId(last);
  }

  // Live grid column count (B6). Pre-virtualization this read the actual
  // laid-out CSS grid's track count off the container; under virtualization
  // most rows aren't rendered to measure, so it now runs the same pure
  // `gridColumnCount` math FilesView uses to decide its own row chunking —
  // both read `container`'s `clientWidth`, so the two always agree. 1 in
  // list/detail view (a single column).
  function columnCount(): number {
    if (view !== "grid" || !container)
      return 1;
    return gridColumnCount(container.clientWidth);
  }

  // Roving tabIndex (review-backlog #8) means DOM focus has to follow the
  // keyboard cursor as it moves. Focuses synchronously when the item is
  // already rendered; if it's scrolled out of the virtualizer's range, asks
  // FilesView to bring it into range (`scrollToIdRef`) and retries a frame
  // later, once react-virtual has mounted it.
  const withNode = useCallback((id: string, action: (el: HTMLElement) => void): void => {
    const existing = container?.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
    if (existing) {
      action(existing);
      return;
    }
    scrollToIdRef.current(id);
    requestAnimationFrame(() => {
      const el = container?.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
      if (el)
        action(el);
    });
  }, [container]);

  const focusNode = useCallback((id: string): void => {
    withNode(id, el => el.focus());
  }, [withNode]);

  /** Scrolls the item into view and focuses it. */
  function focusAndScrollIntoView(id: string): void {
    withNode(id, (el) => {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      el.focus();
    });
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
    focusAndScrollIntoView(node.id);
  }

  // Type-ahead (B6): letters typed within 800ms of each other accumulate
  // into a search string; jumps to the first visible item whose name starts
  // with it (case-insensitive).
  function typeAhead(char: string): void {
    const state = typeAheadRef.current;
    const now = Date.now();
    state.text = now - state.at < TYPE_AHEAD_RESET_MS ? state.text + char.toLowerCase() : char.toLowerCase();
    state.at = now;
    const match = visible.find(n => n.name.toLowerCase().startsWith(state.text));
    if (match) {
      setSelectedIds(new Set([match.id]));
      setAnchorId(match.id);
      setCursorId(match.id);
      focusAndScrollIntoView(match.id);
    }
  }

  // Keeps DOM focus following the roving cursor (#8) when it moves without
  // a click — a rename committing, a paste landing on new items — so the
  // container's keydown listener always has something focused to bubble
  // from. Skipped mid-rename so RenameInput's own autofocus wins.
  useEffect(() => {
    if (renamingId || !cursorId)
      return;
    focusNode(cursorId);
  }, [cursorId, renamingId, focusNode]);

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

  // Full roving-focus keyboard nav (B6): arrows move/extend the selection,
  // Enter opens the cursor item, F2 renames it, printable characters
  // type-ahead, Escape clears the selection, Delete/Backspace trashes it.
  // Scoped to this window being focused and skipped while typing (filter,
  // rename) via the outer listener's target filter. Mirrors useAppCommand's
  // ref-indirection so the listener never needs re-subscribing as
  // selection/nodes change.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      // The Get Info panel and Quick Look are modal dialogs with their own
      // focus trap and Escape/Space handling (#6) — while either is open,
      // this handler is a complete no-op rather than letting
      // Delete/F2/arrows/type-ahead act on the hidden list.
      if (liveInfoNode || quickLookNode || iconPickerTargets.length > 0)
        return;
      switch (e.key) {
        case " ": {
          e.preventDefault();
          const target = primaryTarget();
          if (target)
            setQuickLookNode(target);
          return;
        }
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

  // Bound to the container itself (#8), not `window` — real DOM focus
  // scopes it correctly, so a second Files window or focus elsewhere in the
  // shell no longer needs the old `focusedId` string-comparison gate.
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
        { label: "New Folder", run: newFolder, disabled: noRealFolder, dividerAfter: true },
        { label: "Paste", run: pasteClipboard, disabled: noRealFolder || clipboardIds.length === 0 },
      ];
    }
    const multi = selectedIds.has(node.id) && selectedIds.size > 1;
    const targets = multi ? nodesForIds(nodes, [...selectedIds]) : [node];
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
      // U14 Quick Look — only meaningful for a single target.
      ...(!multi ? [{ label: "Quick Look", run: () => setQuickLookNode(node) }] : []),
      { label: multi ? `Copy ${targets.length} Items` : "Copy", run: copySelection },
      { label: multi ? `Cut ${targets.length} Items` : "Cut", run: cutSelection, disabled: system, dividerAfter: true },
      {
        label: multi
          ? `Download ${targets.length} Items as Zip`
          : node.type === "folder" ? "Download as Zip" : "Download",
        run: () => handleDownload(targets),
        dividerAfter: true,
      },
      // U14 favourites: single target toggles; a multi-selection can only
      // add (an per-item toggle reading one "current" state wouldn't mean
      // anything across a mixed selection).
      multi
        ? {
            label: `Add ${targets.length} Items to Favourites`,
            run: () => targets.forEach(t => !favouriteIds.includes(t.id) && toggleFavourite(t.id)),
          }
        : {
            label: favouriteIds.includes(node.id) ? "Remove from Favourites" : "Add to Favourites",
            run: () => toggleFavourite(node.id),
          },
      // U14 color labels: a submenu of the fixed swatch set + "None" to clear.
      {
        label: "Label",
        children: [
          { label: "None", run: () => targets.forEach(t => setLabel(t.id, undefined)) },
          ...NODE_LABELS.map(l => ({
            label: l.name,
            swatch: l.hex,
            run: () => targets.forEach(t => setLabel(t.id, l.id)),
          })),
        ],
      },
      // The glyph/tint picker is a panel rather than a second submenu — see
      // IconPickerPanel's own note on why 28 glyphs can't be a flyout.
      {
        label: multi ? `Customize Icon for ${targets.length} Items…` : "Customize Icon…",
        run: () => setIconPickerIds(targets.map(t => t.id)),
        dividerAfter: true,
      },
      ...(multi
        ? []
        : [
            { label: "Get Info", run: () => setInfoNode(node) },
            { label: "Rename", run: () => setRenamingId(node.id), disabled: system },
            { label: "Duplicate", run: duplicateSelection, disabled: system, dividerAfter: true },
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
        <span className="size-[calc(10px*var(--ui-scale))] animate-pulse rounded-full bg-accent" />
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
          size={liveInfoNode.type === "folder" ? (sizes.get(liveInfoNode.id) ?? 0) : fileBytes(liveInfoNode)}
          location={liveInfoNode.parentId
            ? pathOf(nodes, liveInfoNode.parentId).slice(1).map(n => n.name).join(" / ")
            : ""}
          onClose={() => setInfoNode(null)}
        />
      )}
      {iconPickerTargets.length > 0 && (
        <IconPickerPanel
          node={iconPickerTargets[0]}
          targets={iconPickerTargets}
          onApply={(glyph, tint) => iconPickerTargets.forEach(t => setIcon(t.id, glyph, tint))}
          onClose={() => setIconPickerIds(null)}
        />
      )}
      {quickLookNode && nodes[quickLookNode.id] && (
        <QuickLookOverlay
          node={nodes[quickLookNode.id]}
          onClose={() => setQuickLookNode(null)}
        />
      )}
      <FilesSidebar
        cwd={cwd}
        trashCount={trashCount}
        onNavigate={navigate}
        onOpenNode={openNode}
        onDropNode={handleDrop}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[38px] flex-none items-center gap-2 px-3 text-12 text-ink-2 select-none hairline-b">
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
          {/* U14 editable breadcrumb: click the blank part of the bar to edit
              the whole path as text (Enter navigates, Escape cancels) —
              individual crumb buttons still navigate directly on click and
              stop the click from also opening the editor. Virtual places
              (Recents) have no real path to edit. */}
          <div
            className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
            onClick={() => !inRecents && setEditingPath(true)}
          >
            {editingPath
              ? (
                  <RenameInput
                    value={pathString(nodes, cwd)}
                    className="max-w-72"
                    onCommit={(text) => {
                      const target = resolveFolderPath(nodes, text);
                      if (target === null)
                        return false;
                      navigate(target);
                      setEditingPath(false);
                      return true;
                    }}
                    onCancel={() => setEditingPath(false)}
                  />
                )
              : crumbs.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    {i > 0 && <span className="opacity-50">›</span>}
                    <button
                      type="button"
                      className={`max-w-32 truncate rounded-[5px] px-1 py-[calc(2px*var(--ui-scale))] ${
                        i === crumbs.length - 1
                          ? "font-semibold text-ink"
                          : "hover:bg-ph"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(crumb.id);
                      }}
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
                className={`rounded-btn px-2 py-1 text-11.5 font-medium ${
                  confirmEmpty
                    ? "bg-accent-2-strong text-white"
                    : "bg-ph text-ink hover:bg-ph-2"
                }`}
                onClick={() => {
                  if (confirmEmpty) {
                    const count = trashCount;
                    emptyTrash();
                    disarmEmptyTrash();
                    notify({
                      title: "Trash emptied",
                      body: `${count} ${count === 1 ? "item" : "items"} permanently deleted.`,
                      appId: "files",
                      tone: "danger",
                    });
                  }
                  else {
                    armEmptyTrash(true);
                  }
                }}
              >
                {confirmEmpty ? "Click again to confirm" : "Empty Trash"}
              </button>
            )}
            <div className="flex items-center gap-[calc(6px*var(--ui-scale))] rounded-btn bg-ph px-2 py-1">
              <Search className="size-3 opacity-60" />
              <input
                value={query}
                placeholder="Filter"
                className="w-24 bg-transparent text-11.5 text-ink outline-none placeholder:text-ink-2"
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
            {!noRealFolder && (
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
            {!noRealFolder && (
              <button
                type="button"
                aria-label="New folder"
                className="grid size-6 place-items-center rounded-[6px] hover:bg-ph"
                onClick={newFolder}
              >
                <FolderPlus className="size-4" />
              </button>
            )}
            <div className="flex gap-[calc(2px*var(--ui-scale))] rounded-btn bg-ph p-0.5">
              {(["grid", "list", "detail"] as const).map((mode) => {
                const Icon = VIEW_MODE_ICONS[mode];
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-label={`View as ${mode}`}
                    // The active mode was signalled by background alone, so
                    // assistive tech had no way to tell which of the three was
                    // current — the same segmented-control gap the sort
                    // popover avoids by rendering a literal ✓.
                    aria-pressed={view === mode}
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
          folderSizes={sizes}
          view={view}
          sort={sort}
          onSortColumn={applySort}
          selectedIds={selectedIds}
          cursorId={cursorId}
          cutIds={cutIds}
          renamingId={renamingId}
          emptyLabel={
            query
              ? `Nothing matches “${query}”`
              : inTrash
                ? "The Trash is empty"
                : inRecents
                  ? "No recently opened files yet"
                  : "This folder is empty"
          }
          onSelectNode={handleSelectNode}
          onClearSelection={() => setSelectedIds(new Set())}
          onMarqueeSelect={handleMarqueeSelect}
          onOpen={openNode}
          onItemContextMenu={onItemContextMenu}
          onBackgroundContextMenu={onBackgroundContextMenu}
          onRenameCommit={(id, name) => {
            if (!isCommittableRename(name))
              return false;
            rename(id, name);
            setRenamingId(null);
            return true;
          }}
          onRenameCancel={() => setRenamingId(null)}
          onDropInto={handleDrop}
          onUploadInto={onUploadInto}
          cwdId={cwd}
          registerContainer={setContainer}
          registerScrollToId={fn => (scrollToIdRef.current = fn)}
        />

        <div className="flex h-6 flex-none items-center px-3 text-11 text-ink-2 select-none hairline-t">
          {visible.length}
          {" "}
          {visible.length === 1 ? "item" : "items"}
          {selectedIds.size > 0 && (
            <span className="ml-2 opacity-70">
              ·
              {" "}
              {selectedIds.size}
              {" "}
              selected,
              {" "}
              {formatBytes(selectionBytes)}
            </span>
          )}
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
