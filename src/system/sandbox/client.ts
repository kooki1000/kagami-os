import type { SandboxEvent, SandboxMethod, SandboxResponse } from "./types";

/**
 * Frame-side half of the sandbox postMessage bridge — for a sandboxed app's
 * own bundle to call into the shell (`bridge.ts`/`rpc.ts` are the shell side
 * that answers these calls). Authenticates by identity (only trusts
 * `window.parent`), not origin, since a sandboxed frame's own origin is
 * opaque.
 */
export interface SandboxClient {
  call: (method: SandboxMethod, params?: unknown) => Promise<SandboxResponse>;
  onAppCommand: (handler: (command: string) => void) => void;
}

export function createSandboxClient(idPrefix: string): SandboxClient {
  let nextRequestId = 0;
  const pending = new Map<string, (response: SandboxResponse) => void>();
  let appCommandHandler: ((command: string) => void) | undefined;

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent)
      return;
    const data = event.data as SandboxResponse | SandboxEvent | undefined;
    if (!data)
      return;
    if (data.kind === "kagami.sandbox.response") {
      const resolve = pending.get(data.id);
      if (resolve) {
        pending.delete(data.id);
        resolve(data);
      }
      return;
    }
    if (data.kind === "kagami.sandbox.event" && data.type === "appCommand")
      appCommandHandler?.(data.command);
  });

  return {
    call(method, params) {
      const id = `${idPrefix}-${++nextRequestId}`;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        window.parent.postMessage({ kind: "kagami.sandbox.request", id, method, params }, "*");
      });
    },
    onAppCommand(handler) {
      appCommandHandler = handler;
    },
  };
}
