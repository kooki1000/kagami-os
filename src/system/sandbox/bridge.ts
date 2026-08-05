import type { Capability, SandboxErrorCode, SandboxFileDto, SandboxRequest, SandboxResponse, SandboxWriteResultDto } from "./types";
import type { NodeMap } from "@/system/fs/fsStore";
import type { BlobStore, FileSystemProvider, FsNode } from "@/system/fs/types";
import type { NotifyInput } from "@/system/notifications/notificationStore";
import { resolveFileBytes } from "@/apps/files/download";
import { fileBytes } from "@/system/fs/fsStore";
import { isMethodAuthorized } from "./capabilities";
import { buildErrorResponse, buildSuccessResponse } from "./rpc";

/**
 * Which app/window a request came from, and what it's been granted —
 * the shell already knows this (it owns the manifest and the window),
 * the frame never gets a say in it.
 */
export interface SandboxContext {
  appId: string;
  windowId: string;
  capabilities: readonly Capability[];
}

/**
 * Real I/O the dispatcher needs, injected rather than imported as
 * singletons so `bridge.test.ts` can stub every side effect.
 */
export interface BridgeDeps {
  fileSystem: Pick<FileSystemProvider, "readFile" | "writeFile" | "delete">;
  blobStore: BlobStore;
  getNodes: () => NodeMap;
  notify: (input: NotifyInput) => string;
  setWindowTitle: (windowId: string, title: string) => void;
  /**
   * Hands the frame's reported view state to whatever is rendering its
   * chrome. Optional because most sandboxed apps draw their own UI entirely
   * inside the frame and never call `ui.setState`.
   */
  setAppState?: (windowId: string, state: Record<string, unknown>) => void;
}

export type CapabilityDeniedLogger = (info: { appId: string; windowId: string; method: string }) => void;

const defaultLogger: CapabilityDeniedLogger = ({ appId, windowId, method }) => {
  console.warn(`[sandbox] capability denied: app="${appId}" window="${windowId}" method="${method}"`);
};

/**
 * Thrown by a method handler to produce a specific `SandboxErrorCode`
 * instead of the catch-all "internal".
 */
class SandboxRequestError extends Error {
  code: SandboxErrorCode;
  constructor(code: SandboxErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

async function handleFsRead(params: Record<string, unknown>, deps: BridgeDeps): Promise<SandboxFileDto> {
  // isMethodAuthorized already required params.id to be a string granted
  // under some fs.read:<scope> capability before this handler ever runs.
  const id = params.id as string;

  let node: FsNode;
  try {
    node = await deps.fileSystem.readFile(id);
  }
  catch {
    throw new SandboxRequestError("not_found", `No readable file with id "${id}".`);
  }

  const bytes = await resolveFileBytes(node, deps.blobStore);
  const spansWholeBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  return {
    id: node.id,
    name: node.name,
    mimeType: node.mimeType,
    size: bytes.byteLength,
    // Only copy if the Uint8Array is a view over a larger underlying
    // buffer — resolveFileBytes's actual producers never are, but the DTO's
    // `size` must match `bytes` regardless of what future producers return.
    bytes: (spansWholeBuffer ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) as ArrayBuffer,
    // Untyped inline content (no mimeType) is the common case for
    // Notes/Terminal-authored files and is always text.
    isText: (node.mimeType ?? "text/plain").startsWith("text/"),
  };
}

async function handleFsWrite(params: Record<string, unknown>, deps: BridgeDeps): Promise<SandboxWriteResultDto> {
  // isMethodAuthorized already required params.parentId to be a string
  // granted under some fs.write:<scope> capability before this handler runs.
  const parentId = params.parentId as string;
  const name = params.name;
  const content = params.content;
  if (typeof name !== "string" || name.length === 0)
    throw new SandboxRequestError("invalid_request", "fs.write requires a non-empty string \"name\" param.");
  if (typeof content !== "string")
    throw new SandboxRequestError("invalid_request", "fs.write requires a string \"content\" param.");
  const mimeType = typeof params.mimeType === "string" ? params.mimeType : undefined;

  // writeFile has no folder-type check of its own — harmless for its
  // existing trusted first-party callers, but this is the first time it's
  // reachable from untrusted input, so it's tightened here rather than
  // inherited.
  if (deps.getNodes()[parentId]?.type !== "folder")
    throw new SandboxRequestError("not_found", `"${parentId}" is not a folder.`);

  let node: FsNode;
  try {
    node = await deps.fileSystem.writeFile(parentId, name, content, mimeType);
  }
  catch {
    throw new SandboxRequestError("not_found", `Cannot write into folder "${parentId}".`);
  }
  return { id: node.id, name: node.name, size: fileBytes(node), modifiedAt: node.modifiedAt };
}

async function handleFsDelete(params: Record<string, unknown>, deps: BridgeDeps): Promise<null> {
  // isMethodAuthorized already required params.id to be a string granted
  // under some fs.write:<scope> capability before this handler runs.
  const id = params.id as string;
  if (!deps.getNodes()[id])
    throw new SandboxRequestError("not_found", `No node with id "${id}".`);
  // Routes through the FileSystemProvider seam, never the raw
  // fsStore.deleteForever — provider.delete already branches trash-vs-permanent
  // (T6), so a sandboxed app's fs.delete can never bypass the Trash on a node
  // that isn't already in it.
  await deps.fileSystem.delete(id);
  return null;
}

async function handleNotify(params: Record<string, unknown>, appId: string, deps: BridgeDeps): Promise<null> {
  const title = params.title;
  if (typeof title !== "string")
    throw new SandboxRequestError("invalid_request", "notifications.notify requires a string \"title\" param.");
  const body = typeof params.body === "string" ? params.body : undefined;
  const tone = params.tone === "accent" || params.tone === "danger" ? params.tone : "default";
  // Deliberately no `action`: NotifyInput.action.run is a raw closure and
  // cannot cross a structured-clone postMessage boundary.
  deps.notify({ title, body, appId, tone });
  return null;
}

/**
 * The frame reporting its own view state outward. Deliberately unvalidated
 * beyond "is a plain object": the shell has no idea what any given app's view
 * state looks like, and shouldn't — the host component that asked for it is
 * what narrows the shape. Rejecting a non-object still matters, since the
 * consumer will spread it.
 */
function handleSetAppState(params: Record<string, unknown>, windowId: string, deps: BridgeDeps): null {
  const state = params.state;
  if (typeof state !== "object" || state === null || Array.isArray(state))
    throw new SandboxRequestError("invalid_request", "ui.setState requires an object \"state\" param.");
  deps.setAppState?.(windowId, state as Record<string, unknown>);
  return null;
}

function handleSetTitle(params: Record<string, unknown>, windowId: string, deps: BridgeDeps): null {
  const title = params.title;
  if (typeof title !== "string")
    throw new SandboxRequestError("invalid_request", "window.setTitle requires a string \"title\" param.");
  deps.setWindowTitle(windowId, title);
  return null;
}

/**
 * Authorizes and runs one request from a sandboxed frame. Capability
 * checks happen here, in the shell — never in the frame, which only ever
 * asks and is told yes or no. Never throws: every failure becomes an
 * error `SandboxResponse` so the transport layer can always post
 * something back.
 */
export async function dispatchSandboxRequest(
  request: SandboxRequest,
  context: SandboxContext,
  deps: BridgeDeps,
  logDenied: CapabilityDeniedLogger = defaultLogger,
): Promise<SandboxResponse> {
  const params = (request.params ?? {}) as Record<string, unknown>;

  if (!isMethodAuthorized(context.capabilities, request.method, params, deps.getNodes())) {
    logDenied({ appId: context.appId, windowId: context.windowId, method: request.method });
    return buildErrorResponse(request.id, {
      code: "capability_denied",
      message: `"${context.appId}" is not granted "${request.method}".`,
    });
  }

  try {
    switch (request.method) {
      case "fs.read":
        return buildSuccessResponse(request.id, await handleFsRead(params, deps));
      case "fs.write":
        return buildSuccessResponse(request.id, await handleFsWrite(params, deps));
      case "fs.delete":
        return buildSuccessResponse(request.id, await handleFsDelete(params, deps));
      case "notifications.notify":
        return buildSuccessResponse(request.id, await handleNotify(params, context.appId, deps));
      case "window.setTitle":
        return buildSuccessResponse(request.id, handleSetTitle(params, context.windowId, deps));
      case "ui.setState":
        return buildSuccessResponse(request.id, handleSetAppState(params, context.windowId, deps));
    }
  }
  catch (error) {
    if (error instanceof SandboxRequestError)
      return buildErrorResponse(request.id, { code: error.code, message: error.message });
    return buildErrorResponse(request.id, {
      code: "internal",
      message: error instanceof Error ? error.message : "Unknown error.",
    });
  }
}
