import type { KeyboardEvent } from "react";
import type { ShellContext, ShellLine } from "./shell";
import type { AppWindowProps } from "@/system/apps/types";
import type { NodeMap } from "@/system/fs/fsStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { pathOf, useFsStore } from "@/system/fs/fsStore";
import { HOME_ID, ROOT_ID } from "@/system/fs/types";
import { runCommand } from "./shell";

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

export default function TerminalApp({ focused }: AppWindowProps) {
  const ready = useFsStore(s => s.ready);
  const [cwd, setCwd] = useState<string>(HOME_ID);
  const [entries, setEntries] = useState<HistoryEntry[]>([
    { id: ++lineCounter, kind: "system", text: "Kagami Shell — type 'help' to get started." },
  ]);
  const [input, setInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyPos, setHistoryPos] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  }, [entries]);

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
    const ctx: ShellContext = {
      cwd: safeCwd,
      nodes: state.nodes,
      createFolder: state.createFolder,
      createFile: state.createFile,
      updateFileContent: state.updateFileContent,
      touchFile: state.touchFile,
      moveToTrash: state.moveToTrash,
      user: USER,
    };

    // Echo the entered command with its prompt.
    setEntries(prev => [
      ...prev,
      { id: ++lineCounter, kind: "input", text: `${prompt} $ ${raw}` },
    ]);

    if (raw.trim() !== "") {
      setCommandHistory(prev => [...prev, raw]);
    }
    setHistoryPos(null);

    const result = runCommand(raw, ctx);
    if (result.clear) {
      setEntries([]);
      return;
    }
    appendLines(result.lines);
    if (result.cwd)
      setCwd(result.cwd);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      submit(input);
      setInput("");
    }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0)
        return;
      const next = historyPos === null ? commandHistory.length - 1 : Math.max(0, historyPos - 1);
      setHistoryPos(next);
      setInput(commandHistory[next]);
    }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyPos === null)
        return;
      const next = historyPos + 1;
      if (next >= commandHistory.length) {
        setHistoryPos(null);
        setInput("");
      }
      else {
        setHistoryPos(next);
        setInput(commandHistory[next]);
      }
    }
  }

  const lineColor: Record<ShellLine["kind"], string> = {
    input: "text-ink",
    output: "text-ink-2",
    error: "text-accent-2",
    system: "text-accent",
  };

  return (
    <div
      className="flex h-full flex-col bg-(--surface) font-mono text-[12.5px] leading-relaxed"
      onClick={() => inputRef.current?.focus()}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3.5 py-3">
        {entries.map(entry => (
          <div key={entry.id} className={`wrap-break-word whitespace-pre-wrap ${lineColor[entry.kind]}`}>
            {entry.text}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="flex-none whitespace-pre text-accent">
            {prompt}
            {" "}
            $
          </span>
          <input
            ref={inputRef}
            value={input}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-ink caret-accent outline-none"
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  );
}
