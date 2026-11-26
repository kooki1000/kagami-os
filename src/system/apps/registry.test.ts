import type { AppManifest } from "./types";
import { describe, expect, it } from "vitest";
import { getApp, getInstalledApps, registerInstalledApps, unregisterInstalledApp } from "./registry";

function fakeManifest(id: string): AppManifest {
  return {
    id,
    name: id,
    icon: (() => null) as unknown as AppManifest["icon"],
    tileGradient: ["#000", "#111"],
    defaultSize: { width: 480, height: 400 },
    component: {} as AppManifest["component"],
  };
}

describe("registerInstalledApps (step 17, D8.4)", () => {
  it("makes a previously-unknown id resolve through getApp", () => {
    expect(getApp("a-fake-third-party-app")).toBeUndefined();
    registerInstalledApps([fakeManifest("a-fake-third-party-app")]);
    expect(getApp("a-fake-third-party-app")?.name).toBe("a-fake-third-party-app");
  });

  it("built-in apps are still resolvable after registering installed ones", () => {
    registerInstalledApps([fakeManifest("another-fake-app")]);
    expect(getApp("notes")).toBeDefined();
  });
});

describe("installed-app registry guards (step 17, D8.6)", () => {
  it("ignores a manifest that collides with a built-in id", () => {
    const before = getApp("notes");
    registerInstalledApps([fakeManifest("notes")]);
    expect(getApp("notes")).toBe(before);
    expect(getInstalledApps().some(app => app.id === "notes")).toBe(false);
  });

  it("unregisterInstalledApp removes an installed app and never a built-in", () => {
    registerInstalledApps([fakeManifest("removable-app")]);
    expect(getInstalledApps().map(app => app.id)).toContain("removable-app");
    unregisterInstalledApp("removable-app");
    expect(getApp("removable-app")).toBeUndefined();
    expect(getInstalledApps().map(app => app.id)).not.toContain("removable-app");

    unregisterInstalledApp("notes");
    expect(getApp("notes")).toBeDefined();
  });
});
