import type { Capability, SandboxErrorCode, SandboxFileDto, SandboxRequest, SandboxResponse } from "./types";
import type { NodeMap } from "@/system/fs/fsStore";
import type { BlobStore, FileSystemProvider, FsNode } from "@/system/fs/types";
import type { NotifyInput } from "@/system/notifications/notificationStore";
import { resolveFileBytes } from "@/apps/files/download";
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
  fileSystem: Pick<FileSystemProvider, "readFile">;
  blobStore: BlobStore;
  getNodes: () => NodeMap;
  notify: (input: NotifyInput) => string;
  setWindowTitle: (windowId: string, title: string) => void;
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
      case "notifications.notify":
        return buildSuccessResponse(request.id, await handleNotify(params, context.appId, deps));
      case "window.setTitle":
        return buildSuccessResponse(request.id, handleSetTitle(params, context.windowId, deps));
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
