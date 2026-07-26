import type { NodeMap } from "@/system/fs/fsStore";
import { childrenOf, pathOf } from "@/system/fs/fsStore";
import { ROOT_ID } from "@/system/fs/types";

/**
 * U14 editable breadcrumb: render the path from the (synthetic) root down
 * to `id` as a plain "/"-joined string, e.g. "/Home/Documents/Reports" —
 * the same shape Terminal's own `pathString` builds, kept as a separate
 * small pure helper here rather than importing from `apps/terminal/shell`
 * (no existing precedent for Files depending on the Terminal module, and
 * this one's simpler: no relative-path/`..` support needed for a
 * breadcrumb, which only ever shows an absolute path).
 */
export function pathString(nodes: NodeMap, id: string): string {
  const names = pathOf(nodes, id).slice(1).map(n => n.name);
  return `/${names.join("/")}`;
}

/**
 * Resolve an absolute "/Home/Documents" path string (leading slash
 * optional) back to a folder id, matching case-insensitively segment by
 * segment. Returns `null` if any segment is missing or isn't a folder —
 * the breadcrumb editor's `RenameInput`-style `onCommit` treats `null` as
 * a rejected edit, same as an invalid rename.
 */
export function resolveFolderPath(nodes: NodeMap, path: string): string | null {
  const segments = path.trim().replace(/^\/+/, "").split("/").filter(Boolean);
  let current = ROOT_ID;
  for (const segment of segments) {
    const child = childrenOf(nodes, current).find(
      n => n.name.toLowerCase() === segment.toLowerCase(),
    );
    if (!child || child.type !== "folder")
      return null;
    current = child.id;
  }
  return current;
}
