import { describe, expect, it } from "vitest";
import { hashBlob, sha256Hex } from "./blobHash";

describe("sha256Hex", () => {
  it("matches the known SHA-256 vector for \"abc\"", async () => {
    const bytes = new TextEncoder().encode("abc");
    expect(await sha256Hex(bytes)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is content-addressed: identical bytes hash the same, different bytes differ", async () => {
    const a1 = await sha256Hex(new TextEncoder().encode("kagami"));
    const a2 = await sha256Hex(new TextEncoder().encode("kagami"));
    const b = await sha256Hex(new TextEncoder().encode("kagami!"));
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });
});

describe("hashBlob", () => {
  it("hashes a blob's bytes, agreeing with sha256Hex", async () => {
    const blob = new Blob(["abc"]);
    expect(await hashBlob(blob)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
