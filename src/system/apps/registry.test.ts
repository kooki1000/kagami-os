import type { AppManifest } from "./types";
import { describe, expect, it } from "vitest";
import { getApp, registerInstalledApps } from "./registry";

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
