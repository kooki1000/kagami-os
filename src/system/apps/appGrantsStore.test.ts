import { beforeEach, describe, expect, it } from "vitest";
import { getGrantedCapabilities, setCapabilityGranted, useAppGrantsStore } from "./appGrantsStore";

beforeEach(() => {
  useAppGrantsStore.setState({ grants: {} });
});

describe("appGrantsStore", () => {
  it("returns an empty grant for an app that was never installed through the consent flow", () => {
    expect(getGrantedCapabilities("never-installed")).toEqual([]);
  });

  it("setGrantedCapabilities records exactly what was passed", () => {
    useAppGrantsStore.getState().setGrantedCapabilities("cool-app", ["fs.write:cool-app-data", "notifications"]);
    expect(getGrantedCapabilities("cool-app")).toEqual(["fs.write:cool-app-data", "notifications"]);
  });

  it("setting one app's grant doesn't disturb another's", () => {
    useAppGrantsStore.getState().setGrantedCapabilities("app-a", ["notifications"]);
    useAppGrantsStore.getState().setGrantedCapabilities("app-b", ["fs.read:documents"]);
    expect(getGrantedCapabilities("app-a")).toEqual(["notifications"]);
    expect(getGrantedCapabilities("app-b")).toEqual(["fs.read:documents"]);
  });

  it("clearGrant removes a recorded grant", () => {
    useAppGrantsStore.getState().setGrantedCapabilities("cool-app", ["notifications"]);
    useAppGrantsStore.getState().clearGrant("cool-app");
    expect(getGrantedCapabilities("cool-app")).toEqual([]);
  });

  it("clearGrant on an app with no grant is a no-op", () => {
    expect(() => useAppGrantsStore.getState().clearGrant("never-installed")).not.toThrow();
  });
});

describe("setCapabilityGranted (D8.7)", () => {
  const requested = ["notifications", "fs.read:documents"];

  beforeEach(() => {
    useAppGrantsStore.setState({ grants: { app: [...requested] } });
  });

  it("revokes one capability and leaves the others", () => {
    setCapabilityGranted("app", requested, "fs.read:documents", false);
    expect(getGrantedCapabilities("app")).toEqual(["notifications"]);
  });

  it("restores a revoked capability the app requested", () => {
    setCapabilityGranted("app", requested, "fs.read:documents", false);
    setCapabilityGranted("app", requested, "fs.read:documents", true);
    expect(getGrantedCapabilities("app").sort()).toEqual([...requested].sort());
  });

  it("never grants something the manifest didn't request", () => {
    setCapabilityGranted("app", requested, "fs.write:documents", true);
    expect(getGrantedCapabilities("app")).toEqual(requested);
  });

  it("is a no-op when the state already matches, without duplicating", () => {
    setCapabilityGranted("app", requested, "notifications", true);
    expect(getGrantedCapabilities("app")).toEqual(requested);
  });
});
