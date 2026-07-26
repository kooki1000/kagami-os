import { describe, expect, it } from "vitest";
import { resolveEffectiveReducedMotion } from "./useReducedMotion";

// U6: the settings-store override layered on top of the OS query. Testing
// the pure function directly (rather than the `useEffectiveReducedMotion`
// hook) since this repo's unit suites run in a plain `node` environment,
// with no jsdom/RTL to render a hook against.
describe("resolveEffectiveReducedMotion", () => {
  it("'on' always reports reduced motion, regardless of the OS reading", () => {
    expect(resolveEffectiveReducedMotion("on", false)).toBe(true);
    expect(resolveEffectiveReducedMotion("on", true)).toBe(true);
  });

  it("'off' always reports full motion, regardless of the OS reading", () => {
    expect(resolveEffectiveReducedMotion("off", true)).toBe(false);
    expect(resolveEffectiveReducedMotion("off", false)).toBe(false);
  });

  it("'system' defers to whatever the OS query reports", () => {
    expect(resolveEffectiveReducedMotion("system", true)).toBe(true);
    expect(resolveEffectiveReducedMotion("system", false)).toBe(false);
  });
});
