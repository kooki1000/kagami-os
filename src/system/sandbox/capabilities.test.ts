import type { NodeMap } from "@/system/fs/fsStore";
import { describe, expect, it } from "vitest";
import { canReadFsNode, hasCapability, isMethodAuthorized } from "./capabilities";

function node(id: string, parentId: string | null) {
  return { id, parentId, name: id, type: "file", createdAt: 0, modifiedAt: 0 } as unknown as NodeMap[string];
}

const nodes: NodeMap = {
  root: node("root", null),
  documents: node("documents", "root"),
  reportDoc: node("reportDoc", "documents"),
  nestedFolder: node("nestedFolder", "documents"),
  nestedFile: node("nestedFile", "nestedFolder"),
  desktop: node("desktop", "root"),
  desktopFile: node("desktopFile", "desktop"),
};

describe("hasCapability", () => {
  it("matches an exact unscoped capability", () => {
    expect(hasCapability(["notifications"], "notifications")).toBe(true);
  });

  it("does not match a scoped capability against an unscoped check", () => {
    expect(hasCapability(["notifications:extra"], "notifications")).toBe(false);
  });

  it("does not match when the capability is absent", () => {
    expect(hasCapability([], "notifications")).toBe(false);
    expect(hasCapability(["fs.read:documents"], "notifications")).toBe(false);
  });
});

describe("canReadFsNode", () => {
  it("matches the exact granted scope id", () => {
    expect(canReadFsNode(["fs.read:documents"], "documents", nodes)).toBe(true);
  });

  it("matches a direct descendant of the granted scope", () => {
    expect(canReadFsNode(["fs.read:documents"], "reportDoc", nodes)).toBe(true);
  });

  it("matches a nested (grandchild) descendant of the granted scope", () => {
    expect(canReadFsNode(["fs.read:documents"], "nestedFile", nodes)).toBe(true);
  });

  it("refuses a node outside the granted scope", () => {
    expect(canReadFsNode(["fs.read:documents"], "desktopFile", nodes)).toBe(false);
  });

  it("refuses when no fs.read capability is granted at all", () => {
    expect(canReadFsNode(["notifications"], "reportDoc", nodes)).toBe(false);
    expect(canReadFsNode([], "reportDoc", nodes)).toBe(false);
  });

  it("refuses a target id that doesn't exist in the node map", () => {
    expect(canReadFsNode(["fs.read:documents"], "doesNotExist", nodes)).toBe(false);
  });
});

describe("malformed capability strings fail closed", () => {
  it("ignores an empty string", () => {
    expect(hasCapability([""], "notifications")).toBe(false);
    expect(canReadFsNode([""], "reportDoc", nodes)).toBe(false);
  });

  it("ignores a bare trailing colon with no scope", () => {
    expect(canReadFsNode(["fs.read:"], "reportDoc", nodes)).toBe(false);
  });

  it("ignores an fs.read capability with no scope alongside a valid one", () => {
    expect(canReadFsNode(["fs.read:", "fs.read:documents"], "reportDoc", nodes)).toBe(true);
  });
});

describe("isMethodAuthorized", () => {
  it("authorizes fs.read within scope", () => {
    expect(isMethodAuthorized(["fs.read:documents"], "fs.read", { id: "reportDoc" }, nodes)).toBe(true);
  });

  it("refuses fs.read outside scope", () => {
    expect(isMethodAuthorized(["fs.read:documents"], "fs.read", { id: "desktopFile" }, nodes)).toBe(false);
  });

  it("refuses fs.read with a missing id param", () => {
    expect(isMethodAuthorized(["fs.read:documents"], "fs.read", {}, nodes)).toBe(false);
  });

  it("authorizes notifications.notify only when granted", () => {
    expect(isMethodAuthorized(["notifications"], "notifications.notify", {}, nodes)).toBe(true);
    expect(isMethodAuthorized([], "notifications.notify", {}, nodes)).toBe(false);
  });

  it("always authorizes window.setTitle regardless of granted capabilities", () => {
    expect(isMethodAuthorized([], "window.setTitle", {}, nodes)).toBe(true);
  });

  it("refuses an unknown method", () => {
    // @ts-expect-error deliberately testing an unrecognized method string
    expect(isMethodAuthorized(["notifications"], "unknown.method", {}, nodes)).toBe(false);
  });
});
