import type { Capability, SandboxMethod } from "./types";
import type { NodeMap } from "@/system/fs/fsStore";
import { isDescendantOf } from "@/system/fs/fsStore";

interface ParsedCapability {
  verb: string;
  scope?: string;
}

/**
 * Splits a capability string on its first `:`. Anything that isn't
 * `<verb>` or `<verb>:<scope>` (empty string, a bare trailing colon) is
 * treated as unparseable and never matches anything — malformed input
 * fails closed, not open.
 */
function parseCapability(capability: Capability): ParsedCapability | null {
  const colonIndex = capability.indexOf(":");
  if (colonIndex === -1) {
    return capability.length > 0 ? { verb: capability } : null;
  }
  const verb = capability.slice(0, colonIndex);
  const scope = capability.slice(colonIndex + 1);
  if (verb.length === 0 || scope.length === 0)
    return null;
  return { verb, scope };
}

/** Exact, unscoped capability check (e.g. `"notifications"`). */
export function hasCapability(granted: readonly Capability[], verb: string): boolean {
  return granted.some((cap) => {
    const parsed = parseCapability(cap);
    return parsed?.verb === verb && parsed.scope === undefined;
  });
}

/**
 * Scoped `fs.read` check: granted iff some `fs.read:<scopeId>` capability
 * names `targetId` itself, or an ancestor of it. `nodes` is required to
 * resolve ancestry — a capability naming a scope the target isn't under
 * (or that no longer exists) simply doesn't match, it isn't an error.
 */
export function canReadFsNode(granted: readonly Capability[], targetId: string, nodes: NodeMap): boolean {
  for (const cap of granted) {
    const parsed = parseCapability(cap);
    if (!parsed || parsed.verb !== "fs.read" || !parsed.scope)
      continue;
    if (parsed.scope === targetId || isDescendantOf(nodes, targetId, parsed.scope))
      return true;
  }
  return false;
}

/**
 * Scoped `fs.write` check: granted iff some `fs.write:<scopeId>` capability
 * names `targetId` itself or an ancestor of it — same shape as
 * `canReadFsNode`. The same capability also governs deleting a node under the
 * scope (`canDeleteFsNode`): a writable-folder grant implies delete-within-it.
 */
export function canWriteFsNode(granted: readonly Capability[], targetId: string, nodes: NodeMap): boolean {
  for (const cap of granted) {
    const parsed = parseCapability(cap);
    if (!parsed || parsed.verb !== "fs.write" || !parsed.scope)
      continue;
    if (parsed.scope === targetId || isDescendantOf(nodes, targetId, parsed.scope))
      return true;
  }
  return false;
}

/**
 * `fs.delete` check: like `canWriteFsNode`, but the target must sit *under*
 * the granted scope. A writable-folder grant covers what's inside the folder,
 * never the folder itself, so an app can't trash the directory it was given.
 */
export function canDeleteFsNode(granted: readonly Capability[], targetId: string, nodes: NodeMap): boolean {
  for (const cap of granted) {
    const parsed = parseCapability(cap);
    if (parsed?.verb === "fs.write" && parsed.scope && isDescendantOf(nodes, targetId, parsed.scope))
      return true;
  }
  return false;
}

/**
 * Central capability gate the bridge dispatcher calls before running any
 * method. Six methods need no capability. `window.setTitle`, `ui.setState`,
 * `app.info`, `menus.set` and `dock.setBadge` are window and app chrome,
 * available to every sandboxed app exactly like `CommandId` shell commands are
 * for every app; none reaches anything but the frame's own window and dock
 * tile, and the bridge validates what they carry (`menuSchema.ts`).
 * `fs.pick` is the sixth: the user's choice in a shell-drawn dialog is the
 * grant, and what it opens up is one node, read-only.
 */
export function isMethodAuthorized(
  granted: readonly Capability[],
  method: SandboxMethod,
  params: { id?: string; parentId?: string },
  nodes: NodeMap,
): boolean {
  switch (method) {
    case "fs.read":
      return typeof params.id === "string" && canReadFsNode(granted, params.id, nodes);
    case "fs.list":
      return typeof params.id === "string" && canReadFsNode(granted, params.id, nodes);
    case "fs.write":
      // Authorized against the destination folder, not params.id — the file
      // being written may not exist yet.
      return typeof params.parentId === "string" && canWriteFsNode(granted, params.parentId, nodes);
    case "fs.delete":
      return typeof params.id === "string" && canDeleteFsNode(granted, params.id, nodes);
    case "notifications.notify":
      return hasCapability(granted, "notifications");
    case "window.setTitle":
    case "ui.setState":
    case "fs.pick":
    case "app.info":
    case "menus.set":
    case "dock.setBadge":
      return true;
    default:
      return false;
  }
}
