import type { SortSpec } from "@/system/fs/fsStore";
import { describe, expect, it } from "vitest";
import { withoutStaleFolders } from "./viewPrefsStore";

// Pure-function coverage only (review-backlog #13): `pruneSortByFolder`'s
// store wiring runs off a module-scope `fsStore.init().then(...)`, which
// fires as an import side effect — awkward to drive deterministically from
// a test without racing that same side effect. `withoutStaleFolders` is the
// part that actually decides what to keep, and it's plain data in/data out.

const SORT: SortSpec = { key: "name", dir: "asc" };

describe("withoutStaleFolders (review-backlog #13)", () => {
  it("keeps entries for folders that still exist", () => {
    const sortByFolder = { a: SORT, b: SORT };
    expect(withoutStaleFolders(sortByFolder, new Set(["a", "b"]))).toEqual({ a: SORT, b: SORT });
  });

  it("drops entries whose folder id is no longer live", () => {
    const sortByFolder = { a: SORT, gone: SORT };
    expect(withoutStaleFolders(sortByFolder, new Set(["a"]))).toEqual({ a: SORT });
  });

  it("returns an empty object when nothing is live", () => {
    expect(withoutStaleFolders({ a: SORT }, new Set())).toEqual({});
  });

  it("is a no-op on an already-empty map", () => {
    expect(withoutStaleFolders({}, new Set(["a"]))).toEqual({});
  });
});
