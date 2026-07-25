import { beforeEach, describe, expect, it } from "vitest";
import { useNotificationStore } from "../notifications/notificationStore";
import { isCommittableRename } from "./renameCommit";

describe("isCommittableRename (review-backlog #4)", () => {
  beforeEach(() => {
    useNotificationStore.setState({ items: [], toastIds: [] });
  });

  it("accepts an ordinary name and toasts nothing", () => {
    expect(isCommittableRename("notes.md")).toBe(true);
    expect(useNotificationStore.getState().items).toHaveLength(0);
  });

  it("accepts a blank/whitespace-only name (caller treats it as 'user backed out')", () => {
    expect(isCommittableRename("")).toBe(true);
    expect(isCommittableRename("   ")).toBe(true);
    expect(useNotificationStore.getState().items).toHaveLength(0);
  });

  it("rejects a name containing a slash and toasts once", () => {
    expect(isCommittableRename("a/b")).toBe(false);
    const items = useNotificationStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Can’t rename");
    expect(items[0].tone).toBe("danger");
  });
});
