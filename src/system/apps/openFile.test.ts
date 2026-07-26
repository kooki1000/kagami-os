import type { FsNode } from "../fs/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../settings/settingsStore";
import { useWindowStore } from "../windows/windowStore";
import { appIdForFile, candidateAppsForFile, candidateAppsForMime, openFile, openFileWithApp, payloadFileId } from "./openFile";

function file(partial: Partial<FsNode> & Pick<FsNode, "id" | "name">): FsNode {
  return {
    parentId: "home",
    type: "file",
    createdAt: 0,
    modifiedAt: 0,
    ...partial,
  };
}

function resetStores() {
  useWindowStore.setState({
    windows: [],
    focusedId: null,
    nextZ: 1,
    snapPreview: null,
    viewport: { width: 1000, height: 800 },
  });
  useSettingsStore.setState({ fileAssociations: {} });
}

beforeEach(resetStores);

describe("candidateAppsForFile (B11)", () => {
  it("lists the built-in default app for a known mime family", () => {
    const note = file({ id: "n", name: "todo.txt", mimeType: "text/plain" });
    expect(candidateAppsForFile(note)).toEqual(["notes"]);
  });

  it("is empty for folders and for mime types with no association", () => {
    const folder = file({ id: "f", name: "Box", type: "folder" });
    const unknown = file({ id: "u", name: "data.bin", mimeType: "application/octet-stream" });
    expect(candidateAppsForFile(folder)).toEqual([]);
    expect(candidateAppsForFile(unknown)).toEqual([]);
  });
});

describe("candidateAppsForMime (U5)", () => {
  it("lists the built-in default app for a known mime family without needing a node", () => {
    expect(candidateAppsForMime("image/png")).toEqual(["viewer"]);
    expect(candidateAppsForMime("text/markdown")).toEqual(["notes"]);
  });

  it("is empty for a mime type with no built-in association", () => {
    expect(candidateAppsForMime("application/octet-stream")).toEqual([]);
  });
});

describe("appIdForFile (B11)", () => {
  it("falls back to the built-in mime-family table with no override", () => {
    const image = file({ id: "i", name: "pic.png", mimeType: "image/png" });
    expect(appIdForFile(image)).toBe("viewer");
  });

  it("prefers a settingsStore override for the exact mime type", () => {
    const image = file({ id: "i", name: "pic.png", mimeType: "image/png" });
    useSettingsStore.getState().setFileAssociation("image/png", "player");
    expect(appIdForFile(image)).toBe("player");
  });

  it("ignores an override naming an app that no longer exists", () => {
    const image = file({ id: "i", name: "pic.png", mimeType: "image/png" });
    useSettingsStore.getState().setFileAssociation("image/png", "no-such-app");
    expect(appIdForFile(image)).toBe("viewer");
  });

  it("an override on one mime type doesn't bleed onto a sibling in the same family", () => {
    const svg = file({ id: "s", name: "icon.svg", mimeType: "image/svg+xml" });
    useSettingsStore.getState().setFileAssociation("image/png", "player");
    expect(appIdForFile(svg)).toBe("viewer");
  });
});

describe("openFileWithApp (B11)", () => {
  it("launches the chosen app and persists it as the new default for that mime type", () => {
    const note = file({ id: "n", name: "todo.txt", mimeType: "text/plain" });
    const ok = openFileWithApp(note, "notes");
    expect(ok).toBe(true);
    expect(useSettingsStore.getState().fileAssociations["text/plain"]).toBe("notes");
    expect(useWindowStore.getState().windows).toHaveLength(1);
    expect(payloadFileId(useWindowStore.getState().windows[0].payload)).toBe("n");
  });

  it("a subsequent plain openFile() picks up the persisted override", () => {
    const clip = file({ id: "c", name: "clip.mp4", mimeType: "video/mp4" });
    openFileWithApp(clip, "player");
    useWindowStore.setState({ windows: [], focusedId: null, nextZ: 1, snapPreview: null, viewport: { width: 1000, height: 800 } });
    expect(openFile(clip)).toBe(true);
    expect(useWindowStore.getState().windows[0].appId).toBe("player");
  });

  it("doesn't persist the association when the launch fails (review-backlog #18)", () => {
    const note = file({ id: "n", name: "todo.txt", mimeType: "text/plain" });
    const ok = openFileWithApp(note, "no-such-app");
    expect(ok).toBe(false);
    expect(useSettingsStore.getState().fileAssociations["text/plain"]).toBeUndefined();
    expect(useWindowStore.getState().windows).toHaveLength(0);
  });
});

describe("re-launching a multi-instance app onto an existing window (review-backlog #7)", () => {
  it("refreshes the existing window's payload (a fresh object, same fileId) instead of leaving it stale", () => {
    const clip = file({ id: "c", name: "clip.mp4", mimeType: "video/mp4" });
    expect(openFile(clip)).toBe(true);
    const [win] = useWindowStore.getState().windows;
    const firstPayload = win.payload;

    // Re-opening the same file (as if double-clicked again in Files) should
    // focus the same window but hand it a *new* payload object — Player's
    // render-phase payload adoption keys off identity, not fileId, so a
    // stale object would never re-trigger it even though the fileId matches.
    expect(openFile(clip)).toBe(true);
    const windows = useWindowStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0].payload).not.toBe(firstPayload);
    expect(payloadFileId(windows[0].payload)).toBe("c");
  });
});
