import type { ChangeEvent, KeyboardEvent } from "react";
import type { ShellContext, ShellLine } from "./shell";
import type { PromptStyle, TerminalFontId } from "./terminalStore";
import type { AppWindowProps } from "@/system/apps/types";
import type { NodeMap } from "@/system/fs/fsStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppCommand } from "@/system/appCommands";
import { openFile } from "@/system/apps/openFile";
import { pathOf, useFsStore } from "@/system/fs/fsStore";
import { HOME_ID, ROOT_ID } from "@/system/fs/types";
import { useWindowStore } from "@/system/windows/windowStore";
import { applyReadlineKey } from "./readline";
import { completeToken, completionTarget, quoteToken, resolveCompletion, runCommand, statusOf } from "./shell";
import { DEFAULT_FONT_SIZE, findHistoryMatch, fontStack, useTerminalStore } from "./terminalStore";

const USER = "kagami";

/**
 * How many lines of scrollback to keep. `find /` on a deep tree emits one
 * line per node, and every one of them is a live DOM element — the cap is
 * what stops that from growing without bound. Virtualizing instead would
 * bound it too, but it would also take the off-screen lines out of the DOM,
 * and selecting across the scrollback to copy it is worth more here than
 * the lines beyond this limit.
 */
const SCROLLBACK_LIMIT = 5000;

interface HistoryEntry extends ShellLine {
  id: number;
  /** Set on an echoed command line: the prompt it was typed at, rendered as segments. */
  prompt?: string;
}

/**
 * The prompt, in the look's duotone — user on the second accent, path on
 * the first, marker dimmed. Which segments appear is the user's
 * `promptStyle`; the marker is always there, so the line is never bare.
 */
function Prompt({ path, style }: { path: string; style: PromptStyle }) {
  return (
    <>
      {style === "full" && <span className="text-accent-2">{`${USER} `}</span>}
      {style !== "minimal" && <span className="text-accent">{path}</span>}
      <span className="text-ink-2">{style === "minimal" ? "$ " : " $ "}</span>
    </>
  );
}

/**
 * Colour for one line. `kind` is what the engine did (a command, an error);
 * `tone` is what the text *is* (a folder, a heading) — so a listing's
 * folders read as folders without the engine knowing anything about the
 * palette.
 */
function lineClass(entry: HistoryEntry): string {
  if (entry.kind === "error")
    return "text-accent-2";
  if (entry.kind === "system")
    return "text-accent";
  if (entry.kind === "input")
    return "text-ink";
  switch (entry.tone) {
    case "dir":
      return "text-accent";
    case "heading":
      return "font-semibold text-ink";
    case "muted":
      return "text-ink-2 opacity-70";
    default:
      return "text-ink-2";
  }
}

/** Short "~/Documents" style prompt path for the current directory. */
function promptPath(nodes: NodeMap, cwd: string): string {
  if (cwd === HOME_ID)
    return "~";
  const parts = pathOf(nodes, cwd).slice(1).map(n => n.name);
  const home = pathOf(nodes, HOME_ID).slice(1).map(n => n.name);
  if (parts.length >= home.length && home.every((p, i) => p === parts[i]))
    return `~/${parts.slice(home.length).join("/")}`;
  return `/${parts.join("/")}`;
}

let lineCounter = 0;

export default function TerminalApp({ windowId, focused }: AppWindowProps) {
  const ready = useFsStore(s => s.ready);
  const [cwd, setCwd] = useState<string>(HOME_ID);
  const [entries, setEntries] = useState<HistoryEntry[]>([
    { id: ++lineCounter, kind: "system", text: "Kagami Shell — type 'help' to get started." },
  ]);
  const [input, setInput] = useState("");
  const [historyPos, setHistoryPos] = useState<number | null>(null);

  // ⌃R reverse-i-search — a separate mode layered on the same input rather
  // than a second control, mirroring a standard shell's reverse-i-search.
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState<number | null>(null);

  /**
   * The Tab-completion menu: the candidates for the token being completed,
   * which of them is currently inserted (-1 = none yet), and the line that
   * insertion produced — anything else in the input means the user has kept
   * typing and the candidates are stale.
   */
  const [cycle, setCycle] = useState<{ head: string; matches: string[]; active: number; line: string } | null>(null);

  /** Caret offset and the input's horizontal scroll — together, where to draw the block cursor. */
  const [caret, setCaret] = useState(0);
  const [inputScroll, setInputScroll] = useState(0);

  const history = useTerminalStore(s => s.history);
  const fontSize = useTerminalStore(s => s.fontSize);
  const aliases = useTerminalStore(s => s.aliases);
  const fontFamily = useTerminalStore(s => s.fontFamily);
  const promptStyle = useTerminalStore(s => s.promptStyle);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Exit status of the last line, for the next one's `$?`. A ref, not state: nothing renders it. */
  const statusRef = useRef(0);
  /** Where to put the caret after a readline edit re-renders the input. */
  const pendingCaretRef = useRef<number | null>(null);

  const nodes = useFsStore(s => s.nodes);
  // Root exists once the store is ready; fall back to root if cwd vanished.
  const safeCwd = nodes[cwd] ? cwd : ROOT_ID;

  useEffect(() => {
    if (focused)
      inputRef.current?.focus();
  }, [focused]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el)
      el.scrollTop = el.scrollHeight;
  }, [entries, cycle]);

  useEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null)
      return;
    pendingCaretRef.current = null;
    inputRef.current?.setSelectionRange(caret, caret);
  }, [input]);

  const prompt = useMemo(
    () => (ready ? promptPath(nodes, safeCwd) : "~"),
    [ready, nodes, safeCwd],
  );

  /**
   * Write the input line programmatically (history recall, completion, a
   * readline edit) and say where the caret lands — the DOM caret is applied
   * after the re-render by the effect above, since React resets it to the
   * end of a controlled input otherwise.
   */
  function setLine(value: string, at: number = value.length): void {
    setInput(value);
    setCaret(at);
    pendingCaretRef.current = at;
  }

  function appendLines(lines: ShellLine[]): void {
    if (lines.length === 0)
      return;
    setEntries(prev => [
      ...prev,
      ...lines.map(l => ({ ...l, id: ++lineCounter })),
    ].slice(-SCROLLBACK_LIMIT));
  }

  function submit(raw: string): void {
    const state = useFsStore.getState();
    const terminalState = useTerminalStore.getState();
    const ctx: ShellContext = {
      cwd: safeCwd,
      nodes: state.nodes,
      lastStatus: statusRef.current,
      // `mkdir foo && cd foo`: the second segment has to see the folder the
      // first one just made, which the snapshot above predates.
      readNodes: () => useFsStore.getState().nodes,
      createFolder: state.createFolder,
      createFile: state.createFile,
      updateFileContent: state.updateFileContent,
      touchFile: state.touchFile,
      rename: state.rename,
      move: state.move,
      duplicate: state.duplicate,
      moveToTrash: state.moveToTrash,
      openPath: openFile,
      user: USER,
      // The line being submitted isn't in `history` yet — `addHistory` below
      // runs after the context is built, so `history` prints what came before
      // it rather than listing itself as the most recent entry.
      history: terminalState.history,
      clearHistory: terminalState.clearHistory,
      aliases: terminalState.aliases,
      setAlias: terminalState.setAlias,
    };

    // Echo the entered command with its prompt.
    setEntries(prev => [
      ...prev,
      { id: ++lineCounter, kind: "input" as const, text: raw, prompt },
    ].slice(-SCROLLBACK_LIMIT));

    terminalState.addHistory(raw);
    setHistoryPos(null);

    const result = runCommand(raw, ctx);
    statusRef.current = statusOf(result);
    // `clear` wipes the scrollback but doesn't end the line — a later
    // segment of the same `clear; ls` still gets to print.
    if (result.clear)
      setEntries([]);
    appendLines(result.lines);
    if (result.cwd)
      setCwd(result.cwd);
    if (result.exit)
      useWindowStore.getState().closeWindow(windowId);
  }

  useAppCommand(windowId, (command) => {
    const terminalState = useTerminalStore.getState();
    if (command === "terminal.fontIncrease")
      terminalState.increaseFontSize();
    else if (command === "terminal.fontDecrease")
      terminalState.decreaseFontSize();
    else if (command === "terminal.fontReset")
      terminalState.setFontSize(DEFAULT_FONT_SIZE);
    // "terminal.font:<id>" / "terminal.prompt:<style>" — one command per
    // choice, since menu items are static data with no state to bind to.
    else if (command.startsWith("terminal.font:"))
      terminalState.setFontFamily(command.slice("terminal.font:".length) as TerminalFontId);
    else if (command.startsWith("terminal.prompt:"))
      terminalState.setPromptStyle(command.slice("terminal.prompt:".length) as PromptStyle);
  });

  /** ⌃C: abandon the line without running it, leaving it on screen the way a real shell does. */
  function abortLine(): void {
    setEntries(prev => [
      ...prev,
      { id: ++lineCounter, kind: "input" as const, text: `${input}^C`, prompt },
    ].slice(-SCROLLBACK_LIMIT));
    setLine("");
    setHistoryPos(null);
    setCycle(null);
  }

  /** Exit ⌃R search back to a blank prompt, discarding the query/match. */
  function exitSearch(): void {
    setIsSearching(false);
    setSearchQuery("");
    setSearchMatchIndex(null);
    setLine("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.ctrlKey && e.key === "r") {
      e.preventDefault();
      if (!isSearching) {
        setIsSearching(true);
        setSearchQuery("");
        setSearchMatchIndex(null);
      }
      else if (searchQuery !== "") {
        // Repeated ⌃R steps to the next-older match, searching strictly
        // before the current one (or the whole history on the first press).
        const next = findHistoryMatch(history, searchQuery, searchMatchIndex ?? history.length);
        if (next !== null)
          setSearchMatchIndex(next);
      }
      return;
    }

    if (isSearching) {
      if (e.key === "Enter") {
        e.preventDefault();
        const match = searchMatchIndex !== null ? history[searchMatchIndex] : null;
        exitSearch();
        if (match)
          submit(match);
        return;
      }
      if (e.key === "Escape" || (e.ctrlKey && e.key === "g")) {
        e.preventDefault();
        exitSearch();
        return;
      }
      // Any other key (typing, backspace, …) is handled by onChange below —
      // arrow/Tab navigation is suspended while a search is in progress.
      return;
    }

    if (e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "l") {
        e.preventDefault();
        setEntries([]);
        setCycle(null);
        return;
      }
      if (e.key === "c") {
        e.preventDefault();
        abortLine();
        return;
      }
      const edited = applyReadlineKey(e.key, {
        value: input,
        caret: e.currentTarget.selectionStart ?? input.length,
      });
      if (edited) {
        e.preventDefault();
        setCycle(null);
        if (edited.value === input) {
          // ⌃A/⌃E only move the caret. React won't re-render for an
          // unchanged value, so the effect below never fires — move it now.
          e.currentTarget.setSelectionRange(edited.caret, edited.caret);
          setCaret(edited.caret);
        }
        else {
          setLine(edited.value, edited.caret);
        }
        return;
      }
    }

    if (e.key === "Enter") {
      submit(input);
      setLine("");
    }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0)
        return;
      const next = historyPos === null ? history.length - 1 : Math.max(0, historyPos - 1);
      setHistoryPos(next);
      setLine(history[next]);
    }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyPos === null)
        return;
      const next = historyPos + 1;
      if (next >= history.length) {
        setHistoryPos(null);
        setLine("");
      }
      else {
        setHistoryPos(next);
        setLine(history[next]);
      }
    }
    else if (e.key === "Tab") {
      e.preventDefault();
      completeAtCaret(e.shiftKey ? -1 : 1);
    }
    else if (e.key === "Escape") {
      setCycle(null);
    }
  }

  /**
   * Tab. The first press extends the token as far as the candidates agree;
   * once it can't extend any further, the candidates are listed and each
   * further press steps through them (⇧Tab backwards) — a menu-completion
   * cycle, rather than the old single dump of a `system` line into the
   * scrollback that then scrolled away.
   */
  function completeAtCaret(direction: 1 | -1): void {
    // Still on the line the current cycle produced? Then step it. Anything
    // typed in between invalidates the candidates and recomputes.
    if (cycle && cycle.line === input) {
      const next = (cycle.active + direction + cycle.matches.length) % cycle.matches.length;
      const line = cycle.head + quoteToken(cycle.matches[next]);
      setCycle({ ...cycle, active: next, line });
      setLine(line);
      return;
    }

    const target = completionTarget(input);
    const matches = completeToken(nodes, safeCwd, target, Object.keys(aliases));
    const completion = resolveCompletion(matches, target.partial);
    if (!completion) {
      setCycle(null);
      return;
    }

    if (completion.kind === "replace") {
      const line = target.head + quoteToken(completion.text);
      setLine(line);
      // A single match is settled; a shared prefix leaves the rest to cycle
      // through, so the strip stays up with nothing selected yet.
      setCycle(matches.length > 1 ? { head: target.head, matches, active: -1, line } : null);
      return;
    }
    setCycle({ head: target.head, matches: completion.matches, active: -1, line: input });
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const value = e.target.value;
    if (isSearching) {
      setSearchQuery(value);
      setSearchMatchIndex(value === "" ? null : findHistoryMatch(history, value));
      return;
    }
    setCycle(null);
    setInput(value);
    setCaret(e.target.selectionStart ?? value.length);
  }

  const searchMatch = searchMatchIndex !== null ? history[searchMatchIndex] : null;

  return (
    <div
      className="flex h-full flex-col bg-(--surface) font-mono leading-relaxed"
      style={{
        fontSize: `calc(${fontSize}px * var(--ui-scale))`,
        fontFamily: fontStack(fontFamily),
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-[calc(14px*var(--ui-scale))] py-3">
        {entries.map(entry => (
          <div key={entry.id} className={`wrap-break-word whitespace-pre-wrap ${lineClass(entry)}`}>
            {entry.prompt !== undefined && <Prompt path={entry.prompt} style={promptStyle} />}
            {entry.text}
          </div>
        ))}
        {cycle && (
          <div className="flex flex-wrap gap-x-[calc(10px*var(--ui-scale))] pb-1 text-ink-2">
            {cycle.matches.map((match, i) => (
              <span
                key={match}
                className={i === cycle.active ? "rounded-[4px] bg-accent-strong px-1 text-white" : undefined}
              >
                {match}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-[calc(6px*var(--ui-scale))]">
          <span className="flex-none whitespace-pre">
            {isSearching
              ? <span className="text-accent-2">{`(reverse-i-search)\`${searchQuery}':`}</span>
              : <Prompt path={prompt} style={promptStyle} />}
          </span>
          <span className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              value={isSearching ? searchQuery : input}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              className="w-full bg-transparent text-ink caret-transparent outline-none"
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              onSelect={e => setCaret(e.currentTarget.selectionStart ?? 0)}
              onScroll={e => setInputScroll(e.currentTarget.scrollLeft)}
            />
            {focused && !isSearching && (
              // A block cursor, positioned in `ch` units — exact because the
              // input is monospace, and offset by the input's own scroll so
              // it stays put on a line long enough to scroll.
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-[1ch] animate-cursor-blink bg-accent/55"
                style={{ left: `calc(${caret}ch - ${inputScroll}px)` }}
              />
            )}
          </span>
          {isSearching && (
            <span className="min-w-0 flex-none truncate whitespace-pre text-ink-2">
              {searchMatch ?? (searchQuery ? "(no match)" : "")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
