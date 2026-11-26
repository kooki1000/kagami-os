import type { ParsedBundle } from "./installBundle";
import { beforeEach, describe, expect, it } from "vitest";
import { useDockStore } from "@/system/dock/dockStore";
import { childrenOf, indexNodes, useFsStore } from "@/system/fs/fsStore";
import { APPS_ID, ROOT_ID } from "@/system/fs/types";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { useWindowStore } from "@/system/windows/windowStore";
import { getGrantedCapabilities, useAppGrantsStore } from "./appGrantsStore";
import { commitInstall, InvalidBundleError } from "./installBundle";
import { getApp } from "./registry";
import { uninstallApp } from "./uninstallApp";

function bundle(id: string): ParsedBundle {
  return {
    manifest: { id, name: `App ${id}`, version: "1.0.0", entry: "entry.js", capabilities: ["notifications"] },
    entryBytes: new TextEncoder().encode("// entry"),
  };
}

beforeEach(() => {
  useFsStore.setState({
    nodes: indexNodes([
      { id: ROOT_ID, parentId: null, name: "Kagami", type: "folder", createdAt: 0, modifiedAt: 0 },
      { id: APPS_ID, parentId: ROOT_ID, name: "Apps", type: "folder", createdAt: 0, modifiedAt: 0 },
    ]),
    ready: true,
  });
  useAppGrantsStore.setState({ grants: {} });
  useWindowStore.setState({ windows: [], focusedId: null, nextZ: 1, snapPreview: null, hiddenApps: new Set() });
  useDockStore.setState({ pinnedIds: [] });
  useSettingsStore.setState({ startupApps: [], defaultWindowSize: {}, fileAssociations: {} });
});

describe("uninstallApp (step 17, D8.6)", () => {
  it("leaves nothing behind in the VFS, the registry or the grants store", async () => {
    // Installing may lazily create system folders; compare against that.
    await commitInstall(bundle("baseline-app"));
    await uninstallApp("baseline-app");
    const baseline = Object.keys(useFsStore.getState().nodes).sort();

    await commitInstall(bundle("gone-app"));
    expect(getApp("gone-app")).toBeDefined();
    expect(getGrantedCapabilities("gone-app")).toEqual(["notifications"]);
    expect(childrenOf(useFsStore.getState().nodes, APPS_ID)).toHaveLength(1);

    expect(await uninstallApp("gone-app")).toBe(true);

    expect(getApp("gone-app")).toBeUndefined();
    expect(useAppGrantsStore.getState().grants["gone-app"]).toBeUndefined();
    expect(childrenOf(useFsStore.getState().nodes, APPS_ID)).toHaveLength(0);
    // Not even orphaned files from the deleted folder.
    expect(Object.keys(useFsStore.getState().nodes).sort()).toEqual(baseline);
  });

  it("clears every preference that names the app, and only that app", async () => {
    await commitInstall(bundle("gone-app"));
    await commitInstall(bundle("kept-app"));
    useDockStore.setState({ pinnedIds: ["gone-app", "kept-app"] });
    useSettingsStore.setState({
      startupApps: ["gone-app", "kept-app"],
      defaultWindowSize: { "gone-app": { width: 1, height: 2 }, "kept-app": { width: 3, height: 4 } },
      fileAssociations: { "text/x-gone": "gone-app", "text/x-kept": "kept-app" },
    });
    useWindowStore.getState().openWindow("gone-app", { title: "x", size: { width: 300, height: 200 } });
    useWindowStore.getState().openWindow("kept-app", { title: "y", size: { width: 300, height: 200 } });

    await uninstallApp("gone-app");

    expect(useDockStore.getState().pinnedIds).toEqual(["kept-app"]);
    const settings = useSettingsStore.getState();
    expect(settings.startupApps).toEqual(["kept-app"]);
    expect(Object.keys(settings.defaultWindowSize)).toEqual(["kept-app"]);
    expect(settings.fileAssociations).toEqual({ "text/x-kept": "kept-app" });
    expect(useWindowStore.getState().windows.map(w => w.appId)).toEqual(["kept-app"]);
    expect(getApp("kept-app")).toBeDefined();
    expect(getGrantedCapabilities("kept-app")).toEqual(["notifications"]);
  });

  it("returns false for an id that isn't installed, and never touches a built-in", async () => {
    expect(await uninstallApp("nope")).toBe(false);
    expect(await uninstallApp("notes")).toBe(false);
    expect(getApp("notes")).toBeDefined();
  });

  it("allows reinstalling the same id afterwards", async () => {
    await commitInstall(bundle("again-app"));
    await uninstallApp("again-app");
    await commitInstall(bundle("again-app"));
    expect(getApp("again-app")).toBeDefined();
  });
});

describe("commitInstall built-in id guard", () => {
  it("refuses a bundle claiming a built-in app's id", async () => {
    await expect(commitInstall(bundle("notes"))).rejects.toThrow(InvalidBundleError);
    expect(childrenOf(useFsStore.getState().nodes, APPS_ID)).toHaveLength(0);
  });
});
