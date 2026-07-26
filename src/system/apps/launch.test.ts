import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../settings/settingsStore";
import { useWindowStore } from "../windows/windowStore";
import { launchApp } from "./launch";

function resetStores() {
  useWindowStore.setState({
    windows: [],
    focusedId: null,
    nextZ: 1,
    snapPreview: null,
    viewport: { width: 1000, height: 800 },
  });
  useSettingsStore.setState({ defaultWindowSize: {} });
}

beforeEach(resetStores);

// Notes' own manifest defaultSize is 760x480 (src/apps/notes/index.ts,
// widened from 720 by U11's folder-scoped sidebar/filter/sort UI) — the
// remembered override below is deliberately a different width *and* height
// so a test asserting "not the override" can't pass by accident.
const REMEMBERED = { width: 500, height: 350 };

describe("launchApp — remembered window size (U9)", () => {
  it("opens at the app's own defaultSize with no override recorded", () => {
    launchApp("notes");
    const [win] = useWindowStore.getState().windows;
    expect(win.rect.width).toBe(760);
    expect(win.rect.height).toBe(480);
  });

  it("opens at the remembered size when settingsStore.defaultWindowSize has one for this app", () => {
    useSettingsStore.getState().setDefaultWindowSize("notes", REMEMBERED);
    launchApp("notes");
    const [win] = useWindowStore.getState().windows;
    expect(win.rect.width).toBe(REMEMBERED.width);
    expect(win.rect.height).toBe(REMEMBERED.height);
  });

  it("a remembered size for a different app doesn't bleed onto this one", () => {
    useSettingsStore.getState().setDefaultWindowSize("player", REMEMBERED);
    launchApp("notes");
    const [win] = useWindowStore.getState().windows;
    expect(win.rect.width).toBe(760);
    expect(win.rect.height).toBe(480);
  });

  it("returns null for an unregistered app id, same as before", () => {
    expect(launchApp("no-such-app")).toBeNull();
  });
});
