import type { ChangeEvent, KeyboardEvent } from "react";
import type { ShellContext, ShellLine } from "./shell";
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
import { DEFAULT_FONT_SIZE, findHistoryMatch, useTerminalStore } from "./terminalStore";

const USER = "kagami";

interface HistoryEntry extends ShellLine {
  id: number;
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

  const history = useTerminalStore(s => s.history);
  const fontSize = useTerminalStore(s => s.fontSize);
  const aliases = useTerminalStore(s => s.aliases);

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

  function appendLines(lines: ShellLine[]): void {
    if (lines.length === 0)
      return;
    setEntries(prev => [
      ...prev,
      ...lines.map(l => ({ ...l, id: ++lineCounter })),
    ]);
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
      { id: ++lineCounter, kind: "input", text: `${prompt} $ ${raw}` },
    ]);

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
  });

  /** ⌃C: abandon the line without running it, leaving it on screen the way a real shell does. */
  function abortLine(): void {
    setEntries(prev => [
      ...prev,
      { id: ++lineCounter, kind: "input", text: `${prompt} $ ${input}^C` },
    ]);
    setInput("");
    setHistoryPos(null);
    setCycle(null);
  }

  /** Exit ⌃R search back to a blank prompt, discarding the query/match. */
  function exitSearch(): void {
    setIsSearching(false);
    setSearchQuery("");
    setSearchMatchIndex(null);
    setInput("");
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
        }
        else {
          pendingCaretRef.current = edited.caret;
          setInput(edited.value);
        }
        return;
      }
    }

    if (e.key === "Enter") {
      submit(input);
      setInput("");
    }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0)
        return;
      const next = historyPos === null ? history.length - 1 : Math.max(0, historyPos - 1);
      setHistoryPos(next);
      setInput(history[next]);
    }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyPos === null)
        return;
      const next = historyPos + 1;
      if (next >= history.length) {
        setHistoryPos(null);
        setInput("");
      }
      else {
        setHistoryPos(next);
        setInput(history[next]);
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
      setInput(line);
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
      setInput(line);
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
  }

  const searchMatch = searchMatchIndex !== null ? history[searchMatchIndex] : null;

  const lineColor: Record<ShellLine["kind"], string> = {
    input: "text-ink",
    output: "text-ink-2",
    error: "text-accent-2",
    system: "text-accent",
  };

  return (
    <div
      className="flex h-full flex-col bg-(--surface) font-mono leading-relaxed"
      style={{ fontSize: `calc(${fontSize}px * var(--ui-scale))` }}
      onClick={() => inputRef.current?.focus()}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-[calc(14px*var(--ui-scale))] py-3">
        {entries.map(entry => (
          <div key={entry.id} className={`wrap-break-word whitespace-pre-wrap ${lineColor[entry.kind]}`}>
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
          <span className="flex-none whitespace-pre text-accent">
            {isSearching ? `(reverse-i-search)\`${searchQuery}':` : `${prompt} $`}
          </span>
          <input
            ref={inputRef}
            value={isSearching ? searchQuery : input}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-ink caret-accent outline-none"
            onChange={onInputChange}
            onKeyDown={onKeyDown}
          />
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
