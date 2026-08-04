import type { FsNode } from "@/system/fs/types";
import { formatBytes, formatModified } from "@/lib/format";
import {
  cachedFolderSizes,
  childrenOf,
  fileBytes,
  isDescendantOf,
  isSystemNode,
  isValidNodeName,
  pathOf,
} from "@/system/fs/fsStore";
import { textMimeTypeForFilename } from "@/system/fs/mimeTypes";
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
  /**
   * What the line *is*, for the REPL to colour by — a folder in a listing,
   * a heading, an aside. The engine names the meaning and the app owns the
   * palette, so nothing in here has to know a token from a hex value. Plain
   * output leaves it unset.
   */
  tone?: "dir" | "heading" | "muted";
}

export interface ShellResult {
  lines: ShellLine[];
  /** New working-directory node id, when the command changed it. */
  cwd?: string;
  /** Request to clear the scrollback. */
  clear?: boolean;
  /** Request to close the terminal (`exit`). */
  exit?: boolean;
  /**
   * Exit status, when a command reports one that the printed lines don't
   * already imply — `grep` finding nothing is a failure (status 1) without
   * being an error worth printing, which is exactly the distinction `&&`
   * and `||` need. Read it through {@link statusOf}, never directly.
   */
  code?: number;
}

/**
 * The status a result reports: its explicit `code` when it set one, else 1
 * if it printed an error line. Deriving the fallback keeps every existing
 * builtin honest without each one having to remember to set a code.
 */
export function statusOf(result: ShellResult): number {
  return result.code ?? (result.lines.some(l => l.kind === "error") ? 1 : 0);
}

/** Everything a command needs from the host (fs access + current dir). */
export interface ShellContext {
  cwd: string;
  nodes: Record<string, FsNode>;
  /**
   * Exit status of the previous *line*, which `$?` expands to before the
   * first command of this one runs.
   */
  lastStatus?: number;
  /**
   * Re-read the node map between the segments of a `;`/`&&`/`||` sequence.
   * Without it `nodes` stays the snapshot taken when the line was submitted
   * and `mkdir foo && cd foo` can't see the folder it just made. Optional so
   * a caller running one command at a time needn't supply it.
   */
  readNodes?: () => Record<string, FsNode>;
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
  /** Submitted command lines, oldest first — what `history` prints. */
  history: string[];
  clearHistory: () => void;
  /** Alias name -> the command string it expands to (e.g. "ll" -> "ls"). */
  aliases: Record<string, string>;
  /** Persist a new/updated alias — write-through to the same store `aliases` reads from. */
  setAlias: (name: string, expansion: string) => void;
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
  "find",
  "alias",
  "wc",
  "sort",
  "uniq",
  "which",
  "history",
  "du",
  "exit",
] as const;

const HELP_TEXT = [
  "Kagami Shell — available commands:",
  "  ls [-l] [-a] [path]  list directory contents (long form, including dot-files)",
  "  cd [path]           change directory (cd .. , cd ~ , cd /)",
  "  pwd                 print working directory",
  "  cat <file>          print a file's contents",
  "  mkdir [-p] <path>   create a directory (-p creates missing parents too)",
  "  touch <path>        create an empty file (parent dirs must exist)",
  "  echo <text>         print text (> file to write, >> to append)",
  "  cp <src> <dest>     copy a file or folder",
  "  mv <src> <dest>     move or rename a file or folder",
  "  head [-n N] <file>  print the first N lines (default 10)",
  "  tail [-n N] <file>  print the last N lines (default 10)",
  "  grep [-i] [-E] [-r] <pat> <file>  print matching lines (ignoring case,",
  "                      as a regular expression, recursively through a folder)",
  "  open <path>         open a file in its associated app",
  "  rm [-r] <name>      move an item to the Trash (-r for a folder)",
  "  tree                show the tree below the current directory",
  "  find [path] [-name <pattern>]  list everything under path, optionally",
  "                      filtered by a *?-glob name pattern (default path: .)",
  "  alias [name[=value] [value...]]  show/define a command alias",
  "  wc [-l|-w|-c] [file]  count lines, words and characters",
  "  sort [-r] [-n] [file]  sort lines (reversed, numerically)",
  "  uniq [-c] [file]    drop adjacent duplicate lines (-c counts them)",
  "  which <name>...     say what a name runs: a builtin or an alias",
  "  history [-c]        list previously run commands (-c clears them)",
  "  du [-h] [path]      size of each directory below path (-h human-readable)",
  "  whoami              print the current user",
  "  date                print the current date and time",
  "  clear               clear the screen",
  "  exit                close this terminal",
  "  help                show this help",
  "Pipe builtins together with |, e.g. `ls | grep .txt`. Tab completes commands and paths.",
  "Chain commands with ; (always), && (on success) or || (on failure); $? is the last exit status.",
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

function line(kind: ShellLine["kind"], text: string, tone?: ShellLine["tone"]): ShellLine {
  return tone ? { kind, text, tone } : { kind, text };
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

/**
 * `mkdir -p`: create every missing segment of `path`, and succeed silently
 * when it already exists. Walks from the deepest existing prefix rather than
 * re-resolving, because `ctx.nodes` is a snapshot taken before the command
 * ran — a folder created by an earlier segment of this same loop isn't in
 * it, so each new segment's id has to come from `createFolder`'s return
 * value instead of a lookup.
 */
function makeDirs(path: string, ctx: ShellContext): ShellResult {
  const { nodes, cwd } = ctx;
  let currentId: string;
  let rest: string;
  if (path === "~" || path.startsWith("~/")) {
    currentId = HOME_ID;
    rest = path.slice(1);
  }
  else if (path.startsWith("/")) {
    currentId = ROOT_ID;
    rest = path;
  }
  else {
    currentId = cwd;
    rest = path;
  }

  for (const segment of rest.split("/")) {
    if (segment === "" || segment === ".")
      continue;
    if (segment === "..") {
      currentId = nodes[currentId]?.parentId ?? currentId;
      continue;
    }
    if (!isValidNodeName(segment))
      return err(`mkdir: ${path}: invalid name '${segment}'`);
    const existing = childByName(nodes, currentId, segment);
    if (existing) {
      if (existing.type !== "folder")
        return err(`mkdir: ${path}: '${segment}' is not a directory`);
      currentId = existing.id;
      continue;
    }
    currentId = ctx.createFolder(currentId, segment).id;
  }
  return { lines: [] };
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

/**
 * Pull leading short flags off an argument list: a `-rn` token counts as
 * both `-r` and `-n`, every letter has to be in `allowed`, and the first
 * non-flag token ends the run — so a positional argument that starts with
 * `-` is still reachable once a flag-shaped one has been consumed.
 */
function parseFlags(
  args: string[],
  allowed: string,
): { flags: Record<string, boolean>; rest: string[] } | { error: string } {
  const flags: Record<string, boolean> = {};
  let i = 0;
  for (; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("-") || arg === "-")
      break;
    for (const letter of arg.slice(1)) {
      if (!allowed.includes(letter))
        return { error: `unknown option '-${letter}'` };
      flags[letter] = true;
    }
  }
  return { flags, rest: args.slice(i) };
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

/**
 * Expand a leading alias into its command + args, splicing the invocation's
 * own args after the alias's own (e.g. alias `ll`="ls", `ll Documents` runs
 * `ls Documents`). Expansion happens once — an alias's own expansion isn't
 * re-checked against `aliases` again — so a self-referential alias can't
 * loop; it just runs the builtin under that name with its extra args, same
 * as any other typo-shaped user error.
 */
export function expandAlias(
  command: string,
  args: string[],
  aliases: Record<string, string>,
): { command: string; args: string[] } {
  const expansion = aliases[command];
  if (!expansion)
    return { command, args };
  const parsed = parse(expansion);
  return { command: parsed.command, args: [...parsed.args, ...args] };
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

/**
 * Compile a `find -name` glob pattern (`*` any run, `?` single char) into a
 * whole-name, case-insensitive matcher — the same subset plain `find`'s
 * `-name` supports, not a full glob library.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Depth-first listing of `id` and everything beneath it, as display paths
 * rooted at `displayRoot` (mirroring plain `find`'s output — the starting
 * path itself is included first, then each descendant's path). `matcher`
 * (when given) filters every entry, root included, by its own name.
 */
function findLines(
  nodes: Record<string, FsNode>,
  id: string,
  displayRoot: string,
  matcher: RegExp | null,
): string[] {
  const results: string[] = [];
  function walk(nodeId: string, displayPath: string): void {
    const node = nodes[nodeId];
    if (!node)
      return;
    if (!matcher || matcher.test(node.name))
      results.push(displayPath);
    if (node.type === "folder") {
      for (const kid of childrenOf(nodes, nodeId))
        walk(kid.id, `${displayPath}/${kid.name}`);
    }
  }
  walk(id, displayRoot);
  return results;
}

function treeLines(
  nodes: Record<string, FsNode>,
  id: string,
  prefix: string,
): ShellLine[] {
  const kids = childrenOf(nodes, id);
  const lines: ShellLine[] = [];
  kids.forEach((kid, i) => {
    const last = i === kids.length - 1;
    const isFolder = kid.type === "folder";
    lines.push(line(
      "output",
      `${prefix}${last ? "└─ " : "├─ "}${kid.name}${isFolder ? "/" : ""}`,
      isFolder ? "dir" : undefined,
    ));
    if (isFolder)
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
    ctx.createFile(cwd, redirect.path, finalText, textMimeTypeForFilename(redirect.path));
  return { ...result, lines: [] };
}

/** Execute one (already pipe-split) command line, threading piped stdin through. */
function execSingle(input: string, ctx: ShellContext, stdin: string | undefined): ShellResult {
  const trimmed = input.trim();
  if (trimmed === "")
    return { lines: [] };

  const parsed = parse(trimmed);
  const expanded = expandAlias(parsed.command, parsed.args, ctx.aliases);
  const result = runBuiltin(expanded.command, expanded.args, ctx, stdin);

  if (!parsed.redirect || result.lines.some(l => l.kind === "error"))
    return result;
  return applyRedirect(parsed.redirect, result, ctx);
}

/** Run one builtin by name against its parsed args, ignoring any redirect. */
function runBuiltin(command: string, args: string[], ctx: ShellContext, stdin: string | undefined): ShellResult {
  const { nodes, cwd } = ctx;

  switch (command) {
    case "help":
      // The command table is plain output; the title and the closing notes
      // (everything not indented into the table) read as chrome around it.
      return {
        lines: HELP_TEXT.split("\n").map((text, i) => {
          if (i === 0)
            return line("output", text, "heading");
          return line("output", text, text.startsWith("  ") ? undefined : "muted");
        }),
      };

    case "clear":
      return { lines: [], clear: true };

    case "whoami":
      return out(ctx.user);

    case "date":
      return out(new Date().toString());

    case "pwd":
      return out(pathString(nodes, cwd));

    case "ls": {
      const parsed = parseFlags(args, "la");
      if ("error" in parsed)
        return err(`ls: ${parsed.error}`);
      const { flags, rest } = parsed;
      const targetId = rest[0] ? resolvePath(nodes, cwd, rest[0]) : cwd;
      if (targetId === null)
        return err(`ls: ${rest[0]}: no such file or directory`);
      const target = nodes[targetId];
      // Defensive (review-backlog #18): resolvePath can hand back `cwd`
      // unchecked (an empty `rest`), so a caller whose `cwd` no longer
      // exists in `nodes` would otherwise crash here rather than the
      // engine handling it itself.
      if (!target)
        return err(`ls: ${rest[0]}: no such file or directory`);
      const entries = target.type === "file" ? [target] : childrenOf(nodes, targetId);
      // Dot-files are hidden without -a, the same convention Files' own
      // "Show Hidden Items" follows.
      const visible = flags.a ? entries : entries.filter(n => !n.name.startsWith("."));
      if (visible.length === 0)
        return { lines: [] };
      return {
        lines: visible.map((n) => {
          const name = n.type === "folder" ? `${n.name}/` : n.name;
          const tone = n.type === "folder" ? "dir" as const : undefined;
          if (!flags.l)
            return line("output", name, tone);
          // Folders print "-" rather than a recursive byte total: that would
          // cost a full-tree pass on every listing, and `du` already exists
          // for when the total is what you actually want.
          const size = n.type === "folder" ? "-" : formatBytes(fileBytes(n));
          return line("output", `${n.type === "folder" ? "d" : "-"} ${size.padStart(9)}  ${formatModified(n.modifiedAt).padEnd(12)}${name}`, tone);
        }),
      };
    }

    case "cd": {
      const dest = args[0] ?? "~";
      const targetId = resolvePath(nodes, cwd, dest);
      if (targetId === null)
        return err(`cd: ${dest}: no such file or directory`);
      // Defensive (review-backlog #18) — same unguarded-lookup risk as `ls`.
      const target = nodes[targetId];
      if (!target)
        return err(`cd: ${dest}: no such file or directory`);
      if (target.type !== "folder")
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
      const parsed = parseFlags(args, "p");
      if ("error" in parsed)
        return err(`mkdir: ${parsed.error}`);
      const { flags, rest: mkdirArgs } = parsed;
      if (!mkdirArgs[0])
        return err("mkdir: missing operand");
      if (flags.p)
        return makeDirs(mkdirArgs[0], ctx);
      const resolved = resolveCreateParent(nodes, cwd, mkdirArgs[0]);
      if ("error" in resolved)
        return err(`mkdir: ${resolved.error}`);
      if (childByName(nodes, resolved.parentId, resolved.leaf))
        return err(`mkdir: ${mkdirArgs[0]}: file exists`);
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
      ctx.createFile(resolved.parentId, resolved.leaf, "", textMimeTypeForFilename(resolved.leaf));
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
      const parsed = parseFlags(args, "irE");
      if ("error" in parsed)
        return err(`grep: ${parsed.error}`);
      const { flags, rest } = parsed;
      const pattern = rest[0];
      if (!pattern)
        return err("grep: missing pattern");

      let matches: (candidate: string) => boolean;
      if (flags.E) {
        // -E compiles the pattern as a regular expression. A bad pattern is
        // a user error to report, not an exception to throw out of the
        // engine, so the construction is guarded.
        let regexp: RegExp;
        try {
          regexp = new RegExp(pattern, flags.i ? "i" : "");
        }
        catch {
          return err(`grep: ${pattern}: invalid regular expression`);
        }
        matches = candidate => regexp.test(candidate);
      }
      else {
        const needle = flags.i ? pattern.toLowerCase() : pattern;
        matches = candidate => (flags.i ? candidate.toLowerCase() : candidate).includes(needle);
      }

      if (flags.r) {
        const display = rest[1] ?? ".";
        const rootId = rest[1] ? resolvePath(nodes, cwd, rest[1]) : cwd;
        if (rootId === null || !nodes[rootId])
          return err(`grep: ${display}: no such file or directory`);
        const hits: string[] = [];
        const walk = (id: string, path: string): void => {
          const node = nodes[id];
          if (!node)
            return;
          if (node.type === "folder") {
            for (const kid of childrenOf(nodes, id))
              walk(kid.id, `${path}/${kid.name}`);
            return;
          }
          // Blob-backed files have no inline text to scan (B1) — skipped
          // rather than reported, the way grep skips a binary file.
          if (node.contentRef || !node.content)
            return;
          for (const candidate of node.content.split("\n")) {
            if (matches(candidate))
              hits.push(`${path}:${candidate}`);
          }
        };
        walk(rootId, display);
        return { lines: hits.map(hit => line("output", hit)), code: hits.length > 0 ? 0 : 1 };
      }

      const linesOrErr = inputLines("grep", rest[1], nodes, cwd, stdin);
      if (!Array.isArray(linesOrErr))
        return linesOrErr;
      const hits = linesOrErr.filter(matches);
      // No match is a status-1 failure without being an error worth
      // printing — what makes `grep x f && echo found` behave.
      return { ...out(hits.join("\n")), code: hits.length > 0 ? 0 : 1 };
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
      const parsed = parseFlags(args, "rR");
      if ("error" in parsed)
        return err(`rm: ${parsed.error}`);
      const { flags, rest } = parsed;
      if (!rest[0])
        return err("rm: missing operand");
      const targetId = resolvePath(nodes, cwd, rest[0]);
      if (targetId === null)
        return err(`rm: ${rest[0]}: no such file or directory`);
      if (isSystemNode(targetId))
        return err(`rm: ${rest[0]}: cannot remove a system folder`);
      // A folder needs -r, as it does in a real shell — trashing a whole
      // subtree on a mistyped name is exactly the accident the flag exists
      // to prevent, even with the Trash as a safety net.
      if (nodes[targetId]?.type === "folder" && !(flags.r || flags.R))
        return err(`rm: ${rest[0]}: is a directory (use -r)`);
      if (targetId === cwd)
        return err("rm: cannot remove the current directory");
        // Trashing an ancestor would silently drag the cwd into the Trash.
      if (isDescendantOf(nodes, cwd, targetId))
        return err(`rm: ${rest[0]}: contains the current directory`);
      ctx.moveToTrash(targetId);
      return { lines: [line("output", `moved '${nodes[targetId].name}' to Trash`)] };
    }

    case "tree":
      return { lines: [line("output", ".", "dir"), ...treeLines(nodes, cwd, "")] };

    case "find": {
      // `find [path] [-name <pattern>]` — path is optional (defaults to
      // cwd, shown as "."), unlike plain find where it's required; every
      // other command here that takes an optional leading path (ls, cat's
      // stdin fallback) does the same, so this matches the shell's own
      // convention rather than POSIX find's.
      let path: string | undefined;
      let rest = args;
      if (args[0] && !args[0].startsWith("-")) {
        path = args[0];
        rest = args.slice(1);
      }
      let pattern: string | undefined;
      if (rest[0] === "-name") {
        if (rest[1] === undefined)
          return err("find: -name requires a pattern");
        pattern = rest[1];
        rest = rest.slice(2);
      }
      if (rest.length > 0)
        return err(`find: unknown argument '${rest[0]}'`);
      const rootId = path ? resolvePath(nodes, cwd, path) : cwd;
      if (rootId === null || !nodes[rootId])
        return err(`find: ${path ?? "."}: no such file or directory`);
      const matcher = pattern ? globToRegExp(pattern) : null;
      const lines = findLines(nodes, rootId, path ?? ".", matcher);
      return out(lines.join("\n"));
    }

    case "alias": {
      if (args.length === 0) {
        const names = Object.keys(ctx.aliases).sort();
        if (names.length === 0)
          return out("no aliases defined");
        return out(names.map(name => `alias ${name}='${ctx.aliases[name]}'`).join("\n"));
      }
      // Two accepted shapes: `alias name=value` (single-token, no spaces in
      // value — this shell's tokenizer only treats a *whole* token as
      // quoted, so `name="multi word"` would mis-tokenize) and
      // `alias name value...` (space-joined, no quoting needed at all).
      const first = args[0];
      const eq = first.indexOf("=");
      const name = eq === -1 ? first : first.slice(0, eq);
      const valueParts = eq === -1 ? args.slice(1) : [first.slice(eq + 1), ...args.slice(1)];
      const expansion = valueParts.join(" ");
      if (!name)
        return err("alias: missing name");
      if (!expansion)
        return err(`alias: ${name}: missing command`);
      ctx.setAlias(name, expansion);
      return { lines: [] };
    }

    case "wc": {
      const parsed = parseFlags(args, "lwc");
      if ("error" in parsed)
        return err(`wc: ${parsed.error}`);
      const { flags, rest } = parsed;
      const linesOrErr = inputLines("wc", rest[0], nodes, cwd, stdin);
      if (!Array.isArray(linesOrErr))
        return linesOrErr;
      const counts = {
        l: linesOrErr.length,
        w: linesOrErr.reduce((n, l) => n + (l.trim() === "" ? 0 : l.trim().split(/\s+/).length), 0),
        // Characters as this shell stores them: the joined text, so the
        // newlines *between* lines count and a trailing one doesn't exist.
        c: linesOrErr.join("\n").length,
      };
      const wanted = (["l", "w", "c"] as const).filter(f => flags[f]);
      const shown = (wanted.length > 0 ? wanted : (["l", "w", "c"] as const)).map(f => counts[f]);
      return out([...shown, rest[0]].filter(v => v !== undefined).join(" "));
    }

    case "sort": {
      const parsed = parseFlags(args, "rn");
      if ("error" in parsed)
        return err(`sort: ${parsed.error}`);
      const { flags, rest } = parsed;
      const linesOrErr = inputLines("sort", rest[0], nodes, cwd, stdin);
      if (!Array.isArray(linesOrErr))
        return linesOrErr;
      const sorted = [...linesOrErr].sort((a, b) => (flags.n
        // Non-numeric lines sort as 0 under -n, the same as plain sort.
        ? (Number.parseFloat(a) || 0) - (Number.parseFloat(b) || 0)
        : a.localeCompare(b)));
      if (flags.r)
        sorted.reverse();
      return out(sorted.join("\n"));
    }

    case "uniq": {
      const parsed = parseFlags(args, "c");
      if ("error" in parsed)
        return err(`uniq: ${parsed.error}`);
      const { flags, rest } = parsed;
      const linesOrErr = inputLines("uniq", rest[0], nodes, cwd, stdin);
      if (!Array.isArray(linesOrErr))
        return linesOrErr;
      // Adjacent runs only, like plain uniq — `sort | uniq` is the idiom for
      // deduping a whole file, and it works here because sort is a builtin too.
      const runs: { text: string; count: number }[] = [];
      for (const text of linesOrErr) {
        const last = runs.at(-1);
        if (last && last.text === text)
          last.count++;
        else
          runs.push({ text, count: 1 });
      }
      return out(runs.map(r => (flags.c ? `${r.count} ${r.text}` : r.text)).join("\n"));
    }

    case "which": {
      if (args.length === 0)
        return err("which: missing name");
      const lines = args.map((name) => {
        if (ctx.aliases[name])
          return line("output", `${name}: aliased to ${ctx.aliases[name]}`);
        if ((COMMAND_NAMES as readonly string[]).includes(name))
          return line("output", `${name}: shell builtin`);
        return line("error", `which: ${name}: not found`);
      });
      return { lines };
    }

    case "history": {
      if (args[0] === "-c") {
        ctx.clearHistory();
        return { lines: [] };
      }
      if (args[0] !== undefined)
        return err(`history: unknown option '${args[0]}'`);
      if (ctx.history.length === 0)
        return out("no history yet");
      // Right-aligned indices so the commands themselves line up.
      const width = String(ctx.history.length).length;
      return out(ctx.history.map((cmd, i) => `${String(i + 1).padStart(width, " ")}  ${cmd}`).join("\n"));
    }

    case "du": {
      const parsed = parseFlags(args, "h");
      if ("error" in parsed)
        return err(`du: ${parsed.error}`);
      const { flags, rest } = parsed;
      const display = rest[0] ?? ".";
      const targetId = rest[0] ? resolvePath(nodes, cwd, rest[0]) : cwd;
      const target = targetId === null ? undefined : nodes[targetId];
      if (!target)
        return err(`du: ${display}: no such file or directory`);
      const format = (bytes: number): string => (flags.h ? formatBytes(bytes) : String(bytes));
      if (target.type === "file")
        return out(`${format(fileBytes(target))}\t${display}`);
      // Sizes in bytes rather than plain du's disk blocks — this VFS has no
      // block size to round to. Post-order, so each directory is listed
      // before the parent it counts towards.
      const sizes = cachedFolderSizes(nodes);
      const lines: string[] = [];
      const walk = (id: string, path: string): void => {
        for (const kid of childrenOf(nodes, id)) {
          if (kid.type === "folder")
            walk(kid.id, `${path}/${kid.name}`);
        }
        lines.push(`${format(sizes.get(id) ?? 0)}\t${path}`);
      };
      walk(target.id, display);
      return out(lines.join("\n"));
    }

    case "exit": {
      const code = args[0] === undefined ? 0 : Number.parseInt(args[0], 10);
      if (Number.isNaN(code))
        return err(`exit: ${args[0]}: numeric argument required`);
      return { lines: [], exit: true, code };
    }

    default:
      return err(`${command}: command not found (try 'help')`);
  }
}

/** Execute one pipeline, splitting on `|` and piping output between builtins. */
function runPipeline(input: string, ctx: ShellContext): ShellResult {
  const segments = splitPipeline(input);
  if (segments.length === 1)
    return execSingle(segments[0], ctx, undefined);

  let stdin: string | undefined;
  let result: ShellResult = { lines: [] };
  for (const [i, segment] of segments.entries()) {
    result = execSingle(segment, ctx, stdin);
    // Only a printed error stops the pipeline. A plain non-zero status
    // doesn't: `grep nope file | wc -l` still has to reach wc and print 0,
    // exactly as it would in a real shell.
    if (result.lines.some(l => l.kind === "error"))
      return result;
    // Skip the join on the last segment — nothing reads `stdin` again.
    if (i < segments.length - 1)
      stdin = result.lines.map(l => l.text).join("\n");
  }
  return result;
}

/** One pipeline of a sequence, plus the operator that introduced it. */
interface SequenceSegment {
  /** The operator *before* this segment; null for the first one. */
  op: ";" | "&&" | "||" | null;
  text: string;
}

/**
 * Split a line on top-level `;`, `&&` and `||`, ignoring operators inside
 * quotes. A single `|` is left alone — pipelines are split later, by
 * `splitPipeline`, from within each segment.
 */
export function splitSequence(input: string): SequenceSegment[] {
  const segments: SequenceSegment[] = [];
  let current = "";
  let op: SequenceSegment["op"] = null;
  let quote: string | null = null;

  const push = (next: SequenceSegment["op"]): void => {
    segments.push({ op, text: current.trim() });
    current = "";
    op = next;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === quote)
        quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ";") {
      push(";");
      continue;
    }
    if ((ch === "&" || ch === "|") && input[i + 1] === ch) {
      push(ch === "&" ? "&&" : "||");
      i++;
      continue;
    }
    current += ch;
  }
  push(null);
  return segments;
}

/**
 * Substitute `$?` with the status of the command before it. The only
 * variable this shell expands: there are no user variables to set, so a
 * general `$VAR` pass would have nothing to look up.
 */
function expandStatus(input: string, status: number): string {
  return input.replaceAll("$?", String(status));
}

/**
 * Execute one submitted line: a `;`/`&&`/`||` sequence of pipelines, with
 * `&&`/`||` short-circuiting on the running exit status. The returned result
 * is the whole line's — every segment's output concatenated, the last `cd`
 * to win, and the status of the last segment that actually ran.
 */
export function runCommand(input: string, ctx: ShellContext): ShellResult {
  const trimmed = input.trim();
  if (trimmed === "")
    return { lines: [], code: ctx.lastStatus ?? 0 };

  const segments = splitSequence(trimmed);
  let status = ctx.lastStatus ?? 0;
  let cwd = ctx.cwd;
  const lines: ShellLine[] = [];
  let clear = false;
  let exit = false;

  for (const segment of segments) {
    if (segment.text === "")
      continue;
    if (segment.op === "&&" && status !== 0)
      continue;
    if (segment.op === "||" && status === 0)
      continue;

    const result = runPipeline(expandStatus(segment.text, status), {
      ...ctx,
      cwd,
      lastStatus: status,
      nodes: ctx.readNodes?.() ?? ctx.nodes,
    });
    status = statusOf(result);
    if (result.clear) {
      // `clear; ls` clears first and then shows the listing, so anything
      // printed by an earlier segment goes with the cleared screen.
      clear = true;
      lines.length = 0;
    }
    lines.push(...result.lines);
    if (result.cwd)
      cwd = result.cwd;
    if (result.exit) {
      // Nothing after `exit` on the same line runs — the shell is gone.
      exit = true;
      break;
    }
  }

  return {
    lines,
    code: status,
    ...(clear ? { clear: true } : {}),
    ...(exit ? { exit: true } : {}),
    ...(cwd !== ctx.cwd ? { cwd } : {}),
  };
}

/** Where each token of `input` starts and ends, with a quoted span counting as one token. */
function tokenSpans(input: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let start = -1;
  let quote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote)
        quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      if (start === -1)
        start = i;
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (start !== -1) {
        spans.push({ start, end: i });
        start = -1;
      }
      continue;
    }
    if (start === -1)
      start = i;
  }
  if (start !== -1)
    spans.push({ start, end: input.length });
  return spans;
}

export interface CompletionTarget {
  /** Everything before the token being completed — put back verbatim around the result. */
  head: string;
  /** The token being completed, unquoted. */
  partial: string;
  /** Its position on the line; 0 is the command itself. */
  index: number;
}

/**
 * The token Tab should complete. Quote-aware, which the REPL's old
 * `split(/\s+/)` was not: `cd "My Folder/Su` is one token there, so
 * completion resolves inside "My Folder" instead of against a phantom
 * directory called `"My`.
 */
export function completionTarget(input: string): CompletionTarget {
  const spans = tokenSpans(input);
  const last = spans.at(-1);
  // Trailing whitespace (or an empty line) means a *new*, empty token —
  // "ls " completes the first argument, not the command `ls` again.
  if (!last || last.end < input.length)
    return { head: input, partial: "", index: spans.length };
  return { head: input.slice(0, last.start), partial: unquote(input.slice(last.start)), index: spans.length - 1 };
}

/**
 * Wrap a completion in quotes when putting it back on the line unquoted
 * would re-tokenize it into two arguments.
 */
export function quoteToken(token: string): string {
  return /[\s"']/.test(token) ? `"${token}"` : token;
}

/**
 * Tab-completion candidates for the token currently being typed: the first
 * token completes against builtin command names (and the user's own
 * aliases), any later token completes as a path relative to `cwd` (folders
 * keep their existing `dir/` prefix).
 */
export function completeToken(
  nodes: Record<string, FsNode>,
  cwd: string,
  target: Pick<CompletionTarget, "partial" | "index">,
  aliases: string[] = [],
): string[] {
  const { partial, index } = target;

  if (index === 0) {
    return [...COMMAND_NAMES, ...aliases]
      .filter(name => name.startsWith(partial))
      .sort();
  }

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
