import type { FsNode } from "@/system/fs/types";
import { formatBytes, formatModified } from "@/lib/format";
import { fileBytes } from "../files/fileMeta";

export interface ExifField {
  label: string;
  value: string;
}

/**
 * Best-effort "EXIF panel" data (U13): a pure function of a node and its
 * decoded natural size, not a real EXIF parser — camera/GPS metadata isn't
 * available without a parsing dependency, which the roadmap explicitly
 * says not to pull in for v1. `natural` is `null` until the `<img>` fires
 * `onLoad`, so "Dimensions" is simply omitted until then rather than
 * showing a placeholder.
 */
export function buildExifFields(
  node: FsNode | undefined,
  natural: { width: number; height: number } | null,
): ExifField[] {
  if (!node)
    return [];

  const fields: ExifField[] = [
    { label: "Name", value: node.name },
  ];
  if (natural)
    fields.push({ label: "Dimensions", value: `${natural.width} × ${natural.height}` });
  fields.push({ label: "Size", value: formatBytes(fileBytes(node)) });
  fields.push({ label: "Type", value: node.mimeType || "Unknown" });
  fields.push({ label: "Modified", value: formatModified(node.modifiedAt) });
  return fields;
}
