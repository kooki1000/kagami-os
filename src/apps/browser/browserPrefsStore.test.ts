import { beforeEach, describe, expect, it } from "vitest";
import { isBookmarked, useBrowserPrefsStore, zoomForHost } from "./browserPrefsStore";
import { DEFAULT_ZOOM, ZOOM_LEVELS } from "./browserZoom";

function reset(): void {
  useBrowserPrefsStore.setState({ zoomByHost: {}, bookmarks: [], showBookmarksBar: false });
}

describe("zoomForHost", () => {
  it("falls back to the default for an unseen host", () => {
    expect(zoomForHost({}, "example.com")).toBe(DEFAULT_ZOOM);
  });

  it("returns the stored level for a known host", () => {
    expect(zoomForHost({ "example.com": 1.5 }, "example.com")).toBe(1.5);
  });
});

describe("setZoomForHost", () => {
  beforeEach(reset);

  it("stores a non-default level for one host without touching others", () => {
    const { setZoomForHost } = useBrowserPrefsStore.getState();
    setZoomForHost("a.example", 1.25);
    setZoomForHost("b.example", 0.8);
    expect(useBrowserPrefsStore.getState().zoomByHost).toEqual({
      "a.example": 1.25,
      "b.example": 0.8,
    });
  });

  it("drops a host returned to 100% rather than storing an entry per site visited", () => {
    const { setZoomForHost } = useBrowserPrefsStore.getState();
    setZoomForHost("a.example", 1.25);
    setZoomForHost("a.example", DEFAULT_ZOOM);
    expect(useBrowserPrefsStore.getState().zoomByHost).toEqual({});
  });

  it("clamps a level outside the ladder", () => {
    const { setZoomForHost } = useBrowserPrefsStore.getState();
    setZoomForHost("a.example", 99);
    expect(useBrowserPrefsStore.getState().zoomByHost["a.example"])
      .toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
  });

  it("ignores a hostless URL rather than storing an empty key", () => {
    const { setZoomForHost } = useBrowserPrefsStore.getState();
    setZoomForHost("", 1.5);
    expect(useBrowserPrefsStore.getState().zoomByHost).toEqual({});
  });
});

describe("isBookmarked", () => {
  it("matches on the exact URL", () => {
    const bookmarks = [{ url: "https://example.com/a", title: "A" }];
    expect(isBookmarked(bookmarks, "https://example.com/a")).toBe(true);
    expect(isBookmarked(bookmarks, "https://example.com/b")).toBe(false);
  });

  it("treats a fragment as a distinct page", () => {
    const bookmarks = [{ url: "https://example.com/a#two", title: "A" }];
    expect(isBookmarked(bookmarks, "https://example.com/a")).toBe(false);
  });
});

describe("toggleBookmark", () => {
  beforeEach(reset);

  it("adds a page, then removes it on a second toggle", () => {
    const { toggleBookmark } = useBrowserPrefsStore.getState();
    toggleBookmark({ url: "https://example.com/a", title: "Example" });
    expect(useBrowserPrefsStore.getState().bookmarks)
      .toEqual([{ url: "https://example.com/a", title: "Example" }]);

    toggleBookmark({ url: "https://example.com/a", title: "Example" });
    expect(useBrowserPrefsStore.getState().bookmarks).toEqual([]);
  });

  it("keeps insertion order", () => {
    const { toggleBookmark } = useBrowserPrefsStore.getState();
    toggleBookmark({ url: "https://a.example/", title: "A" });
    toggleBookmark({ url: "https://b.example/", title: "B" });
    expect(useBrowserPrefsStore.getState().bookmarks.map(b => b.title)).toEqual(["A", "B"]);
  });

  it("falls back to the URL when the page has no title", () => {
    const { toggleBookmark } = useBrowserPrefsStore.getState();
    toggleBookmark({ url: "https://example.com/a", title: "   " });
    expect(useBrowserPrefsStore.getState().bookmarks[0].title).toBe("https://example.com/a");
  });

  it("refuses a url that isn't navigable — a bookmark is clicked long after it's made", () => {
    const { toggleBookmark } = useBrowserPrefsStore.getState();
    toggleBookmark({ url: "javascript:alert(1)", title: "Nope" });
    expect(useBrowserPrefsStore.getState().bookmarks).toEqual([]);
  });
});

describe("removeBookmark", () => {
  beforeEach(reset);

  it("removes only the named url", () => {
    const { toggleBookmark, removeBookmark } = useBrowserPrefsStore.getState();
    toggleBookmark({ url: "https://a.example/", title: "A" });
    toggleBookmark({ url: "https://b.example/", title: "B" });
    removeBookmark("https://a.example/");
    expect(useBrowserPrefsStore.getState().bookmarks.map(b => b.title)).toEqual(["B"]);
  });
});
