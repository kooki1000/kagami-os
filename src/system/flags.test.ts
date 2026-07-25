import { describe, expect, it } from "vitest";
import { effectiveDefault, FLAGS, isFlagEnabled } from "./flags";

// `localStorage` isn't available under Vitest's `node` environment (flags.ts
// degrades gracefully — every override/localStorage call is wrapped in a
// try/catch for exactly this kind of environment), so these only exercise
// the env → registered-default half of resolution, not the per-device
// override. `effectiveDefault` is specifically the override-free half
// (review-backlog #14), so that's the part worth covering here regardless.

describe("effectiveDefault (review-backlog #14)", () => {
  it("falls back to the registered default when no env value is set", () => {
    for (const flag of FLAGS)
      expect(effectiveDefault(flag.id)).toBe(flag.default);
  });

  it("agrees with isFlagEnabled when there's no per-device override", () => {
    // No localStorage in this environment, so overrideValue() is always
    // null here — isFlagEnabled and effectiveDefault should coincide.
    for (const flag of FLAGS)
      expect(isFlagEnabled(flag.id)).toBe(effectiveDefault(flag.id));
  });
});
