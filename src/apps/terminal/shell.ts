import type { FsNode } from "@/system/fs/types";
import { formatBytes } from "@/lib/format";
import {
  childrenOf,
  isDescendantOf,
  isSystemNode,
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
  moveToTrash: (id: string) => void;
  user: string;
}

const HELP_TEXT = [
  "Kagami Shell — available commands:",
  "  ls [path]        list directory contents",
  "  cd [path]        change directory (cd .. , cd ~ , cd /)",
  "  pwd              print working directory",
  "  cat <file>       print a file's contents",
  "  mkdir <name>     create a directory",
  "  touch <name>     create an empty file",
  "  echo <text>      print text (> file to write)",
  "  rm <name>        move an item to the Trash",
  "  tree             show the tree below the current directory",
  "  whoami           print the current user",
  "  date             print the current date and time",
  "  clear            clear the screen",
  "  help             show this help",
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

function line(kind: ShellLine["kind"], text: string): ShellLine {
  return { kind, text };
}

function err(text: string): ShellResult {
  return { lines: [line("error", text)] };
}

function out(text: string): ShellResult {
  return { lines: text === "" ? [] : [line("output", text)] };
}

interface ParsedCommand {
  command: string;
  args: string[];
  /** `> target` redirect, if present. */
  redirect: string | null;
}

function parse(input: string): ParsedCommand {
  let redirect: string | null = null;
  let body = input;
  const redirectMatch = input.match(/>\s*(\S+)\s*$/);
  if (redirectMatch) {
    redirect = redirectMatch[1];
    body = input.slice(0, redirectMatch.index).trim();
  }
  const tokens = body.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const cleaned = tokens.map(t => t.replace(/^["']|["']$/g, ""));
  return {
    command: cleaned[0] ?? "",
    args: cleaned.slice(1),
    redirect,
  };
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

/** Execute one command line. Pure: all effects go through `ctx`. */
export function runCommand(input: string, ctx: ShellContext): ShellResult {
  const trimmed = input.trim();
  if (trimmed === "")
    return { lines: [] };

  const { command, args, redirect } = parse(trimmed);
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
      if (!args[0])
        return err("cat: missing file operand");
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
      // A "/" in the name would create a node the path resolver (which
      // splits on "/") could never reach again.
      if (args[0].includes("/"))
        return err(`mkdir: ${args[0]}: names cannot contain '/'`);
      if (childByName(nodes, cwd, args[0]))
        return err(`mkdir: ${args[0]}: file exists`);
      ctx.createFolder(cwd, args[0]);
      return { lines: [] };
    }

    case "touch": {
      if (!args[0])
        return err("touch: missing file operand");
      if (args[0].includes("/"))
        return err(`touch: ${args[0]}: names cannot contain '/'`);
      const existing = childByName(nodes, cwd, args[0]);
      if (existing) {
        // Refresh the timestamp instead of creating a "name 2" duplicate.
        if (existing.type === "file")
          ctx.updateFileContent(existing.id, existing.content ?? "");
        return { lines: [] };
      }
      ctx.createFile(cwd, args[0], "", "text/plain");
      return { lines: [] };
    }

    case "echo": {
      const text = args.join(" ");
      if (redirect) {
        if (redirect.includes("/"))
          return err(`echo: ${redirect}: names cannot contain '/'`);
        const existing = childByName(nodes, cwd, redirect);
        if (existing?.type === "folder")
          return err(`echo: ${redirect}: is a directory`);
        if (existing)
          ctx.updateFileContent(existing.id, `${text}\n`);
        else ctx.createFile(cwd, redirect, `${text}\n`, "text/plain");
        return { lines: [] };
      }
      return out(text);
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
