import type { ShellContext } from "./shell";
import type { FsNode } from "@/system/fs/types";
import { beforeEach, describe, expect, it } from "vitest";
import { indexNodes, useFsStore } from "@/system/fs/fsStore";
import { DOCUMENTS_ID, HOME_ID, ROOT_ID, TRASH_ID } from "@/system/fs/types";
import { resolvePath, runCommand } from "./shell";

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
    ]),
    ready: true,
  });
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
    moveToTrash: s.moveToTrash,
    user: "kagami",
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
    expect(text("ls Documents", HOME_ID)).toBe("Reports/\nnote.md");
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

  it("rejects new names containing '/'", () => {
    expect(run("mkdir a/b", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
    expect(run("touch a/b.txt", DOCUMENTS_ID).lines[0]).toMatchObject({ kind: "error" });
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
