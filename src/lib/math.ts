/** Clamps `n` into [0, 1]. */
export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
