import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { useFsStore } from "@/system/fs/fsStore";

/**
 * Launch payload used when an app is asked to open a specific file. Kept in
 * its own leaf module (no dependency on `launch.ts`/`registry.ts`) so app
 * manifests can reference `serializeFilePayload`/`restoreFilePayload`
 * directly for session restore (C1) without a circular import through the
 * registry that assembles those manifests.
 */
export interface FilePayload {
  fileId: string;
}

export function payloadFileId(payload: unknown): string | null {
  if (
    payload
    && typeof payload === "object"
    && "fileId" in payload
    && typeof (payload as FilePayload).fileId === "string"
  ) {
    return (payload as FilePayload).fileId;
  }
  return null;
}

/**
 * A single-file app's selection, kept in sync with a re-launch: opening the
 * same app on a different file replaces the window's `payload` with a fresh
 * object, and this adopts it as the selection during render (compared by
 * identity, not fileId, so re-opening the same file after navigating
 * elsewhere still re-selects it) — otherwise the window would only ever
 * reflect whichever file it was *first* opened with (review-backlog #7).
 * Shared by Notes and Player, which both have this exact shape.
 */
export function usePayloadFileId(payload: unknown): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [activeId, setActiveId] = useState<string | null>(() => payloadFileId(payload));
  const [lastPayload, setLastPayload] = useState(payload);
  if (payload !== lastPayload) {
    setLastPayload(payload);
    const payloadId = payloadFileId(payload);
    if (payloadId)
      setActiveId(payloadId);
  }
  return [activeId, setActiveId];
}

/** `AppManifest.serializePayload` for apps whose payload is just a `FilePayload`. */
export function serializeFilePayload(payload: unknown): FilePayload | undefined {
  const fileId = payloadFileId(payload);
  return fileId ? { fileId } : undefined;
}

/**
 * `AppManifest.restorePayload` counterpart — drops the window's restore
 * entirely (rather than reopening it pointed at a dead id) if the file no
 * longer exists.
 */
export function restoreFilePayload(json: unknown): FilePayload | undefined {
  const fileId = payloadFileId(json);
  return fileId && useFsStore.getState().nodes[fileId] ? { fileId } : undefined;
}
