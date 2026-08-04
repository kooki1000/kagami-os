import type { MouseEvent } from "react";
import type { NotesSortKey } from "./notesFilter";
import type { ContextMenuEntry } from "@/components/ui/ContextMenu";
import type { AppWindowProps } from "@/system/apps/types";
import {
  ArrowUpDown,
  FolderOpen,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { RenameInput } from "@/components/ui/RenameInput";
import { Segmented } from "@/components/ui/Segmented";
import { buildSortMenuEntries } from "@/components/ui/sortMenuEntries";
import { formatModified, nameStem } from "@/lib/format";
import { useAppCommand } from "@/system/appCommands";
import { payloadFileId, usePayloadFileId } from "@/system/apps/filePayload";
import { launchApp } from "@/system/apps/launch";
import { isDescendantOf, useFsStore } from "@/system/fs/fsStore";
import { isCommittableRename } from "@/system/fs/renameCommit";
import { DOCUMENTS_ID, HOME_ID, TRASH_ID } from "@/system/fs/types";
import { useWindowStore } from "@/system/windows/windowStore";
import { NoteEditor } from "./NoteEditor";
import {
  filterDocs,
  folderOptions,
  scopedDocs,
  sortDocs,
  splitPinned,
} from "./notesFilter";
import { useNotesPrefsStore } from "./notesPrefsStore";
import { findTemplate, NOTE_TEMPLATES } from "./noteTemplates";

const SORT_LABELS: Record<NotesSortKey, string> = {
  name: "Name",
  date: "Date Modified",
};

export default function NotesApp({ windowId, payload }: AppWindowProps) {
  const nodes = useFsStore(s => s.nodes);
  const ready = useFsStore(s => s.ready);
  const createFile = useFsStore(s => s.createFile);
  const rename = useFsStore(s => s.rename);
  const moveToTrash = useFsStore(s => s.moveToTrash);
  const duplicate = useFsStore(s => s.duplicate);

  const pinnedIdList = useNotesPrefsStore(s => s.pinnedIds);
  const pinnedIds = useMemo(() => new Set(pinnedIdList), [pinnedIdList]);
  const togglePinned = useNotesPrefsStore(s => s.togglePinned);
  const scopeMode = useNotesPrefsStore(s => s.scopeMode);
  const setScopeMode = useNotesPrefsStore(s => s.setScopeMode);
  const sort = useNotesPrefsStore(s => s.sort);
  const setSort = useNotesPrefsStore(s => s.setSort);

  const [selectedId, setSelectedId] = usePayloadFileId(payload);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number } | null>(null);
  const [templateMenu, setTemplateMenu] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [focusMode, setFocusMode] = useState(false);

  const [rawScopeFolderId, setRawScopeFolderId] = useState<string>(() => {
    const initial = selectedId ? nodes[selectedId] : undefined;
    return initial?.parentId ?? DOCUMENTS_ID;
  });
  // Derived rather than effect-corrected: if the scoped folder vanished
  // (trashed/deleted elsewhere) every read of `scopeFolderId` just falls
  // back home instead of a separate effect racing to "fix" stale state.
  const scopeFolderId = nodes[rawScopeFolderId]?.type === "folder" ? rawScopeFolderId : DOCUMENTS_ID;

  // Keep the window's payload in sync with whichever note is actually
  // showing (selecting a note in the sidebar is internal state, not a
  // re-launch) — otherwise session restore (C1) would only ever reopen
  // whichever note Notes happened to be launched with.
  useEffect(() => {
    const store = useWindowStore.getState();
    const current = store.windows.find(w => w.id === windowId);
    if (current && payloadFileId(current.payload) !== selectedId)
      store.setWindowPayload(windowId, selectedId ? { fileId: selectedId } : undefined);
  }, [windowId, selectedId]);

  // Opening a note outside the current scope (a re-launch via "Open with",
  // "Reveal", session restore, …) brings its folder into scope instead of
  // leaving the sidebar pointed somewhere that can never show it selected.
  // Adjusted during render (comparing against the previous render's
  // `selectedId`), not in a `useEffect`, per React's own guidance for
  // "adjusting state when a prop changes" — avoids the extra commit a
  // post-render effect would cost.
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

  const allDocs = useMemo(() => scopedDocs(nodes, scopeFolderId, scopeMode), [nodes, scopeFolderId, scopeMode]);
  const filteredDocs = useMemo(() => filterDocs(allDocs, query), [allDocs, query]);
  const sortedDocs = useMemo(() => sortDocs(filteredDocs, sort), [filteredDocs, sort]);
  const { pinned, rest } = useMemo(() => splitPinned(sortedDocs, pinnedIds), [sortedDocs, pinnedIds]);
  const listedDocs = useMemo(() => [...pinned, ...rest], [pinned, rest]);

  // The selected note always wins over scope (see the widen-scope adjustment
  // above) — falling back to the first listed note only when nothing valid
  // is selected, same as the pre-U11 `docs.find(...) ?? docs[0]` fallback.
  const selectedNode = selectedId ? nodes[selectedId] : undefined;
  const selectedIsValidDoc = !!selectedNode
    && selectedNode.type === "file"
    && (selectedNode.mimeType?.startsWith("text/") ?? false)
    && !isDescendantOf(nodes, selectedNode.id, TRASH_ID);
  const doc = selectedIsValidDoc ? selectedNode : listedDocs[0];

  function newNote(templateId: string = "blank"): void {
    const template = findTemplate(templateId);
    const node = createFile(scopeFolderId, template.fileName, template.content, "text/markdown");
    setSelectedId(node.id);
    if (template.content === "")
      setRenamingId(node.id);
  }

  useAppCommand(windowId, (command) => {
    if (command === "notes.new")
      newNote();
    else if (command === "notes.focusMode")
      setFocusMode(f => !f);
  });

  function onDocContextMenu(e: MouseEvent, docId: string): void {
    e.preventDefault();
    setSelectedId(docId);
    setMenu({ x: e.clientX, y: e.clientY, docId });
  }

  function docMenuEntries(docId: string): ContextMenuEntry[] {
    const target = nodes[docId];
    const isPinned = pinnedIds.has(docId);
    return [
      { label: "Rename", run: () => setRenamingId(docId) },
      { label: isPinned ? "Unpin" : "Pin", run: () => togglePinned(docId), dividerAfter: true },
      {
        label: "Duplicate",
        run: () => {
          const copy = duplicate(docId, target?.parentId ?? scopeFolderId);
          if (copy)
            setSelectedId(copy.id);
        },
      },
      {
        label: "Reveal in Files",
        run: () => launchApp("files", { payload: { folderId: target?.parentId ?? DOCUMENTS_ID } }),
        dividerAfter: true,
      },
      { label: "Move to Trash", run: () => moveToTrash(docId), danger: true },
    ];
  }

  /** Pick a sort key for the sidebar list; re-picking it flips direction. Mirrors Files' `applySort`. */
  function applySort(key: NotesSortKey): void {
    setSort(
      key === sort.key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" ? "desc" : "asc" },
    );
  }

  function toggleSortDir(): void {
    setSort({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" });
  }

  function sortMenuEntries(): ContextMenuEntry[] {
    return buildSortMenuEntries(sort, SORT_LABELS, applySort, toggleSortDir);
  }

  function folderMenuEntries(): ContextMenuEntry[] {
    return folderOptions(nodes, HOME_ID).map(opt => ({
      label: `${"  ".repeat(opt.depth)}${opt.id === scopeFolderId ? "✓ " : ""}${opt.name}`,
      run: () => setRawScopeFolderId(opt.id),
    }));
  }

  function templateMenuEntries(): ContextMenuEntry[] {
    return NOTE_TEMPLATES.map(t => ({ label: t.label, run: () => newNote(t.id) }));
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
          entries={docMenuEntries(menu.docId)}
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
          header="Show Notes In"
          entries={folderMenuEntries()}
          onClose={() => setFolderMenu(null)}
        />
      )}
      {templateMenu && (
        <ContextMenu
          x={templateMenu.x}
          y={templateMenu.y}
          header="New Note"
          entries={templateMenuEntries()}
          onClose={() => setTemplateMenu(null)}
        />
      )}

      {!focusMode && (
        <div className="flex w-[196px] flex-none flex-col bg-surface-2 select-none hairline-r">
          <div className="flex h-[34px] flex-none items-center justify-between pr-1.5 pl-3 hairline-b">
            <span className="font-mono text-[calc(9.5px*var(--ui-scale))] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-70">
              Notes
            </span>
            <button
              type="button"
              aria-label="New note"
              title="New note…"
              className="grid size-6 place-items-center rounded-[6px] text-ink-2 hover:bg-ph"
              onClick={e =>
                setTemplateMenu({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom })}
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
            {listedDocs.map((d, i) => (
              <div key={d.id}>
                {i === pinned.length && pinned.length > 0 && (
                  <div className="px-[calc(10px*var(--ui-scale))] pt-2 pb-0.5 text-[calc(10px*var(--ui-scale))] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-60">
                    Notes
                  </div>
                )}
                <button
                  type="button"
                  className={`group flex w-full items-center gap-1 rounded-[8px] px-[calc(10px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] text-left ${
                    doc?.id === d.id
                      ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]"
                      : "hover:bg-ph"
                  }`}
                  onClick={() => setSelectedId(d.id)}
                  onContextMenu={e => onDocContextMenu(e, d.id)}
                >
                  <div className="min-w-0 flex-1">
                    {renamingId === d.id
                      ? (
                          <RenameInput
                            value={d.name}
                            selectStem
                            onCommit={(name) => {
                              if (!isCommittableRename(name))
                                return false;
                              rename(d.id, name);
                              setRenamingId(null);
                              return true;
                            }}
                            onCancel={() => setRenamingId(null)}
                          />
                        )
                      : (
                          <>
                            <span
                              className={`block truncate text-12.5 font-medium ${
                                doc?.id === d.id ? "text-accent" : "text-ink"
                              }`}
                            >
                              {nameStem(d.name)}
                            </span>
                            <span className="block truncate text-[calc(10.5px*var(--ui-scale))] text-ink-2">
                              {d.parentId ? nodes[d.parentId]?.name : ""}
                              {" · "}
                              {formatModified(d.modifiedAt)}
                            </span>
                          </>
                        )}
                  </div>
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={pinnedIds.has(d.id) ? "Unpin" : "Pin"}
                    className={`grid size-5 flex-none place-items-center rounded-[5px] text-ink-2 hover:bg-ph-2 ${
                      pinnedIds.has(d.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePinned(d.id);
                    }}
                  >
                    {pinnedIds.has(d.id) ? <Pin className="size-3 fill-current" /> : <PinOff className="size-3" />}
                  </span>
                </button>
              </div>
            ))}
            {listedDocs.length === 0 && (
              <div className="px-[calc(10px*var(--ui-scale))] py-3 text-11.5 text-ink-2">
                {query ? "No matches" : "No notes here yet"}
              </div>
            )}
          </div>
        </div>
      )}

      {doc
        ? (
            <NoteEditor key={doc.id} doc={doc} windowId={windowId} focusMode={focusMode} onToggleFocusMode={() => setFocusMode(f => !f)} />
          )
        : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-2">
              <NotebookPen className="size-7" strokeWidth={1.4} />
              <span className="text-13">Create your first note</span>
              <button
                type="button"
                className="mt-1 rounded-btn bg-accent-strong px-3 py-1 text-12 font-medium text-white"
                onClick={() => newNote()}
              >
                New Note
              </button>
            </div>
          )}
    </div>
  );
}
