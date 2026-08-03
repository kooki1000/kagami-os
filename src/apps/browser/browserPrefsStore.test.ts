import { beforeEach, describe, expect, it } from "vitest";
import { useBrowserPrefsStore, zoomForHost } from "./browserPrefsStore";
import { DEFAULT_ZOOM, ZOOM_LEVELS } from "./browserZoom";

function reset(): void {
  useBrowserPrefsStore.setState({ zoomByHost: {} });
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
