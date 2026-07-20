import type { MouseEvent } from "react";
import type { AppWindowProps } from "@/system/apps/types";
import type { FsNode } from "@/system/fs/types";
import { NotebookPen, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { RenameInput } from "@/components/ui/RenameInput";
import { formatModified, nameStem } from "@/lib/format";
import { useAppCommand } from "@/system/appCommands";
import { payloadFileId } from "@/system/apps/openFile";
import { isDescendantOf, isValidNodeName, useFsStore } from "@/system/fs/fsStore";
import { DOCUMENTS_ID, TRASH_ID } from "@/system/fs/types";
import { notify } from "@/system/notifications/notificationStore";
import { useWindowStore } from "@/system/windows/windowStore";

const AUTOSAVE_MS = 600;

function NoteEditor({ doc }: { doc: FsNode }) {
  const updateFileContent = useFsStore(s => s.updateFileContent);
  const nodes = useFsStore(s => s.nodes);
  // Blob-backed text has no reader here yet; an empty editable buffer would
  // invite a keystroke that replaces the whole file, so show it read-only.
  const external = doc.contentRef !== undefined;
  const [draft, setDraft] = useState(doc.content ?? "");
  const saved = draft === (doc.content ?? "");

  // Keep latest values readable from the unmount flush below. Synced in an
  // effect (not during render) so refs stay outside the render phase, per
  // react-hooks/refs.
  const flushRef = useRef({ saved, draft });
  useLayoutEffect(() => {
    flushRef.current = { saved, draft };
  });

  useEffect(() => {
    if (saved || external)
      return;
    const timer = window.setTimeout(updateFileContent, AUTOSAVE_MS, doc.id, draft);
    return () => window.clearTimeout(timer);
  }, [saved, external, draft, doc.id, updateFileContent]);

  // Flush pending edits when switching notes / closing the window.
  useEffect(() => () => {
    if (!flushRef.current.saved && !external)
      updateFileContent(doc.id, flushRef.current.draft);
  }, [doc.id, external, updateFileContent]);

  const folderName = doc.parentId ? nodes[doc.parentId]?.name : undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-[34px] flex-none items-center gap-2 px-4 text-[12px] select-none hairline-b">
        <span className="truncate font-semibold text-ink">{nameStem(doc.name)}</span>
        {folderName && <span className="truncate text-ink-2">{folderName}</span>}
        <span className={`ml-auto flex-none text-[11px] ${saved || external ? "text-ink-2" : "text-accent"}`}>
          {external ? "Read-only" : saved ? "Saved" : "Editing…"}
        </span>
      </div>
      {external
        ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-ink-2 select-none">
              <NotebookPen className="size-7" strokeWidth={1.4} />
              <span className="text-[13px]">This file is too large to edit in Notes</span>
              <span className="text-[11.5px] opacity-70">
                Download it from Files to read the full contents.
              </span>
            </div>
          )
        : (
            <textarea
              value={draft}
              placeholder="Start writing…"
              className="min-h-0 w-full flex-1 resize-none bg-transparent p-5 font-mono text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-2"
              onChange={e => setDraft(e.target.value)}
            />
          )}
    </div>
  );
}

export default function NotesApp({ windowId, payload }: AppWindowProps) {
  const nodes = useFsStore(s => s.nodes);
  const ready = useFsStore(s => s.ready);
  const createFile = useFsStore(s => s.createFile);
  const rename = useFsStore(s => s.rename);
  const moveToTrash = useFsStore(s => s.moveToTrash);

  const [selectedId, setSelectedId] = useState<string | null>(() => payloadFileId(payload));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; docId: string } | null>(null);

  // A re-launch ("open this file in Notes") replaces the window payload
  // with a fresh object; adopt its file as the selection (state adjustment
  // during render). Compared by identity, not fileId, so re-opening the
  // same file after switching notes still re-selects it.
  const [lastPayload, setLastPayload] = useState(payload);
  if (payload !== lastPayload) {
    setLastPayload(payload);
    const payloadId = payloadFileId(payload);
    if (payloadId)
      setSelectedId(payloadId);
  }

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

  // Every text document on the drive (not in the Trash), newest first.
  const docs = useMemo(
    () =>
      Object.values(nodes)
        .filter(
          n =>
            n.type === "file"
            && (n.mimeType?.startsWith("text/") ?? false)
            && n.parentId !== TRASH_ID
            && !isDescendantOf(nodes, n.id, TRASH_ID),
        )
        .sort((a, b) => b.modifiedAt - a.modifiedAt),
    [nodes],
  );

  const doc
    = (selectedId ? docs.find(d => d.id === selectedId) : undefined) ?? docs[0];

  function newNote(): void {
    const node = createFile(DOCUMENTS_ID, "Untitled.md", "", "text/markdown");
    setSelectedId(node.id);
    setRenamingId(node.id);
  }

  useAppCommand(windowId, (command) => {
    if (command === "notes.new")
      newNote();
  });

  function onDocContextMenu(e: MouseEvent, docId: string): void {
    e.preventDefault();
    setSelectedId(docId);
    setMenu({ x: e.clientX, y: e.clientY, docId });
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
          entries={[
            { label: "Rename", run: () => setRenamingId(menu.docId), dividerAfter: true },
            { label: "Move to Trash", run: () => moveToTrash(menu.docId), danger: true },
          ]}
          onClose={() => setMenu(null)}
        />
      )}

      <div className="flex w-[168px] flex-none flex-col bg-surface-2 select-none hairline-r">
        <div className="flex h-[34px] flex-none items-center justify-between pr-1.5 pl-3 hairline-b">
          <span className="font-mono text-[9.5px] font-semibold tracking-[0.5px] text-ink-2 uppercase opacity-70">
            Notes
          </span>
          <button
            type="button"
            aria-label="New note"
            className="grid size-6 place-items-center rounded-[6px] text-ink-2 hover:bg-ph"
            onClick={newNote}
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {docs.map(d => (
            <button
              key={d.id}
              type="button"
              className={`block w-full rounded-[8px] px-2.5 py-1.5 text-left ${
                doc?.id === d.id
                  ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]"
                  : "hover:bg-ph"
              }`}
              onClick={() => setSelectedId(d.id)}
              onContextMenu={e => onDocContextMenu(e, d.id)}
            >
              {renamingId === d.id
                ? (
                    <RenameInput
                      value={d.name}
                      selectStem
                      onCommit={(name) => {
                        if (name.trim() && !isValidNodeName(name)) {
                          notify({
                            title: "Can’t rename",
                            body: "Names can’t contain a slash (/).",
                            tone: "danger",
                          });
                          return;
                        }
                        rename(d.id, name);
                        setRenamingId(null);
                      }}
                      onCancel={() => setRenamingId(null)}
                    />
                  )
                : (
                    <>
                      <span
                        className={`block truncate text-[12.5px] font-medium ${
                          doc?.id === d.id ? "text-accent" : "text-ink"
                        }`}
                      >
                        {nameStem(d.name)}
                      </span>
                      <span className="block truncate text-[10.5px] text-ink-2">
                        {d.parentId ? nodes[d.parentId]?.name : ""}
                        {" · "}
                        {formatModified(d.modifiedAt)}
                      </span>
                    </>
                  )}
            </button>
          ))}
          {docs.length === 0 && (
            <div className="px-2.5 py-3 text-[11.5px] text-ink-2">
              No notes yet
            </div>
          )}
        </div>
      </div>

      {doc
        ? (
            <NoteEditor key={doc.id} doc={doc} />
          )
        : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-2">
              <NotebookPen className="size-7" strokeWidth={1.4} />
              <span className="text-[13px]">Create your first note</span>
              <button
                type="button"
                className="mt-1 rounded-btn bg-accent px-3 py-1 text-[12px] font-medium text-white"
                onClick={newNote}
              >
                New Note
              </button>
            </div>
          )}
    </div>
  );
}
