import { beforeEach, describe, expect, it } from "vitest";
import { useDesktopLayoutStore } from "./desktopLayoutStore";

beforeEach(() => {
  useDesktopLayoutStore.setState({ positions: {} });
});

describe("desktopLayoutStore (B7)", () => {
  it("has no stored positions until an icon is dragged", () => {
    expect(useDesktopLayoutStore.getState().positions).toEqual({});
  });

  it("setPosition records a position keyed by node id, leaving others untouched", () => {
    useDesktopLayoutStore.getState().setPosition("a", { x: 10, y: 20 });
    useDesktopLayoutStore.getState().setPosition("b", { x: 30, y: 40 });
    expect(useDesktopLayoutStore.getState().positions).toEqual({
      a: { x: 10, y: 20 },
      b: { x: 30, y: 40 },
    });
  });

  it("a later setPosition for the same id overwrites the earlier one", () => {
    useDesktopLayoutStore.getState().setPosition("a", { x: 10, y: 20 });
    useDesktopLayoutStore.getState().setPosition("a", { x: 99, y: 99 });
    expect(useDesktopLayoutStore.getState().positions.a).toEqual({ x: 99, y: 99 });
  });
});
