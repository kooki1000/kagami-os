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

  it("maps a nonexistent id to not_found via the getNodes() pre-check, rather than a silent fake success", async () => {
    const deps = makeDeps();
    // Granted by exact scope match on an id that names no real node — the
    // capability check alone can't rule this out (it doesn't require the
    // scope to resolve to an existing node), so the handler must.
    const ghostContext: SandboxContext = { ...context, capabilities: ["fs.write:ghostId"] };
    const response = await dispatchSandboxRequest(request("fs.delete", { id: "ghostId" }), ghostContext, deps);
    expect(response.ok).toBe(false);
    if (response.ok)
      throw new Error("expected not_found response");
    expect(response.error.code).toBe("not_found");
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
