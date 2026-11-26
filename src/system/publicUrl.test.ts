import { describe, expect, it } from "vitest";
import { joinBase, publicUrl } from "./publicUrl";

describe("joinBase", () => {
  it("prefixes the root base unchanged", () => {
    expect(joinBase("/", "sandbox/documents.js")).toBe("/sandbox/documents.js");
  });

  it("prefixes a subpath base such as the GitHub Pages one", () => {
    expect(joinBase("/kagami-os/", "sandbox/documents.js")).toBe("/kagami-os/sandbox/documents.js");
  });

  it("tolerates a base without a trailing slash", () => {
    expect(joinBase("/kagami-os", "sw.js")).toBe("/kagami-os/sw.js");
  });

  it("tolerates a path with a leading slash", () => {
    expect(joinBase("/kagami-os/", "/sw.js")).toBe("/kagami-os/sw.js");
  });
});

describe("publicUrl", () => {
  it("uses the configured base (root under the test runner)", () => {
    expect(publicUrl("sw.js")).toBe(`${import.meta.env.BASE_URL}sw.js`);
  });
});
