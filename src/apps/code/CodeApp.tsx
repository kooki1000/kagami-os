import type { MouseEvent } from "react";
import type { ContextMenuEntry } from "@/components/ui/ContextMenu";
import type { AppWindowProps } from "@/system/apps/types";
import type { FileSortSpec } from "@/system/fs/fileScope";
import { ArrowUpDown, FileCode, FolderOpen, Pin, PinOff, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { RenameInput } from "@/components/ui/RenameInput";
import { Segmented } from "@/components/ui/Segmented";
import { buildSortMenuEntries } from "@/components/ui/sortMenuEntries";
import { formatModified } from "@/lib/format";
import { useAppCommand } from "@/system/appCommands";
import { payloadFileId, usePayloadFileId } from "@/system/apps/filePayload";
import { launchApp } from "@/system/apps/launch";
import { filterFiles, folderOptions, scopedFiles, sortFiles, splitPinned } from "@/system/fs/fileScope";
import { isDescendantOf, useFsStore } from "@/system/fs/fsStore";
import { isCommittableRename } from "@/system/fs/renameCommit";
import { DOCUMENTS_ID, HOME_ID } from "@/system/fs/types";
import { useWindowStore } from "@/system/windows/windowStore";
import { CodeEditor } from "./CodeEditor";
import { useCodePrefsStore } from "./codePrefsStore";
import { isEditableFile } from "./languages";

const SORT_LABELS: Record<FileSortSpec["key"], string> = {
  name: "Name",
  date: "Date Modified",
};

/** What a "New File" starts as — a plain text file the user renames straight away. */
const NEW_FILE_NAME = "untitled.txt";

/**
 * The code editor (D4), the last app step 16b was waiting on.
 *
 * Single-instance with a file sidebar rather than tabs: nothing else in the
 * shell has a tab primitive (the Browser deliberately doesn't either), and the
 * sidebar shape Notes established already carries scope, filter, sort and
 * pinning. The listing logic itself is shared — `system/fs/fileScope.ts` —
 * with only the "which files count" predicate differing.
 */
export default function CodeApp({ windowId, payload }: AppWindowProps) {
  const nodes = useFsStore(s => s.nodes);
  const ready = useFsStore(s => s.ready);
  const createFile = useFsStore(s => s.createFile);
  const rename = useFsStore(s => s.rename);
  const moveToTrash = useFsStore(s => s.moveToTrash);
  const duplicate = useFsStore(s => s.duplicate);

  const pinnedIdList = useCodePrefsStore(s => s.pinnedIds);
  const pinnedIds = useMemo(() => new Set(pinnedIdList), [pinnedIdList]);
  const togglePinned = useCodePrefsStore(s => s.togglePinned);
  const scopeMode = useCodePrefsStore(s => s.scopeMode);
  const setScopeMode = useCodePrefsStore(s => s.setScopeMode);
  const sort = useCodePrefsStore(s => s.sort);
  const setSort = useCodePrefsStore(s => s.setSort);
  const toggleWrap = useCodePrefsStore(s => s.toggleWrap);
  const toggleLineNumbers = useCodePrefsStore(s => s.toggleLineNumbers);
  const stepFontSize = useCodePrefsStore(s => s.stepFontSize);

  const [selectedId, setSelectedId] = usePayloadFileId(payload);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; fileId: string } | null>(null);
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");

  const [rawScopeFolderId, setRawScopeFolderId] = useState<string>(() => {
    const initial = selectedId ? nodes[selectedId] : undefined;
    return initial?.parentId ?? DOCUMENTS_ID;
  });
  // Derived rather than effect-corrected — same reasoning as Notes': if the
  // scoped folder was trashed elsewhere, every read falls back home instead
  // of an effect racing to fix stale state.
  const scopeFolderId = nodes[rawScopeFolderId]?.type === "folder" ? rawScopeFolderId : DOCUMENTS_ID;

  // Keep the window's payload pointed at whatever is actually open, so
  // session restore (C1) reopens the file the user was last editing rather
  // than whichever one the window was launched with.
  useEffect(() => {
    const store = useWindowStore.getState();
    const current = store.windows.find(w => w.id === windowId);
    if (current && payloadFileId(current.payload) !== selectedId)
      store.setWindowPayload(windowId, selectedId ? { fileId: selectedId } : undefined);
  }, [windowId, selectedId]);

  // Opening a file outside the current scope brings its folder into scope.
  // Adjusted during render per React's "adjusting state when a prop changes"
  // guidance, not in an effect.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    const node = selectedId ? nodes[selectedId] : undefined;
    if (node && node.parentId !== null && node.type === "file") {
      const inScope = scopeMode === "folder"
        ? node.parentId === scopeFolderId
        : node.parentId === scopeFolderId || isDescendantOf(nodes, node.id, scopeFolderId);
      if (!inScope)
        setRawScopeFolderId(node.parentId);
    }
  }

  const allFiles = useMemo(
    () => scopedFiles(nodes, scopeFolderId, scopeMode, isEditableFile),
    [nodes, scopeFolderId, scopeMode],
  );
  const filteredFiles = useMemo(() => filterFiles(allFiles, query), [allFiles, query]);
  const sortedFiles = useMemo(() => sortFiles(filteredFiles, sort), [filteredFiles, sort]);
  const { pinned, rest } = useMemo(() => splitPinned(sortedFiles, pinnedIds), [sortedFiles, pinnedIds]);
  const listedFiles = useMemo(() => [...pinned, ...rest], [pinned, rest]);

  // The selected file always wins over scope; fall back to the first listed
  // file only when nothing valid is selected.
  const selectedNode = selectedId ? nodes[selectedId] : undefined;
  const doc = selectedNode && isEditableFile(selectedNode) ? selectedNode : listedFiles[0];

  function newFile(): void {
    const node = createFile(scopeFolderId, NEW_FILE_NAME, "", "text/plain");
    setSelectedId(node.id);
    setRenamingId(node.id);
  }

  useAppCommand(windowId, (command) => {
    switch (command) {
      case "code.new":
        newFile();
        break;
      case "code.toggleWrap":
        toggleWrap();
        break;
      case "code.toggleLineNumbers":
        toggleLineNumbers();
        break;
      case "code.biggerText":
        stepFontSize(1);
        break;
      case "code.smallerText":
        stepFontSize(-1);
        break;
    }
  });

  function onFileContextMenu(e: MouseEvent, fileId: string): void {
    e.preventDefault();
    setSelectedId(fileId);
    setMenu({ x: e.clientX, y: e.clientY, fileId });
  }

  function fileMenuEntries(fileId: string): ContextMenuEntry[] {
    const target = nodes[fileId];
    const isPinned = pinnedIds.has(fileId);
    return [
      { label: "Rename", run: () => setRenamingId(fileId) },
      { label: isPinned ? "Unpin" : "Pin", run: () => togglePinned(fileId), dividerAfter: true },
      {
        label: "Duplicate",
        run: () => {
          const copy = duplicate(fileId, target?.parentId ?? scopeFolderId);
          if (copy)
            setSelectedId(copy.id);
        },
      },
      {
        label: "Reveal in Files",
        run: () => launchApp("files", { payload: { folderId: target?.parentId ?? scopeFolderId } }),
        dividerAfter: true,
      },
      {
        label: "Move to Trash",
        run: () => {
          moveToTrash(fileId);
          if (selectedId === fileId)
            setSelectedId(null);
        },
      },
    ];
  }

  function sortMenuEntries(): ContextMenuEntry[] {
    return buildSortMenuEntries(
      sort,
      SORT_LABELS,
      key => setSort({ ...sort, key }),
      () => setSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" }),
    );
  }

  function folderMenuEntries(): ContextMenuEntry[] {
    return folderOptions(nodes, HOME_ID).map(opt => ({
      label: `${"  ".repeat(opt.depth)}${opt.id === scopeFolderId ? "✓ " : ""}${opt.name}`,
      run: () => setRawScopeFolderId(opt.id),
    }));
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
          entries={fileMenuEntries(menu.fileId)}
          onClose={() => setMenu(null)}
        />
      )}
      {sortMenu && (
        <ContextMenu
          x={sortMenu.x}
          y={sortMenu.y}
          header="Sort By"
          entries={sortMenuEntries()}
          onClose={() => setSortMenu(null)}
        />
      )}
      {folderMenu && (
        <ContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          header="Show Files In"
          entries={folderMenuEntries()}
          onClose={() => setFolderMenu(null)}
        />
      )}

      <div className="flex w-[196px] flex-none flex-col bg-surface-2 select-none hairline-r">
        <div className="flex h-[34px] flex-none items-center justify-between pr-1.5 pl-3 hairline-b">
          <span className="font-mono text-[calc(9.5px*var(--ui-scale))] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-70">
            Code
          </span>
          <button
            type="button"
            aria-label="New file"
            title="New file"
            className="grid size-6 place-items-center rounded-[6px] text-ink-2 hover:bg-ph"
            onClick={newFile}
          >
            <Plus className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 hairline-b">
          <div className="flex flex-1 items-center gap-1.5 rounded-btn bg-ph px-2 py-1">
            <Search className="size-3 opacity-60" />
            <input
              value={query}
              placeholder="Filter"
              aria-label="Filter files"
              className="w-full bg-transparent text-11.5 text-ink outline-none placeholder:text-ink-2"
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            aria-label="Sort"
            title={`Sort by ${SORT_LABELS[sort.key]} (${sort.dir === "asc" ? "ascending" : "descending"})`}
            className="grid size-6 flex-none place-items-center rounded-[6px] text-ink-2 hover:bg-ph"
            onClick={e =>
              setSortMenu({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom })}
          >
            <ArrowUpDown className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          <button
            type="button"
            className="flex flex-1 items-center gap-1 truncate rounded-[6px] px-1.5 py-1 text-left text-[calc(10.5px*var(--ui-scale))] text-ink-2 hover:bg-ph"
            onClick={e =>
              setFolderMenu({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom })}
          >
            <FolderOpen className="size-3 flex-none" />
            <span className="truncate">{nodes[scopeFolderId]?.name ?? "Documents"}</span>
          </button>
          <div className="flex-none">
            <Segmented
              size="sm"
              value={scopeMode}
              onChange={setScopeMode}
              options={[
                { value: "folder", label: "Folder", title: "Just this folder" },
                { value: "subtree", label: "+Sub", title: "This folder and its subfolders" },
              ]}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-1.5">
          {pinned.length > 0 && (
            <div className="px-[calc(10px*var(--ui-scale))] pt-1 pb-0.5 text-[calc(10px*var(--ui-scale))] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-60">
              Pinned
            </div>
          )}
          {listedFiles.map((f, i) => (
            <div key={f.id}>
              {i === pinned.length && pinned.length > 0 && (
                <div className="px-[calc(10px*var(--ui-scale))] pt-2 pb-0.5 text-[calc(10px*var(--ui-scale))] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-60">
                  Files
                </div>
              )}
              <button
                type="button"
                data-code-file={f.name}
                className={`group flex w-full items-center gap-1 rounded-[8px] px-[calc(10px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] text-left ${
                  doc?.id === f.id
                    ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]"
                    : "hover:bg-ph"
                }`}
                onClick={() => setSelectedId(f.id)}
                onContextMenu={e => onFileContextMenu(e, f.id)}
              >
                <div className="min-w-0 flex-1">
                  {renamingId === f.id
                    ? (
                        <RenameInput
                          value={f.name}
                          selectStem
                          onCommit={(name) => {
                            if (!isCommittableRename(name))
                              return false;
                            rename(f.id, name);
                            setRenamingId(null);
                            return true;
                          }}
                          onCancel={() => setRenamingId(null)}
                        />
                      )
                    : (
                        <>
                          {/* The whole filename, extension included — it is
                              what tells a `.ts` from a `.tsx` here. */}
                          <span className={`block truncate font-mono text-12 font-medium ${doc?.id === f.id ? "text-accent" : "text-ink"}`}>
                            {f.name}
                          </span>
                          <span className="block truncate text-[calc(10.5px*var(--ui-scale))] text-ink-2">
                            {f.parentId ? nodes[f.parentId]?.name : ""}
                            {" · "}
                            {formatModified(f.modifiedAt)}
                          </span>
                        </>
                      )}
                </div>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={pinnedIds.has(f.id) ? "Unpin" : "Pin"}
                  className={`grid size-5 flex-none place-items-center rounded-[5px] text-ink-2 hover:bg-ph-2 ${
                    pinnedIds.has(f.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinned(f.id);
                  }}
                >
                  {pinnedIds.has(f.id) ? <Pin className="size-3 fill-current" /> : <PinOff className="size-3" />}
                </span>
              </button>
            </div>
          ))}
          {listedFiles.length === 0 && (
            <div className="px-[calc(10px*var(--ui-scale))] py-3 text-11.5 text-ink-2">
              {query ? "No matches" : "No files here yet"}
            </div>
          )}
        </div>
      </div>

      {doc
        ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-[34px] flex-none items-center gap-2 px-4 text-12 select-none hairline-b">
                <span className="truncate font-mono font-semibold text-ink" data-code-filename>{doc.name}</span>
                {doc.parentId && <span className="truncate text-ink-2">{nodes[doc.parentId]?.name}</span>}
              </div>
              <CodeEditor key={doc.id} doc={doc} windowId={windowId} />
            </div>
          )
        : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-2">
              <FileCode className="size-7" strokeWidth={1.4} />
              <span className="text-13">No files to edit here</span>
              <button
                type="button"
                className="mt-1 rounded-btn bg-accent-strong px-3 py-1 text-12 font-medium text-white"
                onClick={newFile}
              >
                New File
              </button>
            </div>
          )}
    </div>
  );
}
