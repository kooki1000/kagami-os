import { afterEach, describe, expect, it } from "vitest";
import { isTauri } from "./platform";

// `@tauri-apps/api/core`'s `isTauri()` reads `(globalThis || window).isTauri`
// — the global the Tauri webview injects at startup. Stubbing it directly
// exercises our wrapper against the real dependency rather than a reimplementation.
describe("isTauri", () => {
  afterEach(() => {
    delete (globalThis as { isTauri?: boolean }).isTauri;
  });

  it("is false in a plain browser/test environment", () => {
    expect(isTauri()).toBe(false);
  });

  it("is true once the Tauri shell's global is present", () => {
    (globalThis as { isTauri?: boolean }).isTauri = true;
    expect(isTauri()).toBe(true);
  });
});
