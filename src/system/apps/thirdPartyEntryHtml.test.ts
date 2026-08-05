import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "./thirdPartyEntryHtml";

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

describe("bytesToBase64", () => {
  it("round-trips empty bytes", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });

  it("round-trips a small array", () => {
    const bytes = new TextEncoder().encode("console.log('hi')");
    expect(decodeBase64(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("round-trips an array exactly at the chunk boundary (0x8000 bytes)", () => {
    const bytes = new Uint8Array(0x8000).map((_, i) => i % 256);
    expect(decodeBase64(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("round-trips an array spanning multiple chunks", () => {
    const bytes = new Uint8Array(0x8000 * 2 + 137).map((_, i) => i % 256);
    expect(decodeBase64(bytesToBase64(bytes))).toEqual(bytes);
  });
});
