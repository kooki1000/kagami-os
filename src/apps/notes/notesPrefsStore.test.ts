import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCUMENTS_ID, HOME_ID } from "@/system/fs/types";
import { MemoryStorage } from "@/testUtils/memoryStorage";
import { clampNoteFontSize, MAX_NOTE_FONT_SIZE, MIN_NOTE_FONT_SIZE } from "./notesPrefsStore";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notesPrefsStore persistence", () => {
  it("declares a persist version so a future shape change can migrate", async () => {
    const { useNotesPrefsStore } = await import("./notesPrefsStore");
    expect(useNotesPrefsStore.persist.getOptions().version).toBe(2);
  });

  it("round-trips pinnedIds through localStorage", async () => {
    const { useNotesPrefsStore } = await import("./notesPrefsStore");
    // Real, always-present seed folder ids — not made-up note ids: the
    // module's own boot-time `prunePinned()` (below) would otherwise sweep
    // a fake id right back out once the fs store finishes booting, which
    // would defeat this test's actual point (the persistence round-trip).
    useNotesPrefsStore.getState().togglePinned(DOCUMENTS_ID);
    useNotesPrefsStore.getState().togglePinned(HOME_ID);

    vi.resetModules();
    const { useNotesPrefsStore: reloaded } = await import("./notesPrefsStore");
    await reloaded.persist.rehydrate();
    expect(reloaded.getState().pinnedIds).toEqual([DOCUMENTS_ID, HOME_ID]);
  });

  it("togglePinned adds then removes", async () => {
    const { useNotesPrefsStore } = await import("./notesPrefsStore");
    useNotesPrefsStore.getState().togglePinned("x");
    expect(useNotesPrefsStore.getState().pinnedIds.includes("x")).toBe(true);
    useNotesPrefsStore.getState().togglePinned("x");
    expect(useNotesPrefsStore.getState().pinnedIds.includes("x")).toBe(false);
  });

  it("stepFontSize clamps to the min/max bounds", async () => {
    const { useNotesPrefsStore } = await import("./notesPrefsStore");
    for (let i = 0; i < 50; i++)
      useNotesPrefsStore.getState().stepFontSize(-1);
    expect(useNotesPrefsStore.getState().fontSize).toBe(MIN_NOTE_FONT_SIZE);
    for (let i = 0; i < 50; i++)
      useNotesPrefsStore.getState().stepFontSize(1);
    expect(useNotesPrefsStore.getState().fontSize).toBe(MAX_NOTE_FONT_SIZE);
  });
});

describe("clampNoteFontSize", () => {
  it("passes values already in range through unchanged", () => {
    expect(clampNoteFontSize(14)).toBe(14);
  });

  it("clamps below the minimum and above the maximum", () => {
    expect(clampNoteFontSize(0)).toBe(MIN_NOTE_FONT_SIZE);
    expect(clampNoteFontSize(999)).toBe(MAX_NOTE_FONT_SIZE);
  });
});
