import type { SandboxError, SandboxEvent, SandboxRequest, SandboxResponse } from "./types";
import { SANDBOX_METHODS } from "./types";

/**
 * `event.data` from a sandboxed frame's `postMessage` is untrusted input —
 * it could be anything another script decided to send, or noise from a
 * browser extension. This is the one place that turns "unknown" into a
 * typed `SandboxRequest`, or refuses it. It must never throw: malformed
 * input is a normal, expected case, not an exceptional one.
 */
export function parseSandboxRequest(data: unknown): SandboxRequest | null {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return null;

  const candidate = data as Record<string, unknown>;
  if (candidate.kind !== "kagami.sandbox.request")
    return null;
  if (typeof candidate.id !== "string" || candidate.id.length === 0)
    return null;
  if (typeof candidate.method !== "string" || !(SANDBOX_METHODS as readonly string[]).includes(candidate.method))
    return null;

  return {
    kind: "kagami.sandbox.request",
    id: candidate.id,
    method: candidate.method as SandboxRequest["method"],
    params: candidate.params,
  };
}

export function buildSuccessResponse(id: string, data: unknown): SandboxResponse {
  return { kind: "kagami.sandbox.response", id, ok: true, data };
}

export function buildErrorResponse(id: string, error: SandboxError): SandboxResponse {
  return { kind: "kagami.sandbox.response", id, ok: false, error };
}

export function buildAppCommandEvent(command: string): SandboxEvent {
  return { kind: "kagami.sandbox.event", type: "appCommand", command };
}
