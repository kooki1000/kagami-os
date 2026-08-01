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
    },
    blobStore: {} as BlobStore,
    getNodes: () => nodes,
    notify: vi.fn((_input: NotifyInput) => "ntf-1"),
    setWindowTitle: vi.fn(),
    ...overrides,
  };
}

const context: SandboxContext = { appId: "sandbox-demo", windowId: "win-1", capabilities: ["fs.read:documents", "notifications"] };

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
