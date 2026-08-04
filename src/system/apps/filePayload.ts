import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { useFsStore } from "@/system/fs/fsStore";
import { useWindowStore } from "@/system/windows/windowStore";

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

/**
 * Narrow a launch payload down to one string field, e.g. `{ fileId }` or
 * `{ folderId }` — the shape every app's ad hoc payload object turns out to
 * have. Shared so each call site (`payloadFileId` here, Files' own
 * `payloadFolderId`) doesn't hand-roll the same `typeof`/`in` guard.
 */
export function payloadStringField(payload: unknown, key: string): string | null {
  if (
    payload
    && typeof payload === "object"
    && key in payload
    && typeof (payload as Record<string, unknown>)[key] === "string"
  ) {
    return (payload as Record<string, string>)[key];
  }
  return null;
}

export function payloadFileId(payload: unknown): string | null {
  return payloadStringField(payload, "fileId");
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

/**
 * Keeps a single-file app's window title in step with its open file — on
 * mount, and whenever the file is renamed elsewhere (Files, Terminal) or
 * Next/Previous switches to a different one. Shared by Player and Viewer,
 * which both title their window after the currently open file this way.
 */
export function useSyncWindowTitle(windowId: string, name: string | undefined): void {
  const setWindowTitle = useWindowStore(s => s.setWindowTitle);
  useEffect(() => {
    if (name)
      setWindowTitle(windowId, name);
  }, [name, windowId, setWindowTitle]);
}
