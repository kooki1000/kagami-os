/**
 * Step 16a — the capability sandbox. Shared types for the RPC envelope,
 * capability strings, and the DTOs that cross the postMessage boundary.
 *
 * Nothing here may import from React, Zustand stores, or the DOM — this
 * module (and `capabilities.ts`/`rpc.ts` beside it) stays pure so it's
 * unit-testable in Vitest's `node` environment and safe to reason about
 * as "what a sandboxed frame can and cannot do," independent of wiring.
 */

/**
 * A capability string, e.g. `"notifications"` or `"fs.read:<fsNodeId>"`.
 * Declared on `AppManifest.sandboxed.capabilities` and auto-granted at
 * registration for first-party apps — there is no consent UI in 16a, only
 * for third-party bundles later (step 17).
 */
export type Capability = string;

/**
 * The narrow shape a file read exposes across the bridge — never the raw
 * `FsNode` (no `contentRef.hash`, `trashedFrom`, `label`, or any other
 * internal field).
 */
export interface SandboxFileDto {
  id: string;
  name: string;
  mimeType: string | undefined;
  size: number;
  /**
   * Raw bytes, sent as a Transferable ArrayBuffer — never a `blob:` URL,
   * which an opaque-origin iframe cannot dereference across the parent's
   * origin/partition boundary.
   */
  bytes: ArrayBuffer;
  isText: boolean;
}

/**
 * Methods the bridge dispatches. Kept as a closed union so an unknown
 * `method` is a request-time validation failure, not a runtime surprise.
 */
export type SandboxMethod = "fs.read" | "notifications.notify" | "window.setTitle";

/**
 * Every valid `SandboxMethod`, for request-time validation against the
 * closed union (`rpc.ts` has no other way to check membership at runtime).
 */
export const SANDBOX_METHODS: readonly SandboxMethod[] = ["fs.read", "notifications.notify", "window.setTitle"];

export interface FsReadParams {
  id: string;
}

export interface NotificationsNotifyParams {
  title: string;
  body?: string;
  tone?: "default" | "accent" | "danger";
}

export interface WindowSetTitleParams {
  title: string;
}

export type SandboxErrorCode = "capability_denied" | "invalid_request" | "not_found" | "internal";

export interface SandboxError {
  code: SandboxErrorCode;
  message: string;
}

/** Request, frame → shell. */
export interface SandboxRequest {
  kind: "kagami.sandbox.request";
  id: string;
  method: SandboxMethod;
  params?: unknown;
}

/** Response, shell → frame. */
export type SandboxResponse
  = | { kind: "kagami.sandbox.response"; id: string; ok: true; data: unknown }
    | { kind: "kagami.sandbox.response"; id: string; ok: false; error: SandboxError };

/** Push, shell → frame, no reply expected. */
export interface SandboxEvent {
  kind: "kagami.sandbox.event";
  type: "appCommand";
  command: string;
}

export type SandboxMessage = SandboxRequest | SandboxResponse | SandboxEvent;
