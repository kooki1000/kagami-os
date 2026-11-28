import type { NodeMap } from "@/system/fs/fsStore";
import type { BlobStore, FsNode } from "@/system/fs/types";
import type { BridgeDeps, SandboxContext } from "@/system/sandbox/bridge";
import { describe, expect, it, vi } from "vitest";
import { dispatchSandboxRequest } from "@/system/sandbox/bridge";
import { SANDBOX_METHODS } from "@/system/sandbox/types";
import scratchpadEntry from "../../../examples/scratchpad/entry.js?raw";
import clientSource from "../../../sdk/kagami-client.js?raw";

// `sdk/kagami-client.js` is what app authors copy. These tests run that exact
// file against the real bridge, so the published client can't drift from it.

function node(id: string, parentId: string, type: FsNode["type"], extra: Partial<FsNode> = {}): FsNode {
  return { id, parentId, name: id, type, createdAt: 0, modifiedAt: 0, ...extra };
}

const nodes: NodeMap = {
  documents: node("documents", "root", "folder"),
  note: node("note", "documents", "file", { content: "hello" }),
  data: node("data", "app", "folder"),
  secret: node("secret", "desktop", "file", { content: "no" }),
};

function makeDeps(): BridgeDeps {
  return {
    fileSystem: {
      readFile: async (id) => {
        if (nodes[id]?.type !== "file")
          throw new Error("not a file");
        return nodes[id];
      },
      writeFile: async (parentId, name, content) => node(`${parentId}/${name}`, parentId, "file", { name, content }),
      delete: async () => {},
    },
    blobStore: {} as BlobStore,
    getNodes: () => nodes,
    notify: () => "n1",
    setWindowTitle: vi.fn(),
    setMenus: vi.fn(),
    setBadge: vi.fn(),
    pickFile: async () => "note",
    grantFile: vi.fn(),
  };
}

/** Loads the client into a fake frame whose parent window is the real dispatcher. */
function loadClient(context: SandboxContext, deps = makeDeps()) {
  const listeners: Array<(event: unknown) => void> = [];
  const parent = {
    postMessage: (request: Parameters<typeof dispatchSandboxRequest>[0]) => {
      void dispatchSandboxRequest(request, context, deps, () => {}).then((response) => {
        for (const listener of listeners)
          listener({ source: parent, data: response });
      });
    },
  };
  const frame = { parent, addEventListener: (_type: string, listener: (event: unknown) => void) => listeners.push(listener) };
  // eslint-disable-next-line no-new-func -- runs the published client file itself
  const load = new Function("window", `${clientSource}\nreturn { kagami, KagamiError };`);
  const { kagami, KagamiError } = load(frame) as { kagami: Record<string, any>; KagamiError: new (...args: any[]) => Error & { code: string } };
  return { kagami, KagamiError, deps, listeners, parent };
}

const context: SandboxContext = { appId: "demo", windowId: "w1", capabilities: ["fs.read:documents"], dataFolderId: "data", fileId: "note" };

describe("sdk/kagami-client.js", () => {
  it("resolves a granted call with the method's data", async () => {
    const { kagami } = loadClient(context);
    expect(await kagami.fs.readText("note")).toBe("hello");
    expect(await kagami.fs.list("documents")).toMatchObject([{ id: "note", type: "file" }]);
    expect(await kagami.info()).toEqual({ appId: "demo", dataFolderId: "data", fileId: "note" });
  });

  it("rejects a refused call with a KagamiError carrying the code", async () => {
    const { kagami, KagamiError } = loadClient(context);
    const error = await kagami.fs.read("secret").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KagamiError);
    expect(error.code).toBe("capability_denied");
  });

  it("covers chrome calls and the picker", async () => {
    const { kagami, deps } = loadClient(context);
    await kagami.setTitle("Hi");
    await kagami.setBadge(2);
    await kagami.setMenus([{ title: "T", items: [{ label: "L", appCommand: "c" }] }]);
    expect(await kagami.fs.pick(["text/*"])).toMatchObject({ id: "note" });
    expect(deps.setWindowTitle).toHaveBeenCalledWith("w1", "Hi");
    expect(deps.setBadge).toHaveBeenCalledWith("demo", "2");
    expect(deps.setMenus).toHaveBeenCalled();
    expect(deps.grantFile).toHaveBeenCalledWith("w1", "note");
  });

  it("delivers menu commands to every handler, and ignores messages not from its parent", () => {
    const { kagami, listeners, parent } = loadClient(context);
    const first = vi.fn();
    const second = vi.fn();
    kagami.onCommand(first);
    kagami.onCommand(second);
    const event = { kind: "kagami.sandbox.event", type: "appCommand", command: "draft.clear" };
    for (const listener of listeners) {
      listener({ source: {}, data: event });
      listener({ source: parent, data: event });
    }
    expect(first).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledWith("draft.clear");
    expect(second).toHaveBeenCalledOnce();
  });

  it("uses only methods the bridge has, and covers all of them but ui.setState", () => {
    const used = [...clientSource.matchAll(/call\("([a-z]+\.[a-zA-Z]+)"/g)].map(match => match[1]);
    for (const method of used)
      expect(SANDBOX_METHODS as readonly string[], method).toContain(method);
    const missing = SANDBOX_METHODS.filter(method => !used.includes(method));
    expect(missing).toEqual(["ui.setState"]);
  });
});

describe("examples/scratchpad", () => {
  it("opens with the client file, unchanged", () => {
    expect(scratchpadEntry.startsWith(clientSource)).toBe(true);
  });
});
