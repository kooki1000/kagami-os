import type { DragEvent } from "react";

/** Custom drag payload carrying virtual-file-system node ids (B4: possibly a whole multi-selection). */
export const NODE_MIME = "application/x-kagami-node";

export function startNodeDrag(e: DragEvent, nodeIds: string[]): void {
  e.dataTransfer.setData(NODE_MIME, JSON.stringify(nodeIds));
  e.dataTransfer.effectAllowed = "move";
}

export function hasNodeDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(NODE_MIME);
}

export function draggedNodeIds(e: DragEvent): string[] {
  const raw = e.dataTransfer.getData(NODE_MIME);
  if (!raw)
    return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
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
