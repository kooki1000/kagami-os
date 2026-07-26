import type { SortSpec } from "@/system/fs/fsStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/testUtils/memoryStorage";
import { pushRecent, withoutStaleFolders, withoutStaleIds } from "./viewPrefsStore";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("viewPrefsStore persistence", () => {
  it("declares a persist version so a future shape change can migrate", async () => {
    const { useViewPrefsStore } = await import("./viewPrefsStore");
    expect(useViewPrefsStore.persist.getOptions().version).toBe(1);
  });

  it("drops mismatched-version persisted data instead of applying it blindly", async () => {
    localStorage.setItem(
      "kagami-view-prefs",
      JSON.stringify({ state: { sortByFolder: { stale: { key: "date", dir: "desc" } } }, version: 0 }),
    );
    const { useViewPrefsStore } = await import("./viewPrefsStore");
    await useViewPrefsStore.persist.rehydrate();
    expect(useViewPrefsStore.getState().sortByFolder).toEqual({});
  });
});

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

// U14: favouriteIds/recentIds are plain id lists (not per-folder maps like
// sortByFolder), pruned by the same "drop anything with no live node" rule.
describe("withoutStaleIds (U14 favourites/recents GC)", () => {
  it("keeps ids that still have a live node", () => {
    expect(withoutStaleIds(["a", "b"], new Set(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("drops ids with no live node, preserving order of the survivors", () => {
    expect(withoutStaleIds(["a", "gone", "b"], new Set(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("returns the same array instance when nothing needed dropping (cheap no-op check)", () => {
    const ids = ["a", "b"];
    expect(withoutStaleIds(ids, new Set(["a", "b"]))).toBe(ids);
  });

  it("returns an empty array when nothing is live", () => {
    expect(withoutStaleIds(["a"], new Set())).toEqual([]);
  });
});

describe("pushRecent (U14 Recents ring buffer)", () => {
  it("pushes a new id to the front", () => {
    expect(pushRecent(["a", "b"], "c", 10)).toEqual(["c", "a", "b"]);
  });

  it("de-dupes by moving an existing id to the front instead of listing it twice", () => {
    expect(pushRecent(["a", "b", "c"], "b", 10)).toEqual(["b", "a", "c"]);
  });

  it("caps the result at `max`, dropping the oldest entries", () => {
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

  it("starts an empty buffer with a single entry", () => {
    expect(pushRecent([], "a", 5)).toEqual(["a"]);
  });
});
