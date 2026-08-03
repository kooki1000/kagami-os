import { describe, expect, it } from "vitest";
import { payloadUrl, restoreBrowserPayload, serializeBrowserPayload } from "./browserPayload";

describe("payloadUrl", () => {
  it("reads the url out of a payload", () => {
    expect(payloadUrl({ url: "https://example.com/a" })).toBe("https://example.com/a");
  });

  it("returns null for payloads that carry no url", () => {
    expect(payloadUrl(undefined)).toBeNull();
    expect(payloadUrl(null)).toBeNull();
    expect(payloadUrl({})).toBeNull();
    expect(payloadUrl("https://example.com")).toBeNull();
    expect(payloadUrl({ url: 42 })).toBeNull();
  });
});

describe("serializeBrowserPayload", () => {
  it("keeps a navigable url", () => {
    expect(serializeBrowserPayload({ url: "https://example.com/" }))
      .toEqual({ url: "https://example.com/" });
  });

  it("drops a window with no url rather than persisting a partial payload", () => {
    expect(serializeBrowserPayload(undefined)).toBeUndefined();
  });
});

describe("restoreBrowserPayload", () => {
  it("restores a stored https url", () => {
    expect(restoreBrowserPayload({ url: "https://example.com/docs" }))
      .toEqual({ url: "https://example.com/docs" });
  });

  it("drops a tampered javascript: entry instead of reopening onto it", () => {
    expect(restoreBrowserPayload({ url: "javascript:alert(1)" })).toBeUndefined();
  });

  it("drops a tampered data: entry", () => {
    expect(restoreBrowserPayload({ url: "data:text/html,<h1>hi</h1>" })).toBeUndefined();
  });

  it("drops a non-URL string", () => {
    expect(restoreBrowserPayload({ url: "example.com" })).toBeUndefined();
  });

  it("drops a malformed session entry", () => {
    expect(restoreBrowserPayload(null)).toBeUndefined();
    expect(restoreBrowserPayload({ url: null })).toBeUndefined();
  });
});
