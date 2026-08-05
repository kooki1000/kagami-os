import { describe, expect, it } from "vitest";
import { InvalidBundleError, resolveBundleFromEntries } from "./installBundle";

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const VALID_MANIFEST = {
  id: "cool-app",
  name: "Cool App",
  version: "1.0.0",
  entry: "entry.js",
  capabilities: ["notifications"],
};

describe("resolveBundleFromEntries", () => {
  it("resolves a valid bundle", () => {
    const result = resolveBundleFromEntries({
      "manifest.json": utf8(JSON.stringify(VALID_MANIFEST)),
      "entry.js": utf8("console.log('hi')"),
    });
    expect(result.manifest).toEqual(VALID_MANIFEST);
    expect(new TextDecoder().decode(result.entryBytes)).toBe("console.log('hi')");
  });

  it("throws InvalidBundleError when manifest.json is missing", () => {
    expect(() => resolveBundleFromEntries({ "entry.js": utf8("//") })).toThrow(InvalidBundleError);
  });

  it("throws InvalidBundleError when manifest.json isn't valid JSON", () => {
    expect(() => resolveBundleFromEntries({ "manifest.json": utf8("{ not json") })).toThrow(InvalidBundleError);
  });

  it("throws InvalidBundleError when manifest.json fails schema validation", () => {
    expect(() => resolveBundleFromEntries({ "manifest.json": utf8(JSON.stringify({ id: "cool-app" })) })).toThrow(InvalidBundleError);
  });

  it("throws InvalidBundleError when the named entry file isn't in the archive", () => {
    expect(() => resolveBundleFromEntries({ "manifest.json": utf8(JSON.stringify(VALID_MANIFEST)) })).toThrow(InvalidBundleError);
  });

  it("ignores extra files in the archive beyond manifest.json and the entry", () => {
    const result = resolveBundleFromEntries({
      "manifest.json": utf8(JSON.stringify(VALID_MANIFEST)),
      "entry.js": utf8("//"),
      "README.md": utf8("# Cool App"),
    });
    expect(result.manifest.id).toBe("cool-app");
  });
});
