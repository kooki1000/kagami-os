import { afterEach, describe, expect, it, vi } from "vitest";
import { readStorageEstimate, storageLevel, usedFraction, wouldExceedQuota } from "./storageEstimate";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storage levels", () => {
  it("is ok below 80%, low from 80%, critical from 95%", () => {
    expect(storageLevel({ usage: 79, quota: 100 })).toBe("ok");
    expect(storageLevel({ usage: 80, quota: 100 })).toBe("low");
    expect(storageLevel({ usage: 95, quota: 100 })).toBe("critical");
  });

  it("clamps the used fraction to 0..1", () => {
    expect(usedFraction({ usage: 150, quota: 100 })).toBe(1);
    expect(usedFraction({ usage: -5, quota: 100 })).toBe(0);
  });
});

describe("wouldExceedQuota", () => {
  it("warns only when the write reaches the quota", () => {
    expect(wouldExceedQuota({ usage: 50, quota: 100 }, 49)).toBe(false);
    expect(wouldExceedQuota({ usage: 50, quota: 100 }, 50)).toBe(true);
  });
});

describe("readStorageEstimate", () => {
  it("returns null where the API is missing", async () => {
    vi.stubGlobal("navigator", {});
    expect(await readStorageEstimate()).toBeNull();
  });

  it("returns null for a zero quota or a rejected call", async () => {
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ usage: 1, quota: 0 }) } });
    expect(await readStorageEstimate()).toBeNull();
    vi.stubGlobal("navigator", {
      storage: {
        estimate: async () => {
          throw new Error("nope");
        },
      },
    });
    expect(await readStorageEstimate()).toBeNull();
  });

  it("passes usage and quota through", async () => {
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ usage: 10, quota: 200 }) } });
    expect(await readStorageEstimate()).toEqual({ usage: 10, quota: 200 });
  });
});
