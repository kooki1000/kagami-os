import type { Editor } from "@tiptap/react";
import type { FsNode } from "@/system/fs/types";
import { Placeholder } from "@tiptap/extensions";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  AArrowDown,
  AArrowUp,
  Bold,
  ChevronDown,
  ChevronUp,
  Heading,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Maximize2,
  Minimize2,
  NotebookPen,
  Replace,
  Underline,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatBytes, nameStem } from "@/lib/format";
import { useAppCommand } from "@/system/appCommands";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { BLOB_INLINE_THRESHOLD } from "@/system/fs/types";
import { NOTES_EXTENSIONS } from "./editorSchema";
import { FindHighlight, getFindMatches, setFindState } from "./findHighlight";
import { docToMarkdown, markdownToDoc } from "./markdownDocument";
import { charCount, stepMatch, wordCount } from "./notesFind";
import { useNotesPrefsStore } from "./notesPrefsStore";

const AUTOSAVE_MS = 600;

/** Blob-backed text over this size stays read-only (ROADMAP.md §8's own step-15 metric). */
const BLOB_TEXT_LIMIT = 5 * 1024 * 1024;

type BlobTextStatus = "none" | "loading" | "ready" | "toolarge" | "missing";

/**
 * The formatting toolbar. Every entry is also reachable by `appCommand`
 * from the Format menu (index.ts), so the two can't describe different sets
 * of actions. `isActive` drives the lit state — the thing a WYSIWYG editor
 * can show and a markdown textarea couldn't.
 */
const FORMAT_ITEMS: {
  command: string;
  label: string;
  title: string;
  Icon: typeof Bold;
  run: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
}[] = [
  { command: "notes.bold", label: "Bold", title: "Bold (⌘B)", Icon: Bold, run: e => e.chain().focus().toggleBold().run(), isActive: e => e.isActive("bold") },
  { command: "notes.italic", label: "Italic", title: "Italic (⌘I)", Icon: Italic, run: e => e.chain().focus().toggleItalic().run(), isActive: e => e.isActive("italic") },
  { command: "notes.underline", label: "Underline", title: "Underline (⌘U)", Icon: Underline, run: e => e.chain().focus().toggleUnderline().run(), isActive: e => e.isActive("underline") },
  { command: "notes.heading", label: "Heading", title: "Cycle heading level (⇧⌘H)", Icon: Heading, run: cycleHeading, isActive: e => e.isActive("heading") },
  { command: "notes.bulletList", label: "Bulleted list", title: "Bulleted list (⇧⌘L)", Icon: List, run: e => e.chain().focus().toggleBulletList().run(), isActive: e => e.isActive("bulletList") },
  { command: "notes.numberList", label: "Numbered list", title: "Numbered list (⇧⌘O)", Icon: ListOrdered, run: e => e.chain().focus().toggleOrderedList().run(), isActive: e => e.isActive("orderedList") },
  { command: "notes.taskList", label: "Task list", title: "Task list (⇧⌘T)", Icon: ListTodo, run: e => e.chain().focus().toggleTaskList().run(), isActive: e => e.isActive("taskList") },
];

/** H1 → H2 → H3 → paragraph, the same cycle the markdown toolbar button had. */
function cycleHeading(editor: Editor): void {
  const level = Number(editor.getAttributes("heading").level ?? 0);
  const chain = editor.chain().focus();
  if (level === 0)
    chain.setHeading({ level: 1 }).run();
  else if (level < 3)
    chain.setHeading({ level: (level + 1) as 2 | 3 }).run();
  else
    chain.setParagraph().run();
}

function ToolbarButton({
  label,
  title,
  active,
  onClick,
  children,
}: {
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={title}
      className={`grid size-5 place-items-center rounded-[5px] hover:bg-ph ${active ? "bg-ph text-accent" : ""}`}
      // Keep focus (and therefore the selection) in the editor: a button
      // takes focus on mousedown, and formatting the text you just selected
      // is the whole point of the control.
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Notes' editing pane (D9): a real WYSIWYG surface over the note's markdown.
 *
 * The note on disk is still plain `.md` — nothing about storage, search,
 * templates or export changed. Markdown is parsed into the editor's
 * document on open and serialized back on save, and both directions live in
 * `markdownDocument.ts`; the vocabulary the editor can hold at all is fixed
 * by `editorSchema.ts`.
 */
export function NoteEditor({
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

  const hash = doc.contentRef?.hash;
  const [blobStatus, setBlobStatus] = useState<BlobTextStatus>(() => {
    if (!doc.contentRef)
      return "none";
    return doc.contentRef.size > BLOB_TEXT_LIMIT ? "toolarge" : "loading";
  });

  /** Unsaved edits exist. Serializing on every keystroke would be wasteful on a large note, so the markdown is produced once, in the save below. */
  const [dirty, setDirty] = useState(false);
  const [stats, setStats] = useState(() => textStats(doc.content ?? ""));

  const editable = blobStatus === "none" || blobStatus === "ready";

  const editor = useEditor({
    extensions: [
      ...NOTES_EXTENSIONS,
      FindHighlight,
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: markdownToDoc(doc.content ?? ""),
    editable,
    // The shell owns focus; stealing it on mount would fight the window
    // manager's own focus handling when a note opens behind another window.
    autofocus: false,
    editorProps: {
      attributes: {
        "class": "notes-prose min-h-full p-5 leading-relaxed text-ink outline-none",
        "aria-label": "Note",
      },
    },
    // `docChanged`, not every update: Tiptap emits one stepless
    // transaction as the editor mounts, and taking that at face value made
    // a note mark itself dirty and save itself the moment it was opened.
    onUpdate: ({ transaction }) => {
      if (transaction.docChanged)
        setDirty(true);
    },
  });

  // Load blob-backed text once (review-backlog #11 / U11): gated on size so
  // a multi-hundred-MB binary-ish file never gets slurped into a string.
  useEffect(() => {
    if (blobStatus !== "loading" || !hash || !editor)
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
      // `emitUpdate: false` — loading the file is not an edit, and marking
      // it dirty would save the note straight back on open.
      editor.commands.setContent(markdownToDoc(text), { emitUpdate: false });
      setStats(textStats(text));
      setBlobStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [blobStatus, hash, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  /**
   * Save `content`, migrating between `node.content` and the blob store as
   * its byte size crosses `BLOB_INLINE_THRESHOLD` in either direction — the
   * fix for review-backlog #11. `new Blob([content]).size` gives the same
   * UTF-8 byte count `contentRef.size` already means everywhere else.
   */
  const persist = useCallback(async (content: string): Promise<void> => {
    const byteSize = new Blob([content]).size;
    if (byteSize > BLOB_INLINE_THRESHOLD)
      await setFileBlob(doc.id, new Blob([content], { type: doc.mimeType ?? "text/plain" }));
    else
      updateFileContent(doc.id, content);
  }, [doc.id, doc.mimeType, setFileBlob, updateFileContent]);

  /** Serialize the document and write it. The one place markdown is produced. */
  const save = useCallback((): void => {
    if (!editor)
      return;
    const markdown = docToMarkdown(editor.getJSON());
    setStats(textStats(markdown));
    void persist(markdown);
    setDirty(false);
  }, [editor, persist]);

  // Keep latest values readable from the unmount flush below. Synced in an
  // effect (not during render) so refs stay outside the render phase, per
  // react-hooks/refs.
  const flushRef = useRef({ editable, dirty, save });
  useLayoutEffect(() => {
    flushRef.current = { editable, dirty, save };
  });

  useEffect(() => {
    if (!editable || !dirty)
      return;
    const timer = window.setTimeout(save, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [editable, dirty, save]);

  // Flush pending edits when switching notes / closing the window.
  useEffect(() => () => {
    const flush = flushRef.current;
    if (flush.editable && flush.dirty)
      flush.save();
  }, [doc.id]);

  const folderName = doc.parentId ? nodes[doc.parentId]?.name : undefined;

  /* ---------- find & replace (⌘F / ⌘G) ---------- */

  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState<number | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  /**
   * Push the query/active pair into the decoration plugin and read back how
   * many matches it found. Selecting the active match (without focusing)
   * scrolls it into view and gives Replace its target, while the caret the
   * user left behind stays where it was until they click back in.
   */
  const applyFind = useCallback((query: string, active: number | null): number => {
    const view = editor?.view;
    if (!view)
      return 0;
    setFindState(view, query, active);
    const matches = getFindMatches(view);
    setMatchCount(matches.length);
    const target = active === null ? undefined : matches[active];
    if (target) {
      const { state } = view;
      view.dispatch(
        state.tr
          .setSelection(TextSelection.create(state.doc, target.from, target.to))
          .scrollIntoView(),
      );
    }
    return matches.length;
  }, [editor]);

  function openFind(): void {
    setFindOpen(true);
    requestAnimationFrame(() => findInputRef.current?.select());
  }

  const closeFind = useCallback((): void => {
    setFindOpen(false);
    setMatchIndex(null);
    applyFind("", null);
    editor?.commands.focus();
  }, [applyFind, editor]);

  function onQueryChange(query: string): void {
    setFindQuery(query);
    setMatchIndex(null);
    applyFind(query, null);
  }

  const jump = useCallback((direction: 1 | -1): void => {
    setFindOpen(true);
    // Ask the plugin for the current count first: the document may have
    // changed since the query was typed.
    const count = applyFind(findQuery, matchIndex);
    const next = stepMatch(count, matchIndex, direction);
    setMatchIndex(next);
    applyFind(findQuery, next);
  }, [applyFind, findQuery, matchIndex]);

  function doReplaceOne(): void {
    if (!editor || matchIndex === null)
      return;
    const target = getFindMatches(editor.view)[matchIndex];
    if (!target)
      return;
    editor.chain().insertContentAt({ from: target.from, to: target.to }, replaceQuery).run();
    setMatchIndex(null);
    applyFind(findQuery, null);
  }

  function doReplaceAll(): void {
    if (!editor || findQuery === "")
      return;
    const matches = getFindMatches(editor.view);
    if (matches.length === 0)
      return;
    // Back to front: replacing shifts every position after the match, so
    // working backwards keeps the remaining ranges valid.
    const chain = editor.chain();
    for (const match of [...matches].reverse())
      chain.insertContentAt({ from: match.from, to: match.to }, replaceQuery);
    chain.run();
    setMatchIndex(null);
    applyFind(findQuery, null);
  }

  useAppCommand(windowId, (command) => {
    if (!editable || !editor)
      return;

    const formatItem = FORMAT_ITEMS.find(item => item.command === command);
    if (formatItem) {
      formatItem.run(editor);
      return;
    }

    switch (command) {
      case "notes.find":
        openFind();
        break;
      case "notes.findNext":
        jump(1);
        break;
      case "notes.findPrev":
        jump(-1);
        break;
    }
  });

  /** Toolbar lit states, recomputed per transaction rather than per render. */
  const activeFormats = useEditorState({
    editor,
    selector: ({ editor: instance }) => (instance ? FORMAT_ITEMS.map(item => item.isActive(instance)) : []),
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
            {dirty ? "Editing…" : "Saved"}
          </span>
        </div>
      )}

      {!focusMode && (
        <div className="flex h-[26px] flex-none items-center gap-1 px-4 text-ink-2 select-none hairline-b">
          <ToolbarButton label="Decrease font size" title="Decrease font size" onClick={() => stepFontSize(-1)}>
            <AArrowDown className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Increase font size" title="Increase font size" onClick={() => stepFontSize(1)}>
            <AArrowUp className="size-3.5" />
          </ToolbarButton>
          <span className="text-[calc(10.5px*var(--ui-scale))] tabular-nums opacity-70">
            {fontSize}
            px
          </span>
          <ToolbarButton label="Enter focus mode" title="Focus mode" onClick={onToggleFocusMode}>
            <Maximize2 className="size-3.5" />
          </ToolbarButton>

          <span className="mx-1 h-3.5 w-px flex-none bg-hairline" />

          {FORMAT_ITEMS.map((item, i) => (
            <ToolbarButton
              key={item.command}
              label={item.label}
              title={item.title}
              active={activeFormats[i]}
              onClick={() => editor && item.run(editor)}
            >
              <item.Icon className="size-3.5" />
            </ToolbarButton>
          ))}

          <span className="ml-auto text-[calc(10.5px*var(--ui-scale))] tabular-nums opacity-70">
            {stats.words}
            {" words · "}
            {stats.chars}
            {" chars"}
          </span>
        </div>
      )}

      {findOpen && editable && (
        <div className="flex flex-none items-center gap-1.5 px-3 py-1.5 hairline-b">
          <input
            ref={findInputRef}
            value={findQuery}
            placeholder="Find"
            className="w-32 rounded-[6px] bg-ph px-2 py-1 text-11.5 text-ink outline-none placeholder:text-ink-2"
            onChange={e => onQueryChange(e.target.value)}
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
            {matchCount ? `${(matchIndex ?? 0) + 1}/${matchCount}` : "0/0"}
          </span>
          <ToolbarButton label="Previous match" title="Previous match" onClick={() => jump(-1)}>
            <ChevronUp className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Next match" title="Next match" onClick={() => jump(1)}>
            <ChevronDown className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Toggle replace" title="Replace" active={replaceOpen} onClick={() => setReplaceOpen(o => !o)}>
            <Replace className="size-3.5" />
          </ToolbarButton>
          <span className="ml-auto">
            <ToolbarButton label="Close find" title="Close find" onClick={closeFind}>
              <X className="size-3.5" />
            </ToolbarButton>
          </span>
        </div>
      )}
      {findOpen && editable && replaceOpen && (
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

      <EditorContent
        editor={editor}
        className="min-h-0 flex-1 overflow-auto text-ink"
        style={{ fontSize: `calc(${fontSize}px * var(--ui-scale))` }}
      />
    </div>
  );
}

/** Word/character counts for the status line, taken from the markdown the user's text produces. */
function textStats(markdown: string): { words: number; chars: number } {
  return { words: wordCount(markdown), chars: charCount(markdown) };
}
