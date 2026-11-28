import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWindowFilesStore } from "./windowFilesStore";

beforeEach(() => {
  useWindowFilesStore.setState({ grantsByWindow: {}, pending: null });
});

describe("windowFilesStore", () => {
  it("resolves a request with the user's choice and closes the picker", async () => {
    const { requestFile, settle } = useWindowFilesStore.getState();
    const result = requestFile({ windowId: "w1", appName: "A", accept: [] });
    expect(useWindowFilesStore.getState().pending?.appName).toBe("A");
    settle("file1");
    expect(await result).toBe("file1");
    expect(useWindowFilesStore.getState().pending).toBeNull();
  });

  it("answers a second request null while one is open, leaving the first alone", async () => {
    const { requestFile, settle } = useWindowFilesStore.getState();
    const first = requestFile({ windowId: "w1", appName: "A", accept: [] });
    expect(await requestFile({ windowId: "w2", appName: "B", accept: [] })).toBeNull();
    expect(useWindowFilesStore.getState().pending?.windowId).toBe("w1");
    settle("f");
    expect(await first).toBe("f");
  });

  it("closing a window cancels its picker and drops its grants, and no one else's", async () => {
    const { requestFile, grant, clearWindow } = useWindowFilesStore.getState();
    grant("w1", "a");
    grant("w2", "b");
    const result = requestFile({ windowId: "w1", appName: "A", accept: [] });
    clearWindow("w1");
    expect(await result).toBeNull();
    expect(useWindowFilesStore.getState().grantsByWindow).toEqual({ w2: ["b"] });

    const other = requestFile({ windowId: "w2", appName: "B", accept: [] });
    const spy = vi.fn();
    void other.then(spy);
    clearWindow("w1");
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });

  it("doesn't record the same grant twice", () => {
    const { grant } = useWindowFilesStore.getState();
    grant("w1", "a");
    grant("w1", "a");
    expect(useWindowFilesStore.getState().grantsByWindow.w1).toEqual(["a"]);
  });
});
