import { describe, expect, it } from "vitest";
import { effectiveCapabilities } from "./effectiveCapabilities";

describe("effectiveCapabilities", () => {
  it("adds the data folder as read and write without touching the user's grants", () => {
    const granted = ["notifications"];
    expect(effectiveCapabilities(granted, { dataFolderId: "d1" })).toEqual([
      "notifications",
      "fs.read:d1",
      "fs.write:d1",
    ]);
    expect(granted).toEqual(["notifications"]);
  });

  it("gives a handed file read access only", () => {
    expect(effectiveCapabilities([], { fileIds: ["f1", "f2"] })).toEqual(["fs.read:f1", "fs.read:f2"]);
  });

  it("adds nothing when there is no folder and no file", () => {
    expect(effectiveCapabilities(["notifications"], { dataFolderId: null })).toEqual(["notifications"]);
  });
});
