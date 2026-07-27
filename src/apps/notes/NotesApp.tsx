import type { MouseEvent } from "react";
import type { NotesSortKey } from "./notesFilter";
import type { ContextMenuEntry } from "@/components/ui/ContextMenu";
import type { AppWindowProps } from "@/system/apps/types";
import type { FsNode } from "@/system/fs/types";
import {
  AArrowDown,
  AArrowUp,
  ArrowUpDown,
  Bold,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FolderOpen,
  Heading,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  Replace,
  Search,
  Underline,
  WrapText,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { RenameInput } from "@/components/ui/RenameInput";
import { formatBytes, formatModified, nameStem } from "@/lib/format";
import { useAppCommand } from "@/system/appCommands";
import { payloadFileId, usePayloadFileId } from "@/system/apps/filePayload";
import { launchApp } from "@/system/apps/launch";
import { blobStore } from "@/system/fs/blobStore";
import { isDescendantOf, useFsStore } from "@/system/fs/fsStore";
import { isCommittableRename } from "@/system/fs/renameCommit";
import { BLOB_INLINE_THRESHOLD, DOCUMENTS_ID, HOME_ID, TRASH_ID } from "@/system/fs/types";
import { useWindowStore } from "@/system/windows/windowStore";
import {
  charCount,
  findMatches,
  replaceAllMatches,
  replaceOne,
  stepMatch,
  wordCount,
} from "./findReplace";
import {
  toggleBulletList,
  toggleHeadingLine,
  toggleInlineWrap,
  toggleNumberList,
} from "./markdownFormat";
import { NotePreview } from "./NotePreview";
import {
  filterDocs,
  folderOptions,
  scopedDocs,
  sortDocs,
  splitPinned,
} from "./notesFilter";
import { useNotesPrefsStore } from "./notesPrefsStore";
import { findTemplate, NOTE_TEMPLATES } from "./noteTemplates";

const AUTOSAVE_MS = 600;

/** Blob-backed text over this size stays read-only (ROADMAP.md §8's own step-15 metric). */
const BLOB_TEXT_LIMIT = 5 * 1024 * 1024;

const SORT_LABELS: Record<NotesSortKey, string> = {
  name: "Name",
  date: "Date Modified",
};

type BlobTextStatus = "none" | "loading" | "ready" | "toolarge" | "missing";

function NoteEditor({
  doc,
  windowId,
  focusMode,
  onToggleFocusMode,
}: {
  doc: FsNode;
  windowId: string;
  focusMode: boolean;
  onToggleFocusMode: () => void;
}) {
  const updateFileContent = useFsStore(s => s.updateFileContent);
  const setFileBlob = useFsStore(s => s.setFileBlob);
  const nodes = useFsStore(s => s.nodes);
  const fontSize = useNotesPrefsStore(s => s.fontSize);
  const stepFontSize = useNotesPrefsStore(s => s.stepFontSize);
  const wordWrap = useNotesPrefsStore(s => s.wordWrap);
  const setWordWrap = useNotesPrefsStore(s => s.setWordWrap);

  const hash = doc.contentRef?.hash;
  const [blobStatus, setBlobStatus] = useState<BlobTextStatus>(() => {
    if (!doc.contentRef)
      return "none";
    return doc.contentRef.size > BLOB_TEXT_LIMIT ? "toolarge" : "loading";
  });
  const [draft, setDraft] = useState(doc.content ?? "");
  // What's actually persisted right now — compared against `draft` for the
  // "Saved"/"Editing…" indicator. Not `doc.content`: a blob-backed file has
  // no inline content to compare against, so this is set once the blob text
  // loads and again after every successful save (either representation).
  const [savedText, setSavedText] = useState<string | null>(doc.content ?? (doc.contentRef ? null : ""));

  // Load blob-backed text once (review-backlog #11 / U11): gated on size so
  // a multi-hundred-MB binary-ish file never gets slurped into a string.
  useEffect(() => {
    if (blobStatus !== "loading" || !hash)
      return;
    let cancelled = false;
    void blobStore.get(hash).then(async (blob) => {
      if (cancelled)
        return;
      if (!blob) {
        setBlobStatus("missing");
        return;
      }
      const text = await blob.text();
      if (cancelled)
        return;
      setSavedText(text);
      setDraft(text);
      setBlobStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [blobStatus, hash]);

  const editable = blobStatus === "none" || blobStatus === "ready";
  const saved = draft === savedText;

  /**
   * Save `content`, migrating between `node.content` and the blob store as
   * its byte size crosses `BLOB_INLINE_THRESHOLD` in either direction — the
   * fix for review-backlog #11. `new Blob([content]).size` gives the same
   * UTF-8 byte count `contentRef.size` already means everywhere else.
   * `useCallback`'d (deps: only `doc.id`/`doc.mimeType`, stable for this
   * doc.id-keyed mount) so both effects below can list it as a dependency
   * instead of disabling exhaustive-deps.
   */
  const persist = useCallback(async (content: string): Promise<void> => {
    const byteSize = new Blob([content]).size;
    if (byteSize > BLOB_INLINE_THRESHOLD)
      await setFileBlob(doc.id, new Blob([content], { type: doc.mimeType ?? "text/plain" }));
    else
      updateFileContent(doc.id, content);
    setSavedText(content);
  }, [doc.id, doc.mimeType, setFileBlob, updateFileContent]);

  // Keep latest values readable from the unmount flush below. Synced in an
  // effect (not during render) so refs stay outside the render phase, per
  // react-hooks/refs.
  const flushRef = useRef({ editable, saved, draft });
  useLayoutEffect(() => {
    flushRef.current = { editable, saved, draft };
  });

  useEffect(() => {
    if (!editable || saved)
      return;
    const timer = window.setTimeout(() => {
      void persist(draft);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [editable, saved, draft, persist]);

  // Flush pending edits when switching notes / closing the window.
  useEffect(() => () => {
    const flush = flushRef.current;
    if (flush.editable && !flush.saved)
      void persist(flush.draft);
  }, [doc.id, persist]);

  const folderName = doc.parentId ? nodes[doc.parentId]?.name : undefined;

  /* ---------- find & replace (Cmd+F / Cmd+G) ---------- */

  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState<number | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const matches = useMemo(() => findMatches(draft, findQuery), [draft, findQuery]);

  function openFind(): void {
    setFindOpen(true);
    requestAnimationFrame(() => findInputRef.current?.select());
  }

  function closeFind(): void {
    setFindOpen(false);
    setMatchIndex(null);
    textareaRef.current?.focus();
  }

  function jump(direction: 1 | -1): void {
    if (!findOpen)
      setFindOpen(true);
    setMatchIndex(stepMatch(matches.length, matchIndex, direction));
  }

  // Move the textarea's native selection to the current match — a plain
  // `<textarea>` has no per-range highlight API, so "showing" a match means
  // selecting it (same limitation any plain-textarea find bar accepts).
  useEffect(() => {
    if (matchIndex === null)
      return;
    const at = matches[matchIndex];
    if (at === undefined)
      return;
    const el = textareaRef.current;
    if (!el)
      return;
    el.focus();
    el.setSelectionRange(at, at + findQuery.length);
  }, [matchIndex, matches, findQuery.length]);

  function doReplaceOne(): void {
    if (matchIndex === null)
      return;
    setDraft(d => replaceOne(d, matches, matchIndex, findQuery.length, replaceQuery));
    setMatchIndex(null);
  }

  function doReplaceAll(): void {
    if (!findQuery)
      return;
    setDraft(d => replaceAllMatches(d, findQuery, replaceQuery));
    setMatchIndex(null);
  }

  /* ---------- formatting toolbar (bold/italic/underline/heading/lists) ---------- */

  const [previewMode, setPreviewMode] = useState(false);

  // Restore the textarea's selection after a formatting edit, once the new
  // `draft` has committed and re-rendered — same rAF-after-state-change
  // pattern `openFind` above already uses for `findInputRef`.
  function applyFormat(fn: (text: string, start: number, end: number) => { text: string; selectionStart: number; selectionEnd: number }): void {
    const el = textareaRef.current;
    if (!el)
      return;
    const result = fn(draft, el.selectionStart, el.selectionEnd);
    setDraft(result.text);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta)
        return;
      ta.focus();
      ta.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  useAppCommand(windowId, (command) => {
    if (!editable)
      return;
    switch (command) {
      case "notes.find":
        setPreviewMode(false);
        openFind();
        break;
      case "notes.findNext":
        setPreviewMode(false);
        jump(1);
        break;
      case "notes.findPrev":
        setPreviewMode(false);
        jump(-1);
        break;
      case "notes.bold":
        applyFormat((t, s, e) => toggleInlineWrap(t, s, e, "**", "**"));
        break;
      case "notes.italic":
        applyFormat((t, s, e) => toggleInlineWrap(t, s, e, "*", "*"));
        break;
      case "notes.underline":
        applyFormat((t, s, e) => toggleInlineWrap(t, s, e, "<u>", "</u>"));
        break;
      case "notes.heading":
        applyFormat(toggleHeadingLine);
        break;
      case "notes.bulletList":
        applyFormat(toggleBulletList);
        break;
      case "notes.numberList":
        applyFormat(toggleNumberList);
        break;
      case "notes.togglePreview":
        setPreviewMode(p => !p);
        break;
    }
  });

  if (blobStatus === "toolarge" || blobStatus === "missing" || blobStatus === "loading") {
    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[34px] flex-none items-center gap-2 px-4 text-12 select-none hairline-b">
          <span className="truncate font-semibold text-ink">{nameStem(doc.name)}</span>
          {folderName && <span className="truncate text-ink-2">{folderName}</span>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-ink-2 select-none">
          <NotebookPen className="size-7" strokeWidth={1.4} />
          {blobStatus === "loading" && <span className="text-13">Loading…</span>}
          {blobStatus === "missing" && <span className="text-13">This file's contents couldn't be found</span>}
          {blobStatus === "toolarge" && doc.contentRef && (
            <>
              <span className="text-13">
                This file is too large to edit in Notes (
                {formatBytes(doc.contentRef.size)}
                )
              </span>
              <span className="text-11.5 opacity-70">
                Download it from Files to read the full contents.
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      {focusMode && (
        <button
          type="button"
          aria-label="Exit focus mode"
          title="Exit focus mode"
          className="absolute top-3 right-3 z-10 grid size-6 place-items-center rounded-full bg-ph/80 text-ink-2 hover:bg-ph"
          onClick={onToggleFocusMode}
        >
          <Minimize2 className="size-3.5" />
        </button>
      )}

      {!focusMode && (
        <div className="flex h-[34px] flex-none items-center gap-2 px-4 text-12 select-none hairline-b">
          <span className="truncate font-semibold text-ink">{nameStem(doc.name)}</span>
          {folderName && <span className="truncate text-ink-2">{folderName}</span>}
          <span className="ml-auto flex-none text-11 text-ink-2">
            {saved ? "Saved" : "Editing…"}
          </span>
        </div>
      )}

      {!focusMode && (
        <div className="flex h-[26px] flex-none items-center gap-1 px-4 text-ink-2 select-none hairline-b">
          <button type="button" aria-label="Decrease font size" title="Decrease font size" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => stepFontSize(-1)}>
            <AArrowDown className="size-3.5" />
          </button>
          <button type="button" aria-label="Increase font size" title="Increase font size" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => stepFontSize(1)}>
            <AArrowUp className="size-3.5" />
          </button>
          <span className="text-[calc(10.5px*var(--ui-scale))] tabular-nums opacity-70">
            {fontSize}
            px
          </span>
          <button
            type="button"
            aria-label="Toggle soft wrap"
            title="Soft wrap"
            className={`grid size-5 place-items-center rounded-[5px] hover:bg-ph ${wordWrap ? "text-accent" : ""}`}
            onClick={() => setWordWrap(!wordWrap)}
          >
            <WrapText className="size-3.5" />
          </button>
          <button type="button" aria-label="Enter focus mode" title="Focus mode" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={onToggleFocusMode}>
            <Maximize2 className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={previewMode ? "Exit preview" : "Preview"}
            title={previewMode ? "Exit preview" : "Preview"}
            className={`grid size-5 place-items-center rounded-[5px] hover:bg-ph ${previewMode ? "text-accent" : ""}`}
            onClick={() => setPreviewMode(p => !p)}
          >
            {previewMode ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <span className="ml-auto text-[calc(10.5px*var(--ui-scale))] tabular-nums opacity-70">
            {wordCount(draft)}
            {" words · "}
            {charCount(draft)}
            {" chars"}
          </span>
        </div>
      )}

      {!focusMode && !previewMode && (
        <div className="flex h-[26px] flex-none items-center gap-1 px-4 text-ink-2 select-none hairline-b">
          <button type="button" aria-label="Bold" title="Bold (⌘B)" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => applyFormat((t, s, e) => toggleInlineWrap(t, s, e, "**", "**"))}>
            <Bold className="size-3.5" />
          </button>
          <button type="button" aria-label="Italic" title="Italic (⌘I)" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => applyFormat((t, s, e) => toggleInlineWrap(t, s, e, "*", "*"))}>
            <Italic className="size-3.5" />
          </button>
          <button type="button" aria-label="Underline" title="Underline (⌘U)" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => applyFormat((t, s, e) => toggleInlineWrap(t, s, e, "<u>", "</u>"))}>
            <Underline className="size-3.5" />
          </button>
          <button type="button" aria-label="Heading" title="Cycle heading level (⇧⌘H)" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => applyFormat(toggleHeadingLine)}>
            <Heading className="size-3.5" />
          </button>
          <button type="button" aria-label="Bulleted list" title="Bulleted list (⇧⌘L)" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => applyFormat(toggleBulletList)}>
            <List className="size-3.5" />
          </button>
          <button type="button" aria-label="Numbered list" title="Numbered list (⇧⌘O)" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => applyFormat(toggleNumberList)}>
            <ListOrdered className="size-3.5" />
          </button>
        </div>
      )}

      {findOpen && editable && !previewMode && (
        <div className="flex flex-none items-center gap-1.5 px-3 py-1.5 hairline-b">
          <input
            ref={findInputRef}
            value={findQuery}
            placeholder="Find"
            className="w-32 rounded-[6px] bg-ph px-2 py-1 text-11.5 text-ink outline-none placeholder:text-ink-2"
            onChange={(e) => {
              setFindQuery(e.target.value);
              setMatchIndex(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                jump(e.shiftKey ? -1 : 1);
              }
              else if (e.key === "Escape") {
                closeFind();
              }
            }}
          />
          <span className="w-10 flex-none text-[calc(10.5px*var(--ui-scale))] text-ink-2 tabular-nums">
            {matches.length ? `${(matchIndex ?? 0) + 1}/${matches.length}` : "0/0"}
          </span>
          <button type="button" aria-label="Previous match" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => jump(-1)}>
            <ChevronUp className="size-3.5" />
          </button>
          <button type="button" aria-label="Next match" className="grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={() => jump(1)}>
            <ChevronDown className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Toggle replace"
            className={`grid size-5 place-items-center rounded-[5px] hover:bg-ph ${replaceOpen ? "text-accent" : ""}`}
            onClick={() => setReplaceOpen(o => !o)}
          >
            <Replace className="size-3.5" />
          </button>
          <button type="button" aria-label="Close find" className="ml-auto grid size-5 place-items-center rounded-[5px] hover:bg-ph" onClick={closeFind}>
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {findOpen && editable && replaceOpen && !previewMode && (
        <div className="flex flex-none items-center gap-1.5 px-3 py-1.5 hairline-b">
          <input
            value={replaceQuery}
            placeholder="Replace"
            className="w-32 rounded-[6px] bg-ph px-2 py-1 text-11.5 text-ink outline-none placeholder:text-ink-2"
            onChange={e => setReplaceQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape")
                closeFind();
            }}
          />
          <button type="button" className="rounded-btn bg-ph px-2 py-1 text-11 font-medium text-ink hover:bg-ph-2" onClick={doReplaceOne}>
            Replace
          </button>
          <button type="button" className="rounded-btn bg-ph px-2 py-1 text-11 font-medium text-ink hover:bg-ph-2" onClick={doReplaceAll}>
            Replace All
          </button>
        </div>
      )}

      {previewMode
        ? (
            <NotePreview text={draft} />
          )
        : (
            <textarea
              ref={textareaRef}
              value={draft}
              placeholder="Start writing…"
              wrap={wordWrap ? "soft" : "off"}
              style={{ fontSize: `calc(${fontSize}px * var(--ui-scale))` }}
              className={`min-h-0 w-full flex-1 resize-none bg-transparent p-5 font-mono leading-relaxed text-ink outline-none placeholder:text-ink-2 ${
                wordWrap ? "" : "overflow-x-auto whitespace-pre"
              }`}
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

  function sortMenuEntries(): ContextMenuEntry[] {
    const check = (on: boolean) => (on ? "✓  " : "  ");
    return [
      ...(Object.keys(SORT_LABELS) as NotesSortKey[]).map((key, i, arr) => ({
        label: `${check(sort.key === key)}${SORT_LABELS[key]}`,
        run: () => setSort(key === sort.key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }),
        dividerAfter: i === arr.length - 1,
      })),
      { label: `${check(sort.dir === "desc")}Reverse order`, run: () => setSort({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" }) },
    ];
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
            <div className="flex flex-none gap-0.5 rounded-btn bg-ph p-0.5">
              <button
                type="button"
                title="Just this folder"
                className={`rounded-[5px] px-1.5 py-0.5 text-[calc(10px*var(--ui-scale))] font-medium ${
                  scopeMode === "folder" ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-ink-2"
                }`}
                onClick={() => setScopeMode("folder")}
              >
                Folder
              </button>
              <button
                type="button"
                title="This folder and its subfolders"
                className={`rounded-[5px] px-1.5 py-0.5 text-[calc(10px*var(--ui-scale))] font-medium ${
                  scopeMode === "subtree" ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-ink-2"
                }`}
                onClick={() => setScopeMode("subtree")}
              >
                +Sub
              </button>
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
                className="mt-1 rounded-btn bg-accent px-3 py-1 text-12 font-medium text-white"
                onClick={() => newNote()}
              >
                New Note
              </button>
            </div>
          )}
    </div>
  );
}
