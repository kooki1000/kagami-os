import { beforeEach, describe, expect, it } from "vitest";
import { useSwitcherStore } from "./switcherStore";

function reset() {
  useSwitcherStore.setState({ open: false, order: [], index: 0 });
}

const api = () => useSwitcherStore.getState();

beforeEach(reset);

describe("openSwitcher", () => {
  it("opens with the second entry highlighted — the previous app, not the current one", () => {
    api().openSwitcher(["files", "notes", "viewer"]);
    expect(api().open).toBe(true);
    expect(api().index).toBe(1);
  });

  it("highlights the only entry when just one app is running", () => {
    api().openSwitcher(["files"]);
    expect(api().index).toBe(0);
  });

  it("is a no-op with an empty order", () => {
    api().openSwitcher([]);
    expect(api().open).toBe(false);
  });
});

describe("advance", () => {
  it("moves forward and wraps around", () => {
    api().openSwitcher(["files", "notes", "viewer"]);
    expect(api().index).toBe(1);
    api().advance(false);
    expect(api().index).toBe(2);
    api().advance(false);
    expect(api().index).toBe(0);
  });

  it("moves backward and wraps around", () => {
    api().openSwitcher(["files", "notes", "viewer"]);
    expect(api().index).toBe(1);
    api().advance(true);
    expect(api().index).toBe(0);
    api().advance(true);
    expect(api().index).toBe(2);
  });

  it("is a no-op while closed", () => {
    api().advance(false);
    expect(api().index).toBe(0);
    expect(api().open).toBe(false);
  });
});

describe("close", () => {
  it("resets open, order, and index", () => {
    api().openSwitcher(["files", "notes"]);
    api().close();
    expect(api()).toMatchObject({ open: false, order: [], index: 0 });
  });
});
