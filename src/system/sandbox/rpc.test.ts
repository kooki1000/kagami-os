import { describe, expect, it } from "vitest";
import { buildAppCommandEvent, buildErrorResponse, buildSuccessResponse, buildThemeEvent, parseSandboxRequest } from "./rpc";

describe("parseSandboxRequest", () => {
  it("accepts a well-formed request and round-trips its fields", () => {
    const parsed = parseSandboxRequest({
      kind: "kagami.sandbox.request",
      id: "req-1",
      method: "fs.read",
      params: { id: "reportDoc" },
    });
    expect(parsed).toEqual({
      kind: "kagami.sandbox.request",
      id: "req-1",
      method: "fs.read",
      params: { id: "reportDoc" },
    });
  });

  it("accepts a request with no params", () => {
    const parsed = parseSandboxRequest({ kind: "kagami.sandbox.request", id: "req-2", method: "window.setTitle" });
    expect(parsed?.params).toBeUndefined();
  });

  for (const badData of [
    null,
    undefined,
    "a string",
    42,
    true,
    [],
    {},
  ]) {
    it(`rejects non-request data: ${JSON.stringify(badData)}`, () => {
      expect(parseSandboxRequest(badData)).toBeNull();
    });
  }

  it("rejects the wrong kind", () => {
    expect(parseSandboxRequest({ kind: "kagami.sandbox.response", id: "req-1", method: "fs.read" })).toBeNull();
  });

  it("rejects a missing id", () => {
    expect(parseSandboxRequest({ kind: "kagami.sandbox.request", method: "fs.read" })).toBeNull();
  });

  it("rejects a non-string id", () => {
    expect(parseSandboxRequest({ kind: "kagami.sandbox.request", id: 123, method: "fs.read" })).toBeNull();
  });

  it("rejects an empty-string id", () => {
    expect(parseSandboxRequest({ kind: "kagami.sandbox.request", id: "", method: "fs.read" })).toBeNull();
  });

  it("rejects an unknown method", () => {
    expect(parseSandboxRequest({ kind: "kagami.sandbox.request", id: "req-1", method: "fs.write" })).toBeNull();
  });

  it("rejects a non-string method", () => {
    expect(parseSandboxRequest({ kind: "kagami.sandbox.request", id: "req-1", method: 42 })).toBeNull();
  });

  it("accepts unrecognized extra fields without choking on them", () => {
    const parsed = parseSandboxRequest({
      kind: "kagami.sandbox.request",
      id: "req-1",
      method: "fs.read",
      params: { id: "reportDoc" },
      extraneous: "ignored",
    });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("extraneous");
  });

  it("never throws, even on structurally odd but clone-safe input", () => {
    const oddInputs: unknown[] = [Symbol("x"), () => {}, [1, 2, 3], new Date()];
    for (const input of oddInputs)
      expect(() => parseSandboxRequest(input)).not.toThrow();
  });
});

describe("response/event builders", () => {
  it("builds a success response", () => {
    expect(buildSuccessResponse("req-1", { hello: "world" })).toEqual({
      kind: "kagami.sandbox.response",
      id: "req-1",
      ok: true,
      data: { hello: "world" },
    });
  });

  it("builds an error response", () => {
    expect(buildErrorResponse("req-1", { code: "capability_denied", message: "nope" })).toEqual({
      kind: "kagami.sandbox.response",
      id: "req-1",
      ok: false,
      error: { code: "capability_denied", message: "nope" },
    });
  });

  it("builds an appCommand event", () => {
    expect(buildAppCommandEvent("notes.newNote")).toEqual({
      kind: "kagami.sandbox.event",
      type: "appCommand",
      command: "notes.newNote",
    });
  });
});

describe("buildThemeEvent", () => {
  it("wraps the pushed design tokens", () => {
    expect(buildThemeEvent({ "--surface-2": "#2a2823" })).toEqual({
      kind: "kagami.sandbox.event",
      type: "theme",
      vars: { "--surface-2": "#2a2823" },
    });
  });
});

describe("ui.setState is a recognized method", () => {
  it("parses, so a frame can report its view state outward", () => {
    const request = parseSandboxRequest({
      kind: "kagami.sandbox.request",
      id: "documents-1",
      method: "ui.setState",
      params: { state: { status: "ready", page: 2 } },
    });
    expect(request?.method).toBe("ui.setState");
  });
});
