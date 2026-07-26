import type { FsNode } from "@/system/fs/types";

/**
 * Fisher-Yates shuffle of `ids`, using `rng` for each draw (defaults to
 * `Math.random`). Taking `rng` as a parameter — rather than reaching for
 * `Math.random()` internally — is what makes this deterministically
 * testable: a seeded generator produces a reproducible order.
 */
export function shuffledIds<T>(ids: readonly T[], rng: () => number = Math.random): T[] {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * A shuffle order generated once (on toggling shuffle on, or on a folder
 * change) and then held stable in component state rather than re-rolled on
 * every render — the current track is kept in its place so turning shuffle
 * on doesn't visibly jump away from what's already playing, matching the
 * common "shuffle picks up from here" convention.
 */
export function buildShuffleOrder(
  ids: readonly string[],
  currentId: string | null,
  rng: () => number = Math.random,
): string[] {
  if (currentId === null || !ids.includes(currentId))
    return shuffledIds(ids, rng);
  const rest = ids.filter(id => id !== currentId);
  return [currentId, ...shuffledIds(rest, rng)];
}

/**
 * Reorders `siblings` per a previously-built `order` of ids, tolerating
 * drift between the two: ids in `order` that are no longer in `siblings`
 * (trashed/moved since the order was built) are dropped, and any sibling
 * not yet in `order` (added to the folder since) is appended at the end in
 * its original relative order — so a stale order degrades gracefully
 * instead of needing to be perfectly in sync with `siblings` on every call.
 */
export function applyShuffleOrder(siblings: readonly FsNode[], order: readonly string[]): FsNode[] {
  const byId = new Map(siblings.map(node => [node.id, node]));
  const ordered: FsNode[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const node = byId.get(id);
    if (node) {
      ordered.push(node);
      seen.add(id);
    }
  }
  for (const node of siblings) {
    if (!seen.has(node.id))
      ordered.push(node);
  }
  return ordered;
}
