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
 * Central capability gate the bridge dispatcher calls before running any
 * method. `window.setTitle` and `ui.setState` need no capability — both are
 * basic window chrome, available to every sandboxed app exactly like
 * `CommandId` shell commands are for every app. Neither can reach anything
 * outside the frame's own window: one sets that window's title, the other
 * hands its own view state to its own host component.
 */
export function isMethodAuthorized(
  granted: readonly Capability[],
  method: SandboxMethod,
  params: { id?: string },
  nodes: NodeMap,
): boolean {
  switch (method) {
    case "fs.read":
      return typeof params.id === "string" && canReadFsNode(granted, params.id, nodes);
    case "notifications.notify":
      return hasCapability(granted, "notifications");
    case "window.setTitle":
    case "ui.setState":
      return true;
    default:
      return false;
  }
}
