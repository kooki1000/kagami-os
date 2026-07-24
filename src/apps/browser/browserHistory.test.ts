import { describe, expect, it } from "vitest";
import { applyNavigation, canGoBack, canGoForward, initialHistory } from "./browserHistory";

describe("applyNavigation", () => {
  it("is a no-op for the current entry", () => {
    const state = initialHistory("https://a.example");
    expect(applyNavigation(state, "https://a.example")).toEqual(state);
  });

  it("pushes a new entry for a forward navigation", () => {
    const state = initialHistory("https://a.example");
    const next = applyNavigation(state, "https://b.example");
    expect(next).toEqual({ entries: ["https://a.example", "https://b.example"], index: 1 });
  });

  it("moves the index back without touching entries for a back navigation", () => {
    let state = initialHistory("https://a.example");
    state = applyNavigation(state, "https://b.example");
    const back = applyNavigation(state, "https://a.example");
    expect(back).toEqual({ entries: ["https://a.example", "https://b.example"], index: 0 });
  });

  it("moves the index forward again after a back navigation", () => {
    let state = initialHistory("https://a.example");
    state = applyNavigation(state, "https://b.example");
    state = applyNavigation(state, "https://a.example");
    const forward = applyNavigation(state, "https://b.example");
    expect(forward).toEqual({ entries: ["https://a.example", "https://b.example"], index: 1 });
  });

  it("truncates redo entries when navigating to a new page after going back", () => {
    let state = initialHistory("https://a.example");
    state = applyNavigation(state, "https://b.example");
    state = applyNavigation(state, "https://a.example"); // back
    const next = applyNavigation(state, "https://c.example");
    expect(next).toEqual({ entries: ["https://a.example", "https://c.example"], index: 1 });
  });
});

describe("canGoBack / canGoForward", () => {
  it("reports false/false at the start of a fresh history", () => {
    const state = initialHistory("https://a.example");
    expect(canGoBack(state)).toBe(false);
    expect(canGoForward(state)).toBe(false);
  });

  it("reports canGoBack true after navigating forward", () => {
    const state = applyNavigation(initialHistory("https://a.example"), "https://b.example");
    expect(canGoBack(state)).toBe(true);
    expect(canGoForward(state)).toBe(false);
  });

  it("reports canGoForward true after going back", () => {
    let state = initialHistory("https://a.example");
    state = applyNavigation(state, "https://b.example");
    state = applyNavigation(state, "https://a.example");
    expect(canGoBack(state)).toBe(false);
    expect(canGoForward(state)).toBe(true);
  });
});
