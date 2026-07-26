import { beforeEach, describe, expect, it } from "vitest";
import { useDesktopLayoutStore } from "./desktopLayoutStore";

beforeEach(() => {
  useDesktopLayoutStore.setState({
    positions: {},
    iconSize: "medium",
    gridSnap: false,
    autoArrange: false,
    sortOrder: "name",
  });
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

describe("desktopLayoutStore preferences (U8)", () => {
  it("defaults to medium icons, no grid snap, no auto-arrange, name sort", () => {
    const state = useDesktopLayoutStore.getState();
    expect(state.iconSize).toBe("medium");
    expect(state.gridSnap).toBe(false);
    expect(state.autoArrange).toBe(false);
    expect(state.sortOrder).toBe("name");
  });

  it("each setter updates only its own field", () => {
    useDesktopLayoutStore.getState().setIconSize("large");
    useDesktopLayoutStore.getState().setGridSnap(true);
    useDesktopLayoutStore.getState().setAutoArrange(true);
    useDesktopLayoutStore.getState().setSortOrder("date");

    const state = useDesktopLayoutStore.getState();
    expect(state.iconSize).toBe("large");
    expect(state.gridSnap).toBe(true);
    expect(state.autoArrange).toBe(true);
    expect(state.sortOrder).toBe("date");
  });
});
