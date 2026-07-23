import { describe, expect, it } from "vitest";
import { removeMimeTypes, setMimeType } from "./tauriBlobStore";

// Pure meta-map helpers behind `createTauriBlobStore`'s mime-type sidecar —
// the IPC-calling shell is exercised manually via `pnpm tauri dev` (see
// `tauriAdapter.test.ts` for why).
describe("setMimeType", () => {
  it("adds a new hash → mime-type entry", () => {
    expect(setMimeType({}, "abc", "image/png")).toEqual({ abc: "image/png" });
  });

  it("overwrites an existing entry for the same hash", () => {
    expect(setMimeType({ abc: "text/plain" }, "abc", "image/png")).toEqual({ abc: "image/png" });
  });

  it("leaves other entries untouched", () => {
    const result = setMimeType({ existing: "text/plain" }, "abc", "image/png");
    expect(result).toEqual({ existing: "text/plain", abc: "image/png" });
  });
});

describe("removeMimeTypes", () => {
  it("drops only the given hashes", () => {
    const result = removeMimeTypes({ a: "image/png", b: "text/plain", c: "audio/mpeg" }, ["b"]);
    expect(result).toEqual({ a: "image/png", c: "audio/mpeg" });
  });

  it("is a no-op for hashes that aren't present", () => {
    const meta = { a: "image/png" };
    expect(removeMimeTypes(meta, ["missing"])).toEqual(meta);
  });
});
