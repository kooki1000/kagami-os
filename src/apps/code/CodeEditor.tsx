import type { Extension } from "@codemirror/state";
import type { FsNode } from "@/system/fs/types";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import { bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { FileCode } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import { useAppCommand } from "@/system/appCommands";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { BLOB_INLINE_THRESHOLD } from "@/system/fs/types";
import { useThemeStore } from "@/system/theme/themeStore";
import { useReducedMotion } from "@/system/theme/useReducedMotion";
import { useCodePrefsStore } from "./codePrefsStore";
import { LANGUAGE_LABELS, languageIdForNode } from "./languages";
import { loadLanguage } from "./languageSupport";
import { editorTheme } from "./theme";

const AUTOSAVE_MS = 600;

/** Blob-backed text over this size stays read-only — the same cap Notes uses. */
const BLOB_TEXT_LIMIT = 5 * 1024 * 1024;

type BlobTextStatus = "none" | "loading" | "ready" | "toolarge" | "missing";

/**
 * The code editor's editing pane (D4), a CodeMirror 6 view over a VFS file.
 *
 * Storage behaves exactly as Notes': plain text on disk, saved debounced, and
 * migrated between `node.content` and the blob store as it crosses
 * `BLOB_INLINE_THRESHOLD` in either direction. What differs is that the
 * language parser arrives asynchronously, so the view is created first and
 * reconfigured when the parser lands.
 *
 * It runs in-process rather than in the capability sandbox — `index.ts` has
 * that argument.
 */
export function CodeEditor({
  doc,
  windowId,
}: {
  doc: FsNode;
  windowId: string;
}) {
  const updateFileContent = useFsStore(s => s.updateFileContent);
  const setFileBlob = useFsStore(s => s.setFileBlob);
  const fontSize = useCodePrefsStore(s => s.fontSize);
  const wrap = useCodePrefsStore(s => s.wrap);
  const showLineNumbers = useCodePrefsStore(s => s.lineNumbers);
  const reducedMotion = useReducedMotion();

  const hash = doc.contentRef?.hash;
  const [blobStatus, setBlobStatus] = useState<BlobTextStatus>(() => {
    if (!doc.contentRef)
      return "none";
    return doc.contentRef.size > BLOB_TEXT_LIMIT ? "toolarge" : "loading";
  });
  const [dirty, setDirty] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  // A file that's still loading (or too large) must not accept keystrokes
  // that would be saved over its real contents.
  const editable = blobStatus === "none" || blobStatus === "ready";
  const languageId = languageIdForNode(doc);
  // Only light/dark picks the syntax palette; every other appearance setting
  // reaches the editor through the CSS custom properties its theme is written
  // in, with no reconfigure needed.
  const dark = useThemeStore(s => s.resolved) === "dark";

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Compartments are CodeMirror's way to swap one part of the configuration
  // without rebuilding the state — which would throw away the undo history
  // and the cursor. Two are enough: everything that changes synchronously
  // goes in `options`, and `language` is separate only because it arrives
  // asynchronously and its load can be superseded.
  const compartments = useMemo(() => ({
    options: new Compartment(),
    language: new Compartment(),
  }), []);
  // The file's text at mount. A ref because the view is built once, in an
  // effect: later content changes come from the editor itself, not from here.
  const initialDocRef = useRef(doc.content ?? "");

  const options = useMemo((): Extension => [
    showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
    wrap ? EditorView.lineWrapping : [],
    EditorView.editable.of(editable),
    editorTheme(dark),
    // CodeMirror's content element is an ARIA textbox, and an unnamed input
    // field is a serious axe violation (`e2e/a11y-axe.spec.ts`) — a screen
    // reader would otherwise announce "edit text" with no idea which file.
    EditorView.contentAttributes.of({ "aria-label": `${doc.name}, code editor` }),
  ], [showLineNumbers, wrap, editable, dark, doc.name]);

  /* ---------- create the view once per file ---------- */

  // A layout effect so it precedes the options one below (same phase, source
  // order) — the view has to exist before anything can reconfigure it, and
  // building it after paint would show one empty frame per file opened.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host)
      return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialDocRef.current,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          indentOnInput(),
          indentUnit.of("  "),
          search({ top: true }),
          // `indentWithTab` last so it loses to any earlier binding. Tab
          // indenting is the expected behavior in an editor, and the window's
          // own focus trap (Window.tsx) already keeps Tab from escaping into
          // another window, so the usual "Tab must move focus" objection has
          // nowhere to send it anyway.
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          compartments.options.of([]),
          compartments.language.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              setDirty(true);
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              setCursor({ line: line.number, column: head - line.from + 1 });
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Built once. `CodeApp` keys this component on the file id, so switching
    // files remounts the component rather than mutating a live view.
  }, [compartments]);

  useLayoutEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.options.reconfigure(options) });
  }, [compartments, options]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.language.reconfigure([]) });
    let cancelled = false;
    void loadLanguage(languageId).then((support) => {
      if (cancelled || !support)
        return;
      viewRef.current?.dispatch({ effects: compartments.language.reconfigure(support) });
    });
    return () => {
      cancelled = true;
    };
  }, [compartments, languageId]);

  /* ---------- blob-backed text ---------- */

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
      const view = viewRef.current;
      if (cancelled || !view)
        return;
      // Replacing the document is not an edit: dispatch it, then clear the
      // dirty flag the update listener just set, or opening a file would save
      // it straight back.
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      setDirty(false);
      setBlobStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [blobStatus, hash]);

  /* ---------- saving ---------- */

  const persist = useCallback(async (content: string): Promise<void> => {
    // One blob, measured and then either stored or dropped — building a
    // second to encode the same string doubles the work on every autosave of
    // a large file.
    const blob = new Blob([content], { type: doc.mimeType ?? "text/plain" });
    if (blob.size > BLOB_INLINE_THRESHOLD)
      await setFileBlob(doc.id, blob);
    else
      updateFileContent(doc.id, content);
  }, [doc.id, doc.mimeType, setFileBlob, updateFileContent]);

  const save = useCallback((): void => {
    const view = viewRef.current;
    if (!view)
      return;
    void persist(view.state.doc.toString());
    setDirty(false);
  }, [persist]);

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

  // Flush pending edits on unmount — which is also how switching files
  // arrives here, since `CodeApp` keys this component on the file id.
  useEffect(() => () => {
    const flush = flushRef.current;
    if (flush.editable && flush.dirty)
      flush.save();
  }, []);

  /* ---------- menu commands ---------- */

  useAppCommand(windowId, (command) => {
    const view = viewRef.current;
    if (!view)
      return;
    switch (command) {
      case "code.save":
        if (editable)
          save();
        break;
      case "code.find":
        openSearchPanel(view);
        break;
      case "code.undo":
        undo(view);
        break;
      case "code.redo":
        redo(view);
        break;
    }
  });

  if (blobStatus === "toolarge" || blobStatus === "missing") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-ink-2 select-none">
        <FileCode className="size-7" strokeWidth={1.4} />
        {blobStatus === "missing" && <span className="text-13">This file's contents couldn't be found</span>}
        {blobStatus === "toolarge" && doc.contentRef && (
          <>
            <span className="text-13">
              This file is too large to edit (
              {formatBytes(doc.contentRef.size)}
              )
            </span>
            <span className="text-11.5 opacity-70">Download it from Files to read the full contents.</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-hidden"
        data-code-editor
        // On the host rather than the view: the view is rebuilt per file, and
        // the preference shouldn't have to be re-applied every time it is.
        style={{
          "--cm-font-size": `calc(${fontSize}px * var(--ui-scale))`,
          "scrollBehavior": reducedMotion ? "auto" : undefined,
        } as React.CSSProperties}
      />
      <div className="flex h-[26px] flex-none items-center justify-between gap-3 px-3 text-11 text-ink-2 select-none hairline-t">
        <span data-code-language>{LANGUAGE_LABELS[languageId]}</span>
        <div className="flex items-center gap-3">
          <span data-code-cursor>
            Ln
            {" "}
            {cursor.line}
            , Col
            {" "}
            {cursor.column}
          </span>
          <span data-code-status>{dirty ? "Editing…" : "Saved"}</span>
        </div>
      </div>
    </div>
  );
}
