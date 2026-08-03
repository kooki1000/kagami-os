import type { ShellContext } from "./shell";
import type { FsNode } from "@/system/fs/types";
import { beforeEach, describe, expect, it } from "vitest";
import { indexNodes, useFsStore } from "@/system/fs/fsStore";
import { DOCUMENTS_ID, HOME_ID, ROOT_ID, TRASH_ID } from "@/system/fs/types";
import { completeToken, expandAlias, resolveCompletion, resolvePath, runCommand, splitSequence, statusOf } from "./shell";

let openedNodes: FsNode[] = [];
let openPathResult = true;
let testAliases: Record<string, string> = {};

function node(partial: Partial<FsNode> & Pick<FsNode, "id" | "parentId" | "name" | "type">): FsNode {
  return { createdAt: 0, modifiedAt: 0, ...partial };
}

function seed(): void {
  useFsStore.setState({
    nodes: indexNodes([
      node({ id: ROOT_ID, parentId: null, name: "Kagami", type: "folder" }),
      node({ id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder" }),
      node({ id: DOCUMENTS_ID, parentId: HOME_ID, name: "Documents", type: "folder" }),
      node({ id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder" }),
      node({ id: "reports", parentId: DOCUMENTS_ID, name: "Reports", type: "folder" }),
      node({ id: "child", parentId: "reports", name: "Child", type: "folder" }),
      node({ id: "note", parentId: DOCUMENTS_ID, name: "note.md", type: "file", mimeType: "text/markdown", content: "hi" }),
      node({ id: "deep", parentId: "reports", name: "deep.txt", type: "file", mimeType: "text/plain" }),
      node({ id: "poem", parentId: DOCUMENTS_ID, name: "poem.txt", type: "file", mimeType: "text/plain", content: "roses\nviolets\nsky is blue\nROSES again" }),
    ]),
    ready: true,
  });
  openedNodes = [];
  openPathResult = true;
  testAliases = {};
}

function ctx(cwd = HOME_ID): ShellContext {
  const s = useFsStore.getState();
  return {
    cwd,
    nodes: s.nodes,
    createFolder: s.createFolder,
    createFile: s.createFile,
    updateFileContent: s.updateFileContent,
    touchFile: s.touchFile,
    rename: s.rename,
    move: s.move,
    duplicate: s.duplicate,
    moveToTrash: s.moveToTrash,
    openPath: (node) => {
      openedNodes.push(node);
      return openPathResult;
    },
    user: "kagami",
    history: [],
    clearHistory: () => {},
    // Same as the app: a sequence's later segments re-read the store rather
    // than reusing the snapshot the line started with.
    readNodes: () => useFsStore.getState().nodes,
    aliases: testAliases,
    setAlias: (name, expansion) => {
      testAliases = { ...testAliases, [name]: expansion };
    },
  };
}

function run(input: string, cwd = HOME_ID) {
  return runCommand(input, ctx(cwd));
}

function text(input: string, cwd = HOME_ID): string {
  return run(input, cwd).lines.map(l => l.text).join("\n");
}

function nodesByName(name: string) {
  return Object.values(useFsStore.getState().nodes).find(n => n.name === name);
}

beforeEach(seed);

describe("resolvePath", () => {
  it("resolves relative, parent, home and absolute paths", () => {
    expect(resolvePath(useFsStore.getState().nodes, HOME_ID, "Documents")).toBe(DOCUMENTS_ID);
    expect(resolvePath(useFsStore.getState().nodes, DOCUMENTS_ID, "..")).toBe(HOME_ID);
    expect(resolvePath(useFsStore.getState().nodes, DOCUMENTS_ID, "../..")).toBe(ROOT_ID);
    expect(resolvePath(useFsStore.getState().nodes, DOCUMENTS_ID, "~")).toBe(HOME_ID);
    expect(resolvePath(useFsStore.getState().nodes, DOCUMENTS_ID, ".")).toBe(DOCUMENTS_ID);
    expect(resolvePath(useFsStore.getState().nodes, ROOT_ID, "/Home/Documents")).toBe(DOCUMENTS_ID);
  });

  it("returns null for a missing path", () => {
    expect(resolvePath(useFsStore.getState().nodes, HOME_ID, "nope")).toBeNull();
  });
});

describe("navigation + read commands", () => {
  it("pwd prints the absolute working directory", () => {
    expect(text("pwd", DOCUMENTS_ID)).toBe("/Home/Documents");
  });

  it("ls lists the current directory, folders suffixed with /", () => {
    expect(text("ls", HOME_ID)).toBe("Documents/");
    expect(text("ls Documents", HOME_ID)).toBe("Reports/\nnote.md\npoem.txt");
  });

  it("cd changes directory and rejects files / missing targets", () => {
    expect(run("cd Documents", HOME_ID).cwd).toBe(DOCUMENTS_ID);
    expect(run("cd note.md", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
    expect(run("cd nope", HOME_ID).lines[0]).toMatchObject({ kind: "error" });
  });

  it("cat prints file contents and errors on folders/missing", () => {
    expect(text("cat note.md", DOCUMENTS_ID)).toBe("hi");
    expect(run("cat Reports", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
    expect(run("cat ghost", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
  });

  it("whoami and help produce output", () => {
    expect(text("whoami")).toBe("kagami");
    expect(run("help").lines[0].kind).toBe("output");
  });

  it("tree renders the hierarchy under the cwd", () => {
    const out = text("tree", DOCUMENTS_ID);
    expect(out).toContain("Reports/");
    expect(out).toContain("deep.txt");
    expect(out).toContain("note.md");
  });

  it("ls/cd error rather than throw when `cwd` itself doesn't exist in nodes (review-backlog #18)", () => {
    // `resolvePath` hands back `cwd` unchecked when there's no real path
    // segment to resolve (`ls`'s own bare-cwd case, `cd .`) — a
    // corrupted/vanished cwd shouldn't crash the engine.
    expect(() => run("ls", "ghost-cwd")).not.toThrow();
    expect(run("ls", "ghost-cwd").lines[0]).toMatchObject({ kind: "error" });
    expect(() => run("cd .", "ghost-cwd")).not.toThrow();
    expect(run("cd .", "ghost-cwd").lines[0]).toMatchObject({ kind: "error" });
  });
});

describe("mutating commands", () => {
  it("mkdir creates a directory (quoted names allowed)", () => {
    run("mkdir \"My Stuff\"", DOCUMENTS_ID);
    expect(nodesByName("My Stuff")?.type).toBe("folder");
  });

  it("mkdir errors on an existing name instead of duplicating", () => {
    expect(run("mkdir Reports", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
    expect(nodesByName("Reports 2")).toBeUndefined();
  });

  it("touch creates an empty file", () => {
    run("touch todo.txt", DOCUMENTS_ID);
    expect(nodesByName("todo.txt")).toMatchObject({ type: "file", content: "" });
  });

  it("touch on an existing file refreshes it instead of duplicating", () => {
    run("touch note.md", DOCUMENTS_ID);
    expect(nodesByName("note.md")?.content).toBe("hi");
    expect(nodesByName("note 2.md")).toBeUndefined();
  });

  it("echo prints, or writes with > redirect", () => {
    expect(text("echo hello world")).toBe("hello world");
    run("echo saved > out.txt", DOCUMENTS_ID);
    expect(nodesByName("out.txt")?.content).toBe("saved\n");
  });

  it("echo > overwrites an existing file instead of duplicating", () => {
    run("echo first > log.txt", DOCUMENTS_ID);
    run("echo second > log.txt", DOCUMENTS_ID);
    expect(nodesByName("log.txt")?.content).toBe("second\n");
    expect(nodesByName("log 2.txt")).toBeUndefined();
  });

  it("echo >> appends instead of overwriting", () => {
    run("echo first >> log.txt", DOCUMENTS_ID);
    run("echo second >> log.txt", DOCUMENTS_ID);
    expect(nodesByName("log.txt")?.content).toBe("first\nsecond\n");
  });

  // Technical debt register T5: a naive redirect scan can mistake a `>`
  // that's part of the quoted text for a real redirect.
  it("a quoted '>' is literal text, not a redirect (T5)", () => {
    expect(text("echo \"a > b\"")).toBe("a > b");
    expect(nodesByName("b")).toBeUndefined();

    expect(text("echo 'x >> y'")).toBe("x >> y");
    expect(nodesByName("y")).toBeUndefined();
  });

  it("a redirect target can itself be quoted", () => {
    run("echo hi > \"my file.txt\"", DOCUMENTS_ID);
    expect(nodesByName("my file.txt")?.content).toBe("hi\n");
  });

  it("mkdir/touch resolve path arguments against an existing parent", () => {
    run("mkdir Reports/Nested", DOCUMENTS_ID);
    expect(nodesByName("Nested")?.parentId).toBe("reports");

    run("touch Reports/leaf.txt", DOCUMENTS_ID);
    expect(nodesByName("leaf.txt")).toMatchObject({ type: "file", parentId: "reports" });
  });

  it("mkdir/touch error when the parent path doesn't exist", () => {
    expect(run("mkdir a/b", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
    expect(run("touch a/b.txt", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
    expect(nodesByName("a/b")).toBeUndefined();
  });

  it("echo > still rejects a redirect target containing '/'", () => {
    expect(run("echo x > a/b.txt", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
    expect(nodesByName("a/b")).toBeUndefined();
  });

  it("rm moves a file to the Trash", () => {
    const result = run("rm note.md", DOCUMENTS_ID);
    expect(result.lines[0].text).toContain("Trash");
    expect(useFsStore.getState().nodes.note.parentId).toBe(TRASH_ID);
  });

  it("rm refuses to remove a system folder", () => {
    expect(run("rm /Home/Documents", HOME_ID).lines[0]).toMatchObject({ kind: "error" });
    expect(useFsStore.getState().nodes[DOCUMENTS_ID].parentId).toBe(HOME_ID);
  });

  it("rm refuses the current directory and its ancestors", () => {
    expect(run("rm .", "reports").lines[0]).toMatchObject({ kind: "error" });
    expect(run("rm ..", "child").lines[0]).toMatchObject({ kind: "error" });
    expect(run("rm /Home/Documents/Reports", "child").lines[0]).toMatchObject({ kind: "error" });
    expect(useFsStore.getState().nodes.reports.parentId).toBe(DOCUMENTS_ID);
  });
});

function childNamed(parentId: string, name: string) {
  return Object.values(useFsStore.getState().nodes).find(n => n.parentId === parentId && n.name === name);
}

describe("cp / mv", () => {
  it("cp copies a file into an existing directory, leaving the original in place", () => {
    run("cp note.md Reports", DOCUMENTS_ID);
    expect(childNamed("reports", "note.md")).toMatchObject({ type: "file", content: "hi" });
    expect(childNamed(DOCUMENTS_ID, "note.md")).toBeDefined();
  });

  it("cp copies a file to a new name in the same directory", () => {
    run("cp note.md note-copy.md", DOCUMENTS_ID);
    expect(childNamed(DOCUMENTS_ID, "note-copy.md")).toMatchObject({ content: "hi" });
    expect(childNamed(DOCUMENTS_ID, "note.md")).toBeDefined();
  });

  it("cp refuses to overwrite an existing destination", () => {
    expect(run("cp note.md poem.txt", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
  });

  it("mv renames a file in place", () => {
    run("mv note.md renamed.md", DOCUMENTS_ID);
    expect(childNamed(DOCUMENTS_ID, "renamed.md")).toBeDefined();
    expect(childNamed(DOCUMENTS_ID, "note.md")).toBeUndefined();
  });

  it("mv moves a file into another directory", () => {
    run("mv note.md Reports", DOCUMENTS_ID);
    expect(childNamed("reports", "note.md")).toBeDefined();
    expect(childNamed(DOCUMENTS_ID, "note.md")).toBeUndefined();
  });

  it("mv refuses to move a folder into itself or its own subdirectory", () => {
    expect(run("mv Reports Reports/Child", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
  });

  it("mv refuses to move a system folder", () => {
    expect(run("mv /Home/Documents Elsewhere", HOME_ID).lines[0]).toMatchObject({ kind: "error" });
  });
});

describe("head / tail / grep", () => {
  it("head/tail print the first/last N lines, defaulting to 10", () => {
    expect(text("head -n 2 poem.txt", DOCUMENTS_ID)).toBe("roses\nviolets");
    expect(text("tail -n 1 poem.txt", DOCUMENTS_ID)).toBe("ROSES again");
  });

  it("grep filters lines by substring, case-insensitively with -i", () => {
    expect(text("grep roses poem.txt", DOCUMENTS_ID)).toBe("roses");
    expect(text("grep -i roses poem.txt", DOCUMENTS_ID)).toBe("roses\nROSES again");
  });

  it("head/tail/grep fall back to piped stdin when no file is given", () => {
    expect(text("cat poem.txt | head -n 1", DOCUMENTS_ID)).toBe("roses");
    expect(text("cat poem.txt | grep -i roses", DOCUMENTS_ID)).toBe("roses\nROSES again");
  });
});

describe("open", () => {
  it("opens a file via the host's openPath capability", () => {
    run("open note.md", DOCUMENTS_ID);
    expect(openedNodes).toMatchObject([{ name: "note.md" }]);
  });

  it("reports when nothing is associated with the file", () => {
    openPathResult = false;
    expect(run("open note.md", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
  });

  it("refuses to open a directory", () => {
    expect(run("open Reports", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
  });
});

describe("redirects and quoting (T5)", () => {
  it("doesn't mistake a '>' inside quotes for a redirect", () => {
    expect(text("echo \"a > b\"")).toBe("a > b");
    expect(nodesByName("b\"")).toBeUndefined();
  });

  it(">> appends any command's output, not just echo's", () => {
    run("pwd >> listing.txt", DOCUMENTS_ID);
    run("pwd >> listing.txt", DOCUMENTS_ID);
    expect(nodesByName("listing.txt")?.content).toBe("/Home/Documents\n/Home/Documents\n");
  });
});

describe("completeToken", () => {
  it("completes builtin command names for the first token", () => {
    expect(completeToken(useFsStore.getState().nodes, HOME_ID, ["mk"])).toEqual(["mkdir"]);
  });

  it("completes a path argument against the resolved directory's children", () => {
    expect(completeToken(useFsStore.getState().nodes, HOME_ID, ["cd", "doc"])).toEqual(["Documents/"]);
  });

  it("resolves a directory prefix before completing the leaf", () => {
    expect(completeToken(useFsStore.getState().nodes, HOME_ID, ["cat", "Documents/rep"])).toEqual(["Documents/Reports/"]);
  });

  it("returns nothing for an unresolvable parent path", () => {
    expect(completeToken(useFsStore.getState().nodes, HOME_ID, ["cd", "nope/x"])).toEqual([]);
  });
});

describe("resolveCompletion", () => {
  it("replaces the token when there's exactly one match", () => {
    expect(resolveCompletion(["mkdir"], "mk")).toEqual({ kind: "replace", text: "mkdir" });
  });

  it("extends to a shared prefix longer than what's already typed", () => {
    expect(resolveCompletion(["head", "help"], "h")).toEqual({ kind: "replace", text: "he" });
  });

  it("lists the candidates once the shared prefix stops making progress", () => {
    expect(resolveCompletion(["Documents/", "Downloads/"], "Do")).toEqual({
      kind: "list",
      matches: ["Documents/", "Downloads/"],
    });
  });

  it("returns null for no candidates", () => {
    expect(resolveCompletion([], "xyz")).toBeNull();
  });
});

describe("find", () => {
  it("lists everything under the cwd by default, including itself as '.'", () => {
    const lines = text("find", DOCUMENTS_ID).split("\n");
    expect(lines).toContain(".");
    expect(lines).toContain("./Reports");
    expect(lines).toContain("./Reports/Child");
    expect(lines).toContain("./Reports/deep.txt");
    expect(lines).toContain("./note.md");
  });

  it("takes an explicit path", () => {
    const lines = text("find Reports", DOCUMENTS_ID).split("\n");
    expect(lines).toEqual(["Reports", "Reports/Child", "Reports/deep.txt"]);
  });

  it("-name filters by a *?-glob, case-insensitively", () => {
    expect(text("find -name *.txt", DOCUMENTS_ID).split("\n").sort()).toEqual(
      ["./Reports/deep.txt", "./poem.txt"].sort(),
    );
    expect(text("find -name NOTE.MD", DOCUMENTS_ID)).toBe("./note.md");
    expect(text("find -name child", DOCUMENTS_ID)).toBe("./Reports/Child");
  });

  it("combines an explicit path with -name", () => {
    expect(text("find Reports -name *.txt", DOCUMENTS_ID)).toBe("Reports/deep.txt");
  });

  it("errors on a missing path or a dangling -name", () => {
    expect(run("find nope", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
    expect(run("find -name", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
  });
});

describe("alias", () => {
  it("reports no aliases defined initially", () => {
    expect(text("alias")).toBe("no aliases defined");
  });

  it("defines an alias with name=value syntax and lists it back sorted", () => {
    run("alias ll=ls");
    run("alias gohome=cd ~");
    expect(text("alias").split("\n")).toEqual([
      "alias gohome='cd ~'",
      "alias ll='ls'",
    ]);
  });

  it("defines an alias with space-separated syntax", () => {
    run("alias ll ls -a");
    expect(text("alias")).toBe("alias ll='ls -a'");
  });

  it("errors when given a name with no expansion", () => {
    expect(run("alias ll").lines[0]).toMatchObject({ kind: "error" });
  });

  it("expandAlias leaves an unknown command untouched", () => {
    expect(expandAlias("ls", ["Documents"], {})).toEqual({ command: "ls", args: ["Documents"] });
  });

  it("expandAlias splices the invocation's own args after the alias's", () => {
    expect(expandAlias("ll", ["Documents"], { ll: "ls -a" })).toEqual({
      command: "ls",
      args: ["-a", "Documents"],
    });
  });

  it("a defined alias actually runs the expanded command", () => {
    run("alias ll=ls");
    expect(text("ll Documents", HOME_ID)).toBe(text("ls Documents", HOME_ID));
  });
});

describe("text builtins", () => {
  it("wc counts lines, words and characters, and names the file", () => {
    expect(text("wc poem.txt", DOCUMENTS_ID)).toBe("4 7 37 poem.txt");
  });

  it("wc flags each print one count on their own", () => {
    expect(text("wc -l poem.txt", DOCUMENTS_ID)).toBe("4 poem.txt");
    expect(text("wc -w poem.txt", DOCUMENTS_ID)).toBe("7 poem.txt");
  });

  it("wc reads piped stdin when given no file", () => {
    expect(text("cat poem.txt | wc -l", DOCUMENTS_ID)).toBe("4");
  });

  it("wc rejects an unknown flag", () => {
    expect(run("wc -q poem.txt", DOCUMENTS_ID).lines[0].text).toContain("unknown option '-q'");
  });

  it("sort orders lines, and -r reverses them", () => {
    expect(text("sort poem.txt", DOCUMENTS_ID).split("\n")).toEqual(["roses", "ROSES again", "sky is blue", "violets"]);
    expect(text("sort -r poem.txt", DOCUMENTS_ID).split("\n").at(-1)).toBe("roses");
  });

  it("sort -n compares numerically rather than lexically", () => {
    run("echo 10 > nums.txt", DOCUMENTS_ID);
    expect(text("echo 9 >> nums.txt", DOCUMENTS_ID)).toBe("");
    expect(text("sort -n nums.txt", DOCUMENTS_ID).trim().split("\n")).toEqual(["9", "10"]);
  });

  it("combined short flags are read as separate flags", () => {
    run("echo 2 > n.txt", DOCUMENTS_ID);
    run("echo 1 >> n.txt", DOCUMENTS_ID);
    expect(text("sort -rn n.txt", DOCUMENTS_ID).trim().split("\n")).toEqual(["2", "1"]);
  });

  it("uniq collapses adjacent duplicates only", () => {
    run("echo a > dup.txt", DOCUMENTS_ID);
    run("echo a >> dup.txt", DOCUMENTS_ID);
    run("echo b >> dup.txt", DOCUMENTS_ID);
    run("echo a >> dup.txt", DOCUMENTS_ID);
    expect(text("uniq dup.txt", DOCUMENTS_ID).trim().split("\n")).toEqual(["a", "b", "a"]);
  });

  it("uniq -c prefixes each run with its count", () => {
    run("echo a > dup.txt", DOCUMENTS_ID);
    run("echo a >> dup.txt", DOCUMENTS_ID);
    expect(text("uniq -c dup.txt", DOCUMENTS_ID).trim().split("\n")[0]).toBe("2 a");
  });
});

describe("which / history / du / exit", () => {
  it("which names a builtin, an alias, and reports an unknown one", () => {
    run("alias ll=ls");
    expect(text("which ls")).toBe("ls: shell builtin");
    expect(text("which ll")).toBe("ll: aliased to ls");
    const missing = run("which frobnicate");
    expect(missing.lines[0]).toMatchObject({ kind: "error" });
    expect(statusOf(missing)).toBe(1);
  });

  it("history prints the context's entries, numbered", () => {
    const result = runCommand("history", { ...ctx(), history: ["ls", "pwd"] });
    expect(result.lines[0].text).toBe("1  ls\n2  pwd");
  });

  it("history -c clears through the context", () => {
    let cleared = false;
    runCommand("history -c", {
      ...ctx(),
      clearHistory: () => {
        cleared = true;
      },
    });
    expect(cleared).toBe(true);
  });

  it("du reports each directory below the target, children before parents", () => {
    const lines = text("du Documents", HOME_ID).split("\n");
    expect(lines.map(l => l.split("\t")[1])).toEqual([
      "Documents/Reports/Child",
      "Documents/Reports",
      "Documents",
    ]);
    // note.md ("hi") + poem.txt, and Reports' own bytes, all roll up.
    expect(Number(lines.at(-1)?.split("\t")[0])).toBeGreaterThan(0);
  });

  it("du -h prints human-readable sizes", () => {
    expect(text("du -h Documents", HOME_ID)).toMatch(/^\d+ bytes\t/);
  });

  it("du on a file reports just that file", () => {
    expect(text("du Documents/note.md", HOME_ID)).toBe("2\tDocuments/note.md");
  });

  it("exit asks the host to close, carrying its status", () => {
    expect(run("exit")).toMatchObject({ exit: true, code: 0 });
    expect(run("exit 3")).toMatchObject({ exit: true, code: 3 });
    expect(run("exit banana").lines[0]).toMatchObject({ kind: "error" });
  });

  it("nothing after exit on the same line runs", () => {
    expect(text("exit; echo never")).toBe("");
  });
});

describe("sequences and exit status", () => {
  it("splitSequence keeps a single pipe inside its segment", () => {
    expect(splitSequence("ls | grep a && pwd")).toEqual([
      { op: null, text: "ls | grep a" },
      { op: "&&", text: "pwd" },
    ]);
  });

  it("splitSequence ignores operators inside quotes", () => {
    expect(splitSequence("echo \"a && b\" ; pwd")).toEqual([
      { op: null, text: "echo \"a && b\"" },
      { op: ";", text: "pwd" },
    ]);
  });

  it("statusOf falls back to 1 for a result that printed an error", () => {
    expect(statusOf({ lines: [] })).toBe(0);
    expect(statusOf({ lines: [{ kind: "error", text: "boom" }] })).toBe(1);
    expect(statusOf({ lines: [{ kind: "error", text: "boom" }], code: 0 })).toBe(0);
  });

  it("; runs both sides regardless of status", () => {
    expect(text("nope; echo second")).toBe("nope: command not found (try 'help')\nsecond");
  });

  it("&& runs the right side only on success", () => {
    expect(text("echo one && echo two")).toBe("one\ntwo");
    expect(text("nope && echo two")).toBe("nope: command not found (try 'help')");
  });

  it("|| runs the right side only on failure", () => {
    expect(text("nope || echo rescued")).toBe("nope: command not found (try 'help')\nrescued");
    expect(text("echo one || echo two")).toBe("one");
  });

  it("a && b || c falls through to c when a fails", () => {
    expect(text("nope && echo b || echo c")).toContain("c");
    expect(text("echo a && echo b || echo c")).toBe("a\nb");
  });

  it("a later segment sees what an earlier one wrote", () => {
    const result = run("mkdir seq && cd seq", HOME_ID);
    expect(result.cwd).toBe(nodesByName("seq")?.id);
  });

  it("the last cd of a sequence wins", () => {
    expect(run("cd Documents; cd ..").cwd).toBeUndefined();
    expect(run("cd Documents; cd Reports").cwd).toBe("reports");
  });

  it("clear mid-sequence wipes what came before it, not after", () => {
    const result = run("echo gone; clear; echo kept");
    expect(result.clear).toBe(true);
    expect(result.lines.map(l => l.text)).toEqual(["kept"]);
  });

  it("$? expands to the previous command's status", () => {
    expect(text("echo hi; echo $?")).toBe("hi\n0");
    expect(text("nope; echo $?")).toBe("nope: command not found (try 'help')\n1");
  });

  it("$? carries the status of the previous line in from the context", () => {
    expect(runCommand("echo $?", { ...ctx(), lastStatus: 7 }).lines[0].text).toBe("7");
  });
});

describe("shell control", () => {
  it("clear requests a screen wipe", () => {
    expect(run("clear")).toMatchObject({ clear: true });
  });

  it("blank input is a no-op", () => {
    expect(run("   ").lines).toHaveLength(0);
  });

  it("unknown commands report not found", () => {
    expect(run("frobnicate").lines[0].text).toContain("command not found");
  });
});
