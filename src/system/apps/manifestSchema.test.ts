import { describe, expect, it } from "vitest";
import { parseAppManifest } from "./manifestSchema";

const validManifest = {
  id: "cool-app",
  name: "Cool App",
  version: "1.0.0",
  entry: "entry.html",
  capabilities: ["fs.read:cool-app", "notifications"],
};

describe("parseAppManifest", () => {
  it("accepts a well-formed manifest and round-trips its fields", () => {
    expect(parseAppManifest(validManifest)).toEqual(validManifest);
  });

  it("accepts optional icon and minShellVersion fields", () => {
    const withOptionals = { ...validManifest, icon: "puzzle", minShellVersion: "0.17.0" };
    expect(parseAppManifest(withOptionals)).toEqual(withOptionals);
  });

  it("accepts an empty capabilities array (a pure viewer that reads/writes nothing)", () => {
    expect(parseAppManifest({ ...validManifest, capabilities: [] })).toEqual({ ...validManifest, capabilities: [] });
  });

  for (const badData of [null, undefined, "a string", 42, true, [], {}]) {
    it(`rejects non-manifest data: ${JSON.stringify(badData)}`, () => {
      expect(parseAppManifest(badData)).toBeNull();
    });
  }

  for (const field of ["id", "name", "version", "entry"] as const) {
    it(`rejects a missing "${field}"`, () => {
      const { [field]: _omitted, ...rest } = validManifest;
      expect(parseAppManifest(rest)).toBeNull();
    });

    it(`rejects a non-string "${field}"`, () => {
      expect(parseAppManifest({ ...validManifest, [field]: 42 })).toBeNull();
    });
  }

  it("rejects an empty string id", () => {
    expect(parseAppManifest({ ...validManifest, id: "" })).toBeNull();
  });

  it("rejects an id containing a forward slash", () => {
    expect(parseAppManifest({ ...validManifest, id: "evil/../escape" })).toBeNull();
  });

  it("rejects an id containing a backslash", () => {
    expect(parseAppManifest({ ...validManifest, id: "evil\\escape" })).toBeNull();
  });

  it("rejects an id with leading/trailing whitespace", () => {
    expect(parseAppManifest({ ...validManifest, id: " cool-app " })).toBeNull();
  });

  it("rejects an entry containing a forward slash", () => {
    expect(parseAppManifest({ ...validManifest, entry: "sub/entry.html" })).toBeNull();
  });

  it("rejects a non-array capabilities field", () => {
    expect(parseAppManifest({ ...validManifest, capabilities: "fs.read:cool-app" })).toBeNull();
  });

  it("rejects a capabilities array with a non-string element", () => {
    expect(parseAppManifest({ ...validManifest, capabilities: ["fs.read:cool-app", 42] })).toBeNull();
  });

  it("rejects a non-string icon", () => {
    expect(parseAppManifest({ ...validManifest, icon: 42 })).toBeNull();
  });

  it("rejects a non-string minShellVersion", () => {
    expect(parseAppManifest({ ...validManifest, minShellVersion: 17 })).toBeNull();
  });

  it("never throws on structurally odd but clone-safe input", () => {
    expect(() => parseAppManifest({ id: {}, name: [], capabilities: null })).not.toThrow();
  });
});
