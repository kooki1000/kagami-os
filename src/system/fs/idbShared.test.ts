import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openIdbDatabase } from "./idbShared";

/**
 * Minimal stand-in for `IDBOpenDBRequest` — real IndexedDB isn't available
 * under this suite's plain Node environment (see CLAUDE.md), and the two
 * real backends (`idbAdapter.ts`, `idbBlobStore.ts`) already only get
 * exercised via their in-memory fallback for the same reason. `openIdbDatabase`
 * only ever touches `indexedDB.open(...)` and the request/db event hooks, so
 * a hand-rolled fake of just that surface is enough to drive every branch.
 */
class FakeRequest {
  onupgradeneeded: (() => void) | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onblocked: (() => void) | null = null;
  result: FakeDb = new FakeDb();
  error: Error | null = null;
}

class FakeDb {
  onversionchange: (() => void) | null = null;
  closed = false;
  close(): void {
    this.closed = true;
  }
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", { open: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openIdbDatabase", () => {
  it("resolves with the database on a normal open", async () => {
    const request = new FakeRequest();
    vi.mocked(indexedDB.open).mockReturnValue(request as unknown as IDBOpenDBRequest);

    const promise = openIdbDatabase("db", 1, () => {});
    request.onsuccess?.();

    await expect(promise).resolves.toBe(request.result);
  });

  it("runs onUpgrade during onupgradeneeded", async () => {
    const request = new FakeRequest();
    vi.mocked(indexedDB.open).mockReturnValue(request as unknown as IDBOpenDBRequest);
    const onUpgrade = vi.fn();

    const promise = openIdbDatabase("db", 1, onUpgrade);
    request.onupgradeneeded?.();
    request.onsuccess?.();
    await promise;

    expect(onUpgrade).toHaveBeenCalledWith(request.result);
  });

  it("rejects on onerror", async () => {
    const request = new FakeRequest();
    request.error = new Error("boom");
    vi.mocked(indexedDB.open).mockReturnValue(request as unknown as IDBOpenDBRequest);

    const promise = openIdbDatabase("db", 1, () => {});
    request.onerror?.();

    await expect(promise).rejects.toThrow("boom");
  });

  // review-backlog.md §16: a second tab holding a v1 connection open makes a
  // new tab's upgrade attempt fire only `onblocked` — neither `onsuccess` nor
  // `onerror` — so without this handler the promise never settles and the
  // caller (fsStore.init) hangs forever instead of falling back to seed data.
  it("rejects on onblocked instead of hanging forever", async () => {
    const request = new FakeRequest();
    vi.mocked(indexedDB.open).mockReturnValue(request as unknown as IDBOpenDBRequest);

    const promise = openIdbDatabase("db", 2, () => {});
    request.onblocked?.();

    await expect(promise).rejects.toThrow(/blocked by another tab/i);
  });

  // review-backlog.md §16: the resolved connection must close itself when
  // another tab needs to upgrade, or it becomes the new blocker.
  it("closes the resolved connection on a later versionchange", async () => {
    const request = new FakeRequest();
    vi.mocked(indexedDB.open).mockReturnValue(request as unknown as IDBOpenDBRequest);

    const promise = openIdbDatabase("db", 1, () => {});
    request.onsuccess?.();
    const db = await promise;

    expect((db as unknown as FakeDb).closed).toBe(false);
    (db as unknown as FakeDb).onversionchange?.();
    expect((db as unknown as FakeDb).closed).toBe(true);
  });
});
