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
 * The narrow ack an `fs.write` call gets back — never the raw `FsNode`,
 * same reasoning as `SandboxFileDto`. `fs.delete` acks with `null` instead;
 * there's nothing to report besides success.
 */
export interface SandboxWriteResultDto {
  id: string;
  name: string;
  size: number;
  modifiedAt: number;
}

/**
 * Methods the bridge dispatches. Kept as a closed union so an unknown
 * `method` is a request-time validation failure, not a runtime surprise.
 *
 * `ui.setState` is the frame reporting its own view state outward (which
 * page, what zoom, is it still loading) so the *host* can render the app's
 * chrome in React, with the shell's design tokens, instead of the frame
 * hand-rolling a toolbar in raw CSS it can never theme — a `srcdoc`
 * document doesn't inherit custom properties. The payload is opaque here on
 * purpose: the protocol has no idea what a PDF page is, and shouldn't.
 */
export type SandboxMethod = "fs.read" | "fs.write" | "fs.delete" | "notifications.notify" | "window.setTitle" | "ui.setState";

/**
 * Every valid `SandboxMethod`, for request-time validation against the
 * closed union (`rpc.ts` has no other way to check membership at runtime).
 */
export const SANDBOX_METHODS: readonly SandboxMethod[] = ["fs.read", "fs.write", "fs.delete", "notifications.notify", "window.setTitle", "ui.setState"];

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

/**
 * Push, shell → frame, no reply expected.
 *
 * `theme` hands the frame a slice of the shell's resolved design tokens. A
 * `srcdoc` document inherits no CSS custom properties from its embedder and an
 * opaque-origin iframe cannot be made transparent (its canvas is painted
 * opaque regardless of the embedded document's own background), so a frame
 * that renders any surface at all has no way to follow the user's theme
 * without being told. Sending values rather than letting the frame ask keeps
 * the shell in control of what it exposes.
 */
export type SandboxEvent
  = | { kind: "kagami.sandbox.event"; type: "appCommand"; command: string }
    | { kind: "kagami.sandbox.event"; type: "theme"; vars: Record<string, string> };
