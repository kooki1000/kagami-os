import { beforeEach, describe, expect, it } from "vitest";
import { useSearchStore } from "./searchStore";

const api = () => useSearchStore.getState();

beforeEach(() => {
  useSearchStore.setState({ open: false, query: "" });
});

describe("searchStore", () => {
  it("starts closed with an empty query", () => {
    expect(api().open).toBe(false);
    expect(api().query).toBe("");
  });

  it("openSearch opens the overlay", () => {
    api().openSearch();
    expect(api().open).toBe(true);
  });

  it("setQuery updates the query while open", () => {
    api().openSearch();
    api().setQuery("welcome");
    expect(api().query).toBe("welcome");
  });

  it("closeSearch closes the overlay and clears the query", () => {
    api().openSearch();
    api().setQuery("welcome");
    api().closeSearch();
    expect(api().open).toBe(false);
    expect(api().query).toBe("");
  });
});
