import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCUMENTS_ID, HOME_ID } from "@/system/fs/types";
import { MemoryStorage } from "@/testUtils/memoryStorage";
import { clampCodeFontSize, MAX_CODE_FONT_SIZE, MIN_CODE_FONT_SIZE } from "./codePrefsStore";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("codePrefsStore persistence", () => {
  it("declares a persist version so a future shape change can migrate", async () => {
    const { useCodePrefsStore } = await import("./codePrefsStore");
    expect(useCodePrefsStore.persist.getOptions().version).toBe(1);
  });

  it("round-trips preferences through localStorage", async () => {
    const { useCodePrefsStore } = await import("./codePrefsStore");
    // Real seed folder ids, not invented file ids: the module's own boot-time
    // `prunePinned()` would sweep a fake id straight back out.
    useCodePrefsStore.getState().togglePinned(DOCUMENTS_ID);
    useCodePrefsStore.getState().togglePinned(HOME_ID);
    useCodePrefsStore.getState().toggleWrap();

    vi.resetModules();
    const { useCodePrefsStore: reloaded } = await import("./codePrefsStore");
    await reloaded.persist.rehydrate();
    expect(reloaded.getState().pinnedIds).toEqual([DOCUMENTS_ID, HOME_ID]);
    expect(reloaded.getState().wrap).toBe(true);
  });

  it("defaults to no wrapping and visible line numbers", async () => {
    const { useCodePrefsStore } = await import("./codePrefsStore");
    expect(useCodePrefsStore.getState().wrap).toBe(false);
    expect(useCodePrefsStore.getState().lineNumbers).toBe(true);
  });

  it("togglePinned adds then removes", async () => {
    const { useCodePrefsStore } = await import("./codePrefsStore");
    useCodePrefsStore.getState().togglePinned("x");
    expect(useCodePrefsStore.getState().pinnedIds.includes("x")).toBe(true);
    useCodePrefsStore.getState().togglePinned("x");
    expect(useCodePrefsStore.getState().pinnedIds.includes("x")).toBe(false);
  });
});

describe("clampCodeFontSize", () => {
  it("clamps in both directions", () => {
    expect(clampCodeFontSize(MIN_CODE_FONT_SIZE - 5)).toBe(MIN_CODE_FONT_SIZE);
    expect(clampCodeFontSize(MAX_CODE_FONT_SIZE + 5)).toBe(MAX_CODE_FONT_SIZE);
    expect(clampCodeFontSize(13)).toBe(13);
  });
});
