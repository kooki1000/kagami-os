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
