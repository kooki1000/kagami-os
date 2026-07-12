import type { DragEvent } from "react";

/** Custom drag payload carrying a virtual-file-system node id. */
export const NODE_MIME = "application/x-kagami-node";

export function startNodeDrag(e: DragEvent, nodeId: string): void {
  e.dataTransfer.setData(NODE_MIME, nodeId);
  e.dataTransfer.effectAllowed = "move";
}

export function hasNodeDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(NODE_MIME);
}

export function draggedNodeId(e: DragEvent): string | null {
  return e.dataTransfer.getData(NODE_MIME) || null;
}

/**
 * Is this a drag carrying real files from the host OS (upload, B2)? Checked
 * via `types`, which (unlike `getData`) is readable during `dragover` in
 * every browser. Internal node drags never set the `Files` type, so this
 * never collides with `hasNodeDrag`.
 */
export function hasExternalFiles(e: DragEvent): boolean {
  return e.dataTransfer.types.includes("Files");
}
