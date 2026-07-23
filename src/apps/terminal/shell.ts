import type { FsNode } from "@/system/fs/types";
import { formatBytes } from "@/lib/format";
import {
  childrenOf,
  isDescendantOf,
  isSystemNode,
  isValidNodeName,
  pathOf,
} from "@/system/fs/fsStore";
import { HOME_ID, ROOT_ID } from "@/system/fs/types";

/**
 * A sandboxed fake shell over the virtual file system. This is NOT a real
 * Unix shell and executes no code — it interprets a small, fixed command
 * set against the fs store. Kept framework-agnostic so it is unit-testable
 * and reusable without mounting the Terminal app.
 */

export interface ShellLine {
  kind: "input" | "output" | "error" | "system";
  text: string;
}

export interface ShellResult {
  lines: ShellLine[];
  /** New working-directory node id, when the command changed it. */
  cwd?: string;
  /** Request to clear the scrollback. */
  clear?: boolean;
}

/** Everything a command needs from the host (fs access + current dir). */
export interface ShellContext {
  cwd: string;
  nodes: Record<string, FsNode>;
  createFolder: (parentId: string, name: string) => FsNode;
  createFile: (parentId: string, name: string, content: string, mimeType?: string) => FsNode;
  updateFileContent: (id: string, content: string) => void;
  touchFile: (id: string) => void;
  rename: (id: string, name: string) => void;
  move: (id: string, newParentId: string) => boolean;
  duplicate: (id: string, targetParentId: string) => FsNode | null;
  moveToTrash: (id: string) => void;
  /** Launch the file's associated app; false when nothing is associated. */
  openPath: (node: FsNode) => boolean;
  user: string;
}

const COMMAND_NAMES = [
  "help",
  "clear",
  "whoami",
  "date",
  "pwd",
  "ls",
  "cd",
  "cat",
  "mkdir",
  "touch",
  "echo",
  "rm",
  "cp",
  "mv",
  "head",
  "tail",
  "grep",
  "open",
  "tree",
] as const;

const HELP_TEXT = [
  "Kagami Shell — available commands:",
  "  ls [path]           list directory contents",
  "  cd [path]           change directory (cd .. , cd ~ , cd /)",
  "  pwd                 print working directory",
  "  cat <file>          print a file's contents",
  "  mkdir <path>        create a directory (parent dirs must exist)",
  "  touch <path>        create an empty file (parent dirs must exist)",
  "  echo <text>         print text (> file to write, >> to append)",
  "  cp <src> <dest>     copy a file or folder",
  "  mv <src> <dest>     move or rename a file or folder",
  "  head [-n N] <file>  print the first N lines (default 10)",
  "  tail [-n N] <file>  print the last N lines (default 10)",
  "  grep [-i] <pat> <file>  print lines matching a substring",
  "  open <path>         open a file in its associated app",
  "  rm <name>           move an item to the Trash",
  "  tree                show the tree below the current directory",
  "  whoami              print the current user",
  "  date                print the current date and time",
  "  clear               clear the screen",
  "  help                show this help",
  "Pipe builtins together with |, e.g. `ls | grep .txt`. Tab completes commands and paths.",
].join("\n");

/** Absolute "/a/b/c" path string for a node. */
function pathString(nodes: Record<string, FsNode>, id: string): string {
  const parts = pathOf(nodes, id)
    .slice(1) // drop the synthetic root ("Kagami")
    .map(n => n.name);
  return `/${parts.join("/")}`;
}

function childByName(
  nodes: Record<string, FsNode>,
  parentId: string,
  name: string,
): FsNode | undefined {
  return childrenOf(nodes, parentId).find(
    n => n.name.toLowerCase() === name.toLowerCase(),
  );
}

/**
 * Resolve a path (absolute, relative, with `.`/`..`/`~`) to a node id.
 * Returns null if any segment doesn't exist.
 */
export function resolvePath(
  nodes: Record<string, FsNode>,
  cwd: string,
  path: string,
): string | null {
  let current = cwd;
  let rest = path;

  if (path === "~" || path.startsWith("~/")) {
    current = HOME_ID;
    rest = path.slice(1).replace(/^\//, "");
  }
  else if (path.startsWith("/")) {
    current = ROOT_ID;
    rest = path.slice(1);
  }

  if (rest === "")
    return current;

  for (const segment of rest.split("/")) {
    if (segment === "" || segment === ".")
      continue;
    if (segment === "..") {
      current = nodes[current]?.parentId ?? current;
      continue;
    }
    const child = childByName(nodes, current, segment);
    if (!child)
      return null;
    current = child.id;
  }
  return current;
}

/** Split a path around its last "/" into a parent path and a leaf name. */
function splitPath(path: string): { dir: string; leaf: string } {
  const idx = path.lastIndexOf("/");
  return idx === -1
    ? { dir: "", leaf: path }
    : { dir: path.slice(0, idx), leaf: path.slice(idx + 1) };
}

function line(kind: ShellLine["kind"], text: string): ShellLine {
  return { kind, text };
}

function err(text: string): ShellResult {
  return { lines: [line("error", text)] };
}

function out(text: string): ShellResult {
  return { lines: text === "" ? [] : [line("output", text)] };
}

/** Resolve `dir` (possibly empty, meaning `cwd`) to an existing folder's id, or null. */
function resolveParentDir(nodes: Record<string, FsNode>, cwd: string, dir: string): string | null {
  const parentId = dir ? resolvePath(nodes, cwd, dir) : cwd;
  return parentId !== null && nodes[parentId].type === "folder" ? parentId : null;
}

/**
 * Resolve `parentId` + `leaf` for a create-style path argument (mkdir,
 * touch): everything up to the last "/" must already exist as a folder —
 * intermediate directories are not auto-created, matching plain `mkdir`.
 */
function resolveCreateParent(
  nodes: Record<string, FsNode>,
  cwd: string,
  path: string,
): { parentId: string; leaf: string } | { error: string } {
  const { dir, leaf } = splitPath(path);
  if (!leaf)
    return { error: `${path}: names cannot contain '/'` };
  const parentId = resolveParentDir(nodes, cwd, dir);
  if (parentId === null)
    return { error: `${path}: no such directory` };
  return { parentId, leaf };
}

type Destination
  = | { kind: "dir"; id: string }
    | { kind: "path"; parentId: string; name: string };

/** The parent folder id an already-resolved cp/mv destination writes into. */
function destParentId(dest: Destination): string {
  return dest.kind === "dir" ? dest.id : dest.parentId;
}

/**
 * Resolve a cp/mv destination argument: an existing folder receives the
 * item under its own name; anything else is a not-yet-existing path whose
 * parent must already exist (the new/renamed leaf).
 */
function resolveDestination(
  nodes: Record<string, FsNode>,
  cwd: string,
  path: string,
): Destination | { error: string } {
  const direct = resolvePath(nodes, cwd, path);
  if (direct !== null) {
    const target = nodes[direct];
    if (target.type === "folder")
      return { kind: "dir", id: direct };
    return { error: `${path}: already exists` };
  }
  const resolved = resolveCreateParent(nodes, cwd, path);
  return "error" in resolved ? resolved : { kind: "path", parentId: resolved.parentId, name: resolved.leaf };
}

/** Read a file's lines by path, or fall back to piped stdin when no path is given. */
function inputLines(
  command: string,
  path: string | undefined,
  nodes: Record<string, FsNode>,
  cwd: string,
  stdin: string | undefined,
): string[] | ShellResult {
  if (path === undefined) {
    if (stdin === undefined)
      return err(`${command}: missing file operand`);
    return stdin === "" ? [] : stdin.split("\n");
  }
  const targetId = resolvePath(nodes, cwd, path);
  if (targetId === null)
    return err(`${command}: ${path}: no such file or directory`);
  const target = nodes[targetId];
  if (target.type === "folder")
    return err(`${command}: ${path}: is a directory`);
  if (target.contentRef)
    return err(`${command}: ${path}: binary file`);
  const content = target.content ?? "";
  return content === "" ? [] : content.split("\n");
}

/** Parse a leading `-n <count>` flag shared by head/tail, defaulting to 10 lines. */
function parseCountFlag(args: string[]): { count: number; rest: string[] } {
  if (args[0] === "-n" && args[1] !== undefined) {
    const count = Number.parseInt(args[1], 10);
    return { count: Number.isNaN(count) ? 10 : count, rest: args.slice(2) };
  }
  return { count: 10, rest: args };
}

interface ParsedCommand {
  command: string;
  args: string[];
  redirect: { path: string; append: boolean } | null;
}

function unquote(token: string): string {
  return token.replace(/^["']|["']$/g, "");
}

/**
 * Tokenize on whitespace, treating a quoted span as one token so a `>`
 * inside quotes (`echo "a > b"`) is never mistaken for a redirect, then
 * pull any `>`/`>>` token (glued or spaced) out as the redirect.
 */
function parse(input: string): ParsedCommand {
  const tokens = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  let redirect: ParsedCommand["redirect"] = null;
  const rest: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === ">" || tok === ">>") {
      const target = tokens[i + 1];
      if (target !== undefined) {
        redirect = { path: unquote(target), append: tok === ">>" };
        i++;
      }
      continue;
    }
    if (tok.startsWith(">>") && tok.length > 2) {
      redirect = { path: unquote(tok.slice(2)), append: true };
      continue;
    }
    if (tok.startsWith(">") && tok.length > 1) {
      redirect = { path: unquote(tok.slice(1)), append: false };
      continue;
    }
    rest.push(unquote(tok));
  }

  return { command: rest[0] ?? "", args: rest.slice(1), redirect };
}

/** Split a command line on top-level `|`, ignoring `|` inside quotes. */
function splitPipeline(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of input) {
    if (quote) {
      current += ch;
      if (ch === quote)
        quote = null;
    }
    else if (ch === "\"" || ch === "'") {
      quote = ch;
      current += ch;
    }
    else if (ch === "|") {
      parts.push(current);
      current = "";
    }
    else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map(s => s.trim());
}

function treeLines(
  nodes: Record<string, FsNode>,
  id: string,
  prefix: string,
): string[] {
  const kids = childrenOf(nodes, id);
  const lines: string[] = [];
  kids.forEach((kid, i) => {
    const last = i === kids.length - 1;
    lines.push(`${prefix}${last ? "└─ " : "├─ "}${kid.name}${kid.type === "folder" ? "/" : ""}`);
    if (kid.type === "folder")
      lines.push(...treeLines(nodes, kid.id, `${prefix}${last ? "   " : "│  "}`));
  });
  return lines;
}

/** Write a command's output to its `> file` / `>> file` redirect target, if any. */
function applyRedirect(
  redirect: { path: string; append: boolean },
  result: ShellResult,
  ctx: ShellContext,
): ShellResult {
  const { nodes, cwd } = ctx;
  if (!isValidNodeName(redirect.path))
    return err(`${redirect.path}: names cannot contain '/'`);
  const existing = childByName(nodes, cwd, redirect.path);
  if (existing?.type === "folder")
    return err(`${redirect.path}: is a directory`);
  if (existing?.contentRef)
    return err(`${redirect.path}: cannot write to a binary file`);

  const text = result.lines.map(l => l.text).join("\n");
  const finalText = redirect.append && existing ? `${existing.content ?? ""}${text}\n` : `${text}\n`;
  if (existing)
    ctx.updateFileContent(existing.id, finalText);
  else
    ctx.createFile(cwd, redirect.path, finalText, "text/plain");
  return { ...result, lines: [] };
}

/** Execute one (already pipe-split) command line, threading piped stdin through. */
function execSingle(input: string, ctx: ShellContext, stdin: string | undefined): ShellResult {
  const trimmed = input.trim();
  if (trimmed === "")
    return { lines: [] };

  const parsed = parse(trimmed);
  const result = runBuiltin(parsed.command, parsed.args, ctx, stdin);

  if (!parsed.redirect || result.lines.some(l => l.kind === "error"))
    return result;
  return applyRedirect(parsed.redirect, result, ctx);
}

/** Run one builtin by name against its parsed args, ignoring any redirect. */
function runBuiltin(command: string, args: string[], ctx: ShellContext, stdin: string | undefined): ShellResult {
  const { nodes, cwd } = ctx;

  switch (command) {
    case "help":
      return out(HELP_TEXT);

    case "clear":
      return { lines: [], clear: true };

    case "whoami":
      return out(ctx.user);

    case "date":
      return out(new Date().toString());

    case "pwd":
      return out(pathString(nodes, cwd));

    case "ls": {
      const targetId = args[0] ? resolvePath(nodes, cwd, args[0]) : cwd;
      if (targetId === null)
        return err(`ls: ${args[0]}: no such file or directory`);
      const target = nodes[targetId];
      if (target.type === "file")
        return out(target.name);
      const kids = childrenOf(nodes, targetId);
      if (kids.length === 0)
        return { lines: [] };
      return out(
        kids.map(n => (n.type === "folder" ? `${n.name}/` : n.name)).join("\n"),
      );
    }

    case "cd": {
      const dest = args[0] ?? "~";
      const targetId = resolvePath(nodes, cwd, dest);
      if (targetId === null)
        return err(`cd: ${dest}: no such file or directory`);
      if (nodes[targetId].type !== "folder")
        return err(`cd: ${dest}: not a directory`);
      return { lines: [], cwd: targetId };
    }

    case "cat": {
      if (!args[0]) {
        if (stdin === undefined)
          return err("cat: missing file operand");
        return out(stdin);
      }
      const targetId = resolvePath(nodes, cwd, args[0]);
      if (targetId === null)
        return err(`cat: ${args[0]}: no such file or directory`);
      const target = nodes[targetId];
      if (target.type === "folder")
        return err(`cat: ${args[0]}: is a directory`);
        // Blob-backed files (B1: uploads, oversized text) have no inline
        // content to print — a size/type notice instead of a blank dump.
      if (target.contentRef) {
        const kind = target.mimeType?.startsWith("image/") ? "binary image" : "binary file";
        return out(`[${target.name}: ${kind}, ${target.mimeType ?? "unknown type"}, ${formatBytes(target.contentRef.size)}]`);
      }
      if (target.mimeType?.startsWith("image/"))
        return out(`[${target.name}: binary image, ${target.mimeType}]`);
      return out(target.content ?? "");
    }

    case "mkdir": {
      if (!args[0])
        return err("mkdir: missing operand");
      const resolved = resolveCreateParent(nodes, cwd, args[0]);
      if ("error" in resolved)
        return err(`mkdir: ${resolved.error}`);
      if (childByName(nodes, resolved.parentId, resolved.leaf))
        return err(`mkdir: ${args[0]}: file exists`);
      ctx.createFolder(resolved.parentId, resolved.leaf);
      return { lines: [] };
    }

    case "touch": {
      if (!args[0])
        return err("touch: missing file operand");
      const resolved = resolveCreateParent(nodes, cwd, args[0]);
      if ("error" in resolved)
        return err(`touch: ${resolved.error}`);
      const existing = childByName(nodes, resolved.parentId, resolved.leaf);
      if (existing) {
        // Refresh the timestamp instead of creating a "name 2" duplicate.
        // Timestamp only — rewriting the content would drop a blob-backed
        // file's bytes.
        if (existing.type === "file")
          ctx.touchFile(existing.id);
        return { lines: [] };
      }
      ctx.createFile(resolved.parentId, resolved.leaf, "", "text/plain");
      return { lines: [] };
    }

    case "echo":
      return out(args.join(" "));

    case "cp": {
      if (!args[0] || !args[1])
        return err("cp: usage: cp <source> <dest>");
      const srcId = resolvePath(nodes, cwd, args[0]);
      if (srcId === null)
        return err(`cp: ${args[0]}: no such file or directory`);
      const dest = resolveDestination(nodes, cwd, args[1]);
      if ("error" in dest)
        return err(`cp: ${dest.error}`);
      const copy = ctx.duplicate(srcId, destParentId(dest));
      if (!copy)
        return err(`cp: cannot copy '${args[0]}' into '${args[1]}'`);
      if (dest.kind === "path" && copy.name !== dest.name)
        ctx.rename(copy.id, dest.name);
      return { lines: [] };
    }

    case "mv": {
      if (!args[0] || !args[1])
        return err("mv: usage: mv <source> <dest>");
      const srcId = resolvePath(nodes, cwd, args[0]);
      if (srcId === null)
        return err(`mv: ${args[0]}: no such file or directory`);
      if (isSystemNode(srcId))
        return err(`mv: ${args[0]}: cannot move a system folder`);
      const node = nodes[srcId];
      const dest = resolveDestination(nodes, cwd, args[1]);
      if ("error" in dest)
        return err(`mv: ${dest.error}`);
      const targetParentId = destParentId(dest);
      if (srcId === targetParentId || isDescendantOf(nodes, targetParentId, srcId))
        return err(`mv: cannot move '${args[0]}' into itself`);
      if (targetParentId !== node.parentId && !ctx.move(srcId, targetParentId))
        return err(`mv: cannot move '${args[0]}' into '${args[1]}'`);
      if (dest.kind === "path" && dest.name !== node.name)
        ctx.rename(srcId, dest.name);
      return { lines: [] };
    }

    case "head": {
      const { count, rest } = parseCountFlag(args);
      const linesOrErr = inputLines("head", rest[0], nodes, cwd, stdin);
      if (!Array.isArray(linesOrErr))
        return linesOrErr;
      return out(linesOrErr.slice(0, Math.max(0, count)).join("\n"));
    }

    case "tail": {
      const { count, rest } = parseCountFlag(args);
      const linesOrErr = inputLines("tail", rest[0], nodes, cwd, stdin);
      if (!Array.isArray(linesOrErr))
        return linesOrErr;
      return out((count <= 0 ? [] : linesOrErr.slice(-count)).join("\n"));
    }

    case "grep": {
      const ignoreCase = args[0] === "-i";
      const rest = ignoreCase ? args.slice(1) : args;
      const pattern = rest[0];
      if (!pattern)
        return err("grep: missing pattern");
      const linesOrErr = inputLines("grep", rest[1], nodes, cwd, stdin);
      if (!Array.isArray(linesOrErr))
        return linesOrErr;
      const needle = ignoreCase ? pattern.toLowerCase() : pattern;
      const matches = linesOrErr.filter(l => (ignoreCase ? l.toLowerCase() : l).includes(needle));
      return out(matches.join("\n"));
    }

    case "open": {
      if (!args[0])
        return err("open: missing file operand");
      const targetId = resolvePath(nodes, cwd, args[0]);
      if (targetId === null)
        return err(`open: ${args[0]}: no such file or directory`);
      const target = nodes[targetId];
      if (target.type === "folder")
        return err(`open: ${args[0]}: is a directory`);
      if (!ctx.openPath(target))
        return err(`open: ${args[0]}: no app associated with this file`);
      return { lines: [] };
    }

    case "rm": {
      if (!args[0])
        return err("rm: missing operand");
      const targetId = resolvePath(nodes, cwd, args[0]);
      if (targetId === null)
        return err(`rm: ${args[0]}: no such file or directory`);
      if (isSystemNode(targetId))
        return err(`rm: ${args[0]}: cannot remove a system folder`);
      if (targetId === cwd)
        return err("rm: cannot remove the current directory");
        // Trashing an ancestor would silently drag the cwd into the Trash.
      if (isDescendantOf(nodes, cwd, targetId))
        return err(`rm: ${args[0]}: contains the current directory`);
      ctx.moveToTrash(targetId);
      return { lines: [line("output", `moved '${nodes[targetId].name}' to Trash`)] };
    }

    case "tree": {
      const lines = treeLines(nodes, cwd, "");
      return out([".", ...lines].join("\n"));
    }

    default:
      return err(`${command}: command not found (try 'help')`);
  }
}

/** Execute one command line, splitting on `|` and piping output between builtins. */
export function runCommand(input: string, ctx: ShellContext): ShellResult {
  const trimmed = input.trim();
  if (trimmed === "")
    return { lines: [] };

  const segments = splitPipeline(trimmed);
  if (segments.length === 1)
    return execSingle(segments[0], ctx, undefined);

  let stdin: string | undefined;
  let result: ShellResult = { lines: [] };
  for (const [i, segment] of segments.entries()) {
    result = execSingle(segment, ctx, stdin);
    if (result.lines.some(l => l.kind === "error"))
      return result;
    // Skip the join on the last segment — nothing reads `stdin` again.
    if (i < segments.length - 1)
      stdin = result.lines.map(l => l.text).join("\n");
  }
  return result;
}

/**
 * Tab-completion candidates for the token currently being typed: the first
 * token completes against builtin command names, any later token completes
 * as a path relative to `cwd` (folders keep their existing `dir/` prefix).
 */
export function completeToken(
  nodes: Record<string, FsNode>,
  cwd: string,
  tokens: string[],
): string[] {
  const partial = tokens.at(-1) ?? "";

  if (tokens.length <= 1)
    return COMMAND_NAMES.filter(name => name.startsWith(partial));

  const { dir, leaf } = splitPath(partial);
  const parentId = resolveParentDir(nodes, cwd, dir);
  if (parentId === null)
    return [];
  const needle = leaf.toLowerCase();
  const prefix = dir ? `${dir}/` : "";
  return childrenOf(nodes, parentId)
    .filter(n => n.name.toLowerCase().startsWith(needle))
    .map(n => `${prefix}${n.name}${n.type === "folder" ? "/" : ""}`);
}

/** Longest string every candidate in `candidates` starts with. */
function commonPrefix(candidates: string[]): string {
  return candidates.reduce((a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  });
}

export type CompletionResult
  = | { kind: "replace"; text: string }
    | { kind: "list"; matches: string[] };

/**
 * What Tab should do with a token's completion candidates: a single match
 * (or a shared prefix longer than what's already typed) replaces the token
 * in place; otherwise the candidates are listed for the user to read. Pure
 * so `TerminalApp`'s Tab handler stays plain keystroke plumbing.
 */
export function resolveCompletion(matches: string[], partial: string): CompletionResult | null {
  if (matches.length === 0)
    return null;
  if (matches.length === 1)
    return { kind: "replace", text: matches[0] };
  const prefix = commonPrefix(matches);
  return prefix.length > partial.length ? { kind: "replace", text: prefix } : { kind: "list", matches };
}
