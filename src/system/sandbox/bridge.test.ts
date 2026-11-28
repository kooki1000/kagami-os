import type { BridgeDeps, SandboxContext } from "./bridge";
import type { SandboxRequest } from "./types";
import type { NodeMap } from "@/system/fs/fsStore";
import type { BlobStore, FsNode } from "@/system/fs/types";
import type { NotifyInput } from "@/system/notifications/notificationStore";
import { describe, expect, it, vi } from "vitest";
import { dispatchSandboxRequest } from "./bridge";

function fileNode(overrides: Partial<FsNode> = {}): FsNode {
  return {
    id: "reportDoc",
    parentId: "documents",
    name: "report.txt",
    type: "file",
    content: "hello world",
    createdAt: 0,
    modifiedAt: 0,
    ...overrides,
  };
}

const nodes: NodeMap = {
  documents: { id: "documents", parentId: "root", name: "documents", type: "folder", createdAt: 0, modifiedAt: 0 },
  reportDoc: fileNode(),
  desktopFile: fileNode({ id: "desktopFile", parentId: "desktop", name: "secret.txt" }),
};

function makeDeps(overrides: Partial<BridgeDeps> = {}): BridgeDeps {
  return {
    fileSystem: {
      readFile: vi.fn(async (id: string) => {
        const node = nodes[id];
        if (!node || node.type !== "file")
          throw new Error(`Not a file: ${id}`);
        return node;
      }),
      writeFile: vi.fn(async (parentId: string, name: string, content: string, mimeType?: string) =>
        fileNode({ id: `${parentId}/${name}`, parentId, name, content, mimeType, modifiedAt: 1 })),
      delete: vi.fn(async () => {}),
    },
    blobStore: {} as BlobStore,
    getNodes: () => nodes,
    notify: vi.fn((_input: NotifyInput) => "ntf-1"),
    setWindowTitle: vi.fn(),
    setMenus: vi.fn(),
    setBadge: vi.fn(),
    pickFile: vi.fn(async () => null),
    grantFile: vi.fn(),
    ...overrides,
  };
}

const context: SandboxContext = { appId: "sandbox-demo", windowId: "win-1", capabilities: ["fs.read:documents", "fs.write:documents", "notifications"] };

function request(method: SandboxRequest["method"], params?: unknown): SandboxRequest {
  return { kind: "kagami.sandbox.request", id: "req-1", method, params };
}

describe("dispatchSandboxRequest — fs.read", () => {
  it("returns a narrow DTO for a granted, in-scope read, with none of the internal FsNode fields", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("fs.read", { id: "reportDoc" }), context, deps);

    expect(response.ok).toBe(true);
    if (!response.ok)
      throw new Error("expected ok response");
    const dto = response.data as Record<string, unknown>;
    expect(dto).toMatchObject({ id: "reportDoc", name: "report.txt", size: 11, isText: true });
    expect(dto).not.toHaveProperty("contentRef");
    expect(dto).not.toHaveProperty("trashedFrom");
    expect(dto).not.toHaveProperty("label");
    expect(dto).not.toHaveProperty("parentId");
    expect(dto.bytes).toBeInstanceOf(ArrayBuffer);
  });

  it("refuses and logs a read outside the granted scope", async () => {
    const deps = makeDeps();
    const logDenied = vi.fn();
    const response = await dispatchSandboxRequest(request("fs.read", { id: "desktopFile" }), context, deps, logDenied);

    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected denied response");
    expect(response.error.code).toBe("capability_denied");
    expect(logDenied).toHaveBeenCalledWith({ appId: "sandbox-demo", windowId: "win-1", method: "fs.read" });
    expect(deps.fileSystem.readFile).not.toHaveBeenCalled();
  });

  it("refuses a read when the app has no fs.read capability at all", async () => {
    const deps = makeDeps();
    const noCapContext: SandboxContext = { ...context, capabilities: [] };
    const response = await dispatchSandboxRequest(request("fs.read", { id: "reportDoc" }), noCapContext, deps);
    expect(response.ok).toBe(false);
  });

  it("maps a missing/unreadable file to not_found rather than internal", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("fs.read", { id: "documents" }), context, deps);
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected not_found response");
    expect(response.error.code).toBe("not_found");
  });
});

describe("dispatchSandboxRequest — fs.write", () => {
  it("creates a new file under a granted-scope folder, returning a narrow DTO", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(
      request("fs.write", { parentId: "documents", name: "new.txt", content: "hi" }),
      context,
      deps,
    );
    expect(response.ok).toBe(true);
    if (!response.ok)
      throw new Error("expected ok response");
    expect(deps.fileSystem.writeFile).toHaveBeenCalledWith("documents", "new.txt", "hi", undefined);
    expect(response.data).toMatchObject({ name: "new.txt", size: 2, modifiedAt: 1 });
    expect(response.data).not.toHaveProperty("content");
  });

  it("refuses and does not call writeFile when the destination is outside the granted scope", async () => {
    const deps = makeDeps();
    const logDenied = vi.fn();
    const response = await dispatchSandboxRequest(
      request("fs.write", { parentId: "desktop", name: "new.txt", content: "hi" }),
      context,
      deps,
      logDenied,
    );
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected denied response");
    expect(response.error.code).toBe("capability_denied");
    expect(deps.fileSystem.writeFile).not.toHaveBeenCalled();
  });

  it("refuses when the app has no fs.write capability at all", async () => {
    const deps = makeDeps();
    const readOnlyContext: SandboxContext = { ...context, capabilities: ["fs.read:documents"] };
    const response = await dispatchSandboxRequest(
      request("fs.write", { parentId: "documents", name: "new.txt", content: "hi" }),
      readOnlyContext,
      deps,
    );
    expect(response.ok).toBe(false);
    expect(deps.fileSystem.writeFile).not.toHaveBeenCalled();
  });

  it("rejects a missing name as invalid_request", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("fs.write", { parentId: "documents", content: "hi" }), context, deps);
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected invalid_request response");
    expect(response.error.code).toBe("invalid_request");
  });

  it("rejects non-string content as invalid_request", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("fs.write", { parentId: "documents", name: "new.txt", content: 42 }), context, deps);
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected invalid_request response");
    expect(response.error.code).toBe("invalid_request");
  });

  it("maps a non-folder parentId to not_found without calling writeFile", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(
      request("fs.write", { parentId: "reportDoc", name: "new.txt", content: "hi" }),
      context,
      deps,
    );
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected not_found response");
    expect(response.error.code).toBe("not_found");
    expect(deps.fileSystem.writeFile).not.toHaveBeenCalled();
  });

  it("maps a writeFile rejection to not_found rather than internal", async () => {
    const deps = makeDeps({
      fileSystem: {
        readFile: vi.fn(),
        writeFile: vi.fn(async () => {
          throw new Error("disk full");
        }),
        delete: vi.fn(),
      },
    });
    const response = await dispatchSandboxRequest(
      request("fs.write", { parentId: "documents", name: "new.txt", content: "hi" }),
      context,
      deps,
    );
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected not_found response");
    expect(response.error.code).toBe("not_found");
  });
});

describe("dispatchSandboxRequest — fs.delete", () => {
  it("routes an authorized delete through fileSystem.delete, never a raw deleteForever", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("fs.delete", { id: "reportDoc" }), context, deps);
    expect(response.ok).toBe(true);
    expect(deps.fileSystem.delete).toHaveBeenCalledWith("reportDoc");
  });

  it("refuses and does not call delete when the target is outside the granted scope", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("fs.delete", { id: "desktopFile" }), context, deps);
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected denied response");
    expect(response.error.code).toBe("capability_denied");
    expect(deps.fileSystem.delete).not.toHaveBeenCalled();
  });

  it("refuses when the app has no fs.write capability at all", async () => {
    const deps = makeDeps();
    const readOnlyContext: SandboxContext = { ...context, capabilities: ["fs.read:documents"] };
    const response = await dispatchSandboxRequest(request("fs.delete", { id: "reportDoc" }), readOnlyContext, deps);
    expect(response.ok).toBe(false);
    expect(deps.fileSystem.delete).not.toHaveBeenCalled();
  });

  it("refuses a nonexistent id, even one named as the scope itself", async () => {
    const deps = makeDeps();
    // A delete is only authorized for a node that sits *under* the granted
    // folder, which an id naming no node can never do.
    const ghostContext: SandboxContext = { ...context, capabilities: ["fs.write:ghostId"] };
    const response = await dispatchSandboxRequest(request("fs.delete", { id: "ghostId" }), ghostContext, deps, vi.fn());
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected denied response");
    expect(response.error.code).toBe("capability_denied");
    expect(deps.fileSystem.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete the granted folder itself", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("fs.delete", { id: "documents" }), context, deps, vi.fn());
    expect(response.ok).toBe(false);
    expect(deps.fileSystem.delete).not.toHaveBeenCalled();
  });
});

describe("dispatchSandboxRequest — notifications.notify", () => {
  it("forwards an allowed notification, never an action field", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(
      request("notifications.notify", { title: "Done", body: "Export finished", tone: "accent" }),
      context,
      deps,
    );
    expect(response.ok).toBe(true);
    expect(deps.notify).toHaveBeenCalledWith({ title: "Done", body: "Export finished", appId: "sandbox-demo", tone: "accent" });
    expect((deps.notify as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty("action");
  });

  it("refuses a notification when ungranted", async () => {
    const deps = makeDeps();
    const noCapContext: SandboxContext = { ...context, capabilities: [] };
    const response = await dispatchSandboxRequest(request("notifications.notify", { title: "Done" }), noCapContext, deps);
    expect(response.ok).toBe(false);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("rejects a malformed notify call (missing title) as invalid_request", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("notifications.notify", {}), context, deps);
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected invalid_request response");
    expect(response.error.code).toBe("invalid_request");
  });
});

describe("dispatchSandboxRequest — window.setTitle", () => {
  it("is always authorized, regardless of granted capabilities", async () => {
    const deps = makeDeps();
    const noCapContext: SandboxContext = { ...context, capabilities: [] };
    const response = await dispatchSandboxRequest(request("window.setTitle", { title: "My Note" }), noCapContext, deps);
    expect(response.ok).toBe(true);
    expect(deps.setWindowTitle).toHaveBeenCalledWith("win-1", "My Note");
  });

  it("rejects a malformed setTitle call (missing title) as invalid_request", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("window.setTitle", {}), context, deps);
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected invalid_request response");
    expect(response.error.code).toBe("invalid_request");
  });
});

describe("ui.setState", () => {
  it("forwards a plain-object state to the host and needs no capability", async () => {
    const seen: Array<[string, Record<string, unknown>]> = [];
    const response = await dispatchSandboxRequest(
      { kind: "kagami.sandbox.request", id: "r1", method: "ui.setState", params: { state: { page: 3 } } },
      // Deliberately no capabilities: chrome for one's own window is free,
      // exactly like window.setTitle.
      { appId: "documents", windowId: "w1", capabilities: [] },
      makeDeps({ setAppState: (id, state) => seen.push([id, state]) }),
    );
    expect(response.ok).toBe(true);
    expect(seen).toEqual([["w1", { page: 3 }]]);
  });

  it("rejects a non-object state rather than passing it on", async () => {
    for (const state of ["nope", 42, null, ["a"]]) {
      const response = await dispatchSandboxRequest(
        { kind: "kagami.sandbox.request", id: "r2", method: "ui.setState", params: { state } },
        { appId: "documents", windowId: "w1", capabilities: [] },
        makeDeps(),
      );
      expect(response.ok).toBe(false);
      if (!response.ok)
        expect(response.error.code).toBe("invalid_request");
    }
  });

  it("succeeds as a no-op when the host isn't listening", async () => {
    const response = await dispatchSandboxRequest(
      { kind: "kagami.sandbox.request", id: "r3", method: "ui.setState", params: { state: {} } },
      { appId: "sandboxDemo", windowId: "w1", capabilities: [] },
      makeDeps(),
    );
    expect(response.ok).toBe(true);
  });
});

describe("dispatchSandboxRequest — fs.list", () => {
  it("lists a granted folder as narrow entries, with no internal FsNode fields", async () => {
    const response = await dispatchSandboxRequest(request("fs.list", { id: "documents" }), context, makeDeps());

    expect(response.ok).toBe(true);
    if (!response.ok)
      throw new Error("expected ok response");
    expect(response.data).toEqual([
      { id: "reportDoc", name: "report.txt", type: "file", mimeType: undefined, size: 11, modifiedAt: 0 },
    ]);
  });

  it("refuses a folder outside the granted scope", async () => {
    const response = await dispatchSandboxRequest(request("fs.list", { id: "desktop" }), context, makeDeps(), vi.fn());
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected denied response");
    expect(response.error.code).toBe("capability_denied");
  });

  it("reports not_found for a granted id that is a file", async () => {
    const response = await dispatchSandboxRequest(request("fs.list", { id: "reportDoc" }), context, makeDeps());
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected error response");
    expect(response.error.code).toBe("not_found");
  });
});

describe("dispatchSandboxRequest — app.info", () => {
  it("reports the shell's own record of the window, whatever the frame sends", async () => {
    const ctx: SandboxContext = { ...context, appId: "cool-app", dataFolderId: "appData", fileId: "reportDoc" };
    const response = await dispatchSandboxRequest(request("app.info", { dataFolderId: "forged" }), ctx, makeDeps());
    expect(response).toMatchObject({ ok: true, data: { appId: "cool-app", dataFolderId: "appData", fileId: "reportDoc" } });
  });

  it("reports null for an app with no data folder and no file", async () => {
    const response = await dispatchSandboxRequest(request("app.info"), context, makeDeps());
    expect(response).toMatchObject({ ok: true, data: { dataFolderId: null, fileId: null } });
  });
});

describe("dispatchSandboxRequest — menus.set", () => {
  const sections = [{ title: "Note", items: [{ label: "New", appCommand: "note.new", shortcut: "⌘N" }] }];

  it("hands validated menus to the shell for the caller's own window", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("menus.set", { sections }), context, deps);
    expect(response.ok).toBe(true);
    expect(deps.setMenus).toHaveBeenCalledWith("win-1", sections);
  });

  it("rejects an item that names a shell command, and never calls the shell", async () => {
    const deps = makeDeps();
    const bad = [{ title: "A", items: [{ label: "Quit", appCommand: "q", command: "app.quit" }] }];
    const response = await dispatchSandboxRequest(request("menus.set", { sections: bad }), context, deps);
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected error response");
    expect(response.error.code).toBe("invalid_request");
    expect(deps.setMenus).not.toHaveBeenCalled();
  });

  it("rejects a shortcut the shell reserves", async () => {
    const deps = makeDeps();
    const bad = [{ title: "A", items: [{ label: "Close", appCommand: "c", shortcut: "⌘W" }] }];
    const response = await dispatchSandboxRequest(request("menus.set", { sections: bad }), context, deps);
    expect(response.ok).toBe(false);
    expect(deps.setMenus).not.toHaveBeenCalled();
  });
});

describe("dispatchSandboxRequest — dock.setBadge", () => {
  it("sets the badge for the caller's own app, never one the frame names", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("dock.setBadge", { badge: 3, appId: "notes" }), context, deps);
    expect(response.ok).toBe(true);
    expect(deps.setBadge).toHaveBeenCalledWith("sandbox-demo", "3");
  });

  it("clears on null", async () => {
    const deps = makeDeps();
    await dispatchSandboxRequest(request("dock.setBadge", { badge: null }), context, deps);
    expect(deps.setBadge).toHaveBeenCalledWith("sandbox-demo", null);
  });

  it("rejects a badge too long to be one", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("dock.setBadge", { badge: "Your disk is full, click here" }), context, deps);
    expect(response.ok).toBe(false);
    expect(deps.setBadge).not.toHaveBeenCalled();
  });
});

describe("dispatchSandboxRequest — fs.pick", () => {
  const noFsContext: SandboxContext = { appId: "viewer-app", windowId: "win-2", capabilities: [] };

  it("grants the window the one file the user chose, and reports it as a narrow entry", async () => {
    const deps = makeDeps({ pickFile: vi.fn(async () => "reportDoc") });
    const response = await dispatchSandboxRequest(request("fs.pick", { accept: ["text/*"] }), noFsContext, deps);

    expect(deps.pickFile).toHaveBeenCalledWith("viewer-app", ["text/*"]);
    expect(deps.grantFile).toHaveBeenCalledWith("win-2", "reportDoc");
    expect(response).toMatchObject({ ok: true, data: { id: "reportDoc", name: "report.txt", type: "file", size: 11 } });
  });

  it("grants nothing and answers null when the user cancels", async () => {
    const deps = makeDeps();
    const response = await dispatchSandboxRequest(request("fs.pick"), noFsContext, deps);
    expect(response).toMatchObject({ ok: true, data: null });
    expect(deps.grantFile).not.toHaveBeenCalled();
  });

  it("grants nothing for a node that isn't a file, whatever the picker returned", async () => {
    const deps = makeDeps({ pickFile: vi.fn(async () => "documents") });
    const response = await dispatchSandboxRequest(request("fs.pick"), noFsContext, deps);
    expect(response).toMatchObject({ ok: true, data: null });
    expect(deps.grantFile).not.toHaveBeenCalled();
  });

  it("rejects a malformed accept list before opening anything", async () => {
    const deps = makeDeps();
    for (const accept of ["text/*", ["not a type"], [1], Array.from({ length: 33 }).fill("text/plain")]) {
      const response = await dispatchSandboxRequest(request("fs.pick", { accept }), noFsContext, deps);
      expect(response.ok).toBe(false);
    }
    expect(deps.pickFile).not.toHaveBeenCalled();
  });

  it("picking one file doesn't widen what the window can do to anything else", async () => {
    // What the host would build after the grant: only fs.read on that node.
    const afterPick: SandboxContext = { ...noFsContext, capabilities: ["fs.read:reportDoc"] };
    const deps = makeDeps();
    const own = await dispatchSandboxRequest(request("fs.read", { id: "reportDoc" }), afterPick, deps);
    expect(own.ok).toBe(true);
    for (const [method, params] of [
      ["fs.read", { id: "desktopFile" }],
      ["fs.list", { id: "documents" }],
      ["fs.write", { parentId: "documents", name: "x.txt", content: "x" }],
      ["fs.delete", { id: "reportDoc" }],
    ] as const) {
      const response = await dispatchSandboxRequest(request(method, params), afterPick, deps, vi.fn());
      expect(response.ok, method).toBe(false);
    }
    expect(deps.fileSystem.writeFile).not.toHaveBeenCalled();
    expect(deps.fileSystem.delete).not.toHaveBeenCalled();
  });
});
