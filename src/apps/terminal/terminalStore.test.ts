import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/testUtils/memoryStorage";
import { clampFontSize, findHistoryMatch, fontStack, pushHistory, stepFontSize } from "./terminalStore";

describe("pushHistory", () => {
  it("appends a trimmed, non-blank command", () => {
    expect(pushHistory(["ls"], "  pwd  ")).toEqual(["ls", "pwd"]);
  });

  it("drops a blank/whitespace-only command instead of appending it", () => {
    expect(pushHistory(["ls"], "   ")).toEqual(["ls"]);
    expect(pushHistory(["ls"], "")).toEqual(["ls"]);
  });

  it("caps the result to the most recent `limit` entries", () => {
    const history = Array.from({ length: 5 }, (_, i) => `cmd${i}`);
    expect(pushHistory(history, "cmd5", 3)).toEqual(["cmd3", "cmd4", "cmd5"]);
  });
});

describe("findHistoryMatch", () => {
  const history = ["ls Documents", "cd Documents", "grep foo poem.txt", "ls Reports"];

  it("finds the most recent entry containing the query, case-insensitively", () => {
    expect(findHistoryMatch(history, "ls")).toBe(3);
    expect(findHistoryMatch(history, "LS")).toBe(3);
  });

  it("searches strictly before `beforeIndex` to step to the next-older match", () => {
    expect(findHistoryMatch(history, "ls", 3)).toBe(0);
  });

  it("returns null when nothing matches, or the beforeIndex leaves nothing to search", () => {
    expect(findHistoryMatch(history, "nope")).toBeNull();
    expect(findHistoryMatch(history, "ls", 0)).toBeNull();
  });

  it("returns null for an empty query rather than matching everything", () => {
    expect(findHistoryMatch(history, "")).toBeNull();
  });
});

describe("clampFontSize / stepFontSize", () => {
  it("snaps to the nearest defined step", () => {
    expect(clampFontSize(12.3)).toBe(12.5);
    expect(clampFontSize(1)).toBe(10);
    expect(clampFontSize(100)).toBe(20);
  });

  it("steps to the next size in a direction, clamped at the ends", () => {
    expect(stepFontSize(12.5, 1)).toBe(13);
    expect(stepFontSize(12.5, -1)).toBe(12);
    expect(stepFontSize(10, -1)).toBe(10);
    expect(stepFontSize(20, 1)).toBe(20);
  });
});

describe("fontStack", () => {
  it("resolves a known id to its stack", () => {
    expect(fontStack("courier")).toContain("Courier");
    expect(fontStack("kagami")).toBe("var(--font-mono)");
  });

  it("falls back to the default for an unrecognised id", () => {
    // A stored value from a build where the ids differed shouldn't render
    // as an invalid font-family — the app reads this on every render.
    expect(fontStack("comic-sans")).toBe(fontStack("kagami"));
  });
});

describe("terminalStore persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares a persist version so a future shape change can migrate", async () => {
    const { useTerminalStore } = await import("./terminalStore");
    expect(useTerminalStore.persist.getOptions().version).toBe(2);
  });

  it("drops mismatched-version persisted data instead of applying it blindly", async () => {
    localStorage.setItem(
      "kagami-terminal",
      JSON.stringify({ state: { history: ["stale command"] }, version: 0 }),
    );
    const { useTerminalStore } = await import("./terminalStore");
    await useTerminalStore.persist.rehydrate();
    // v1 is the only version `migrate` knows how to carry forward, so an
    // unrecognised one is discarded rather than silently adopted.
    expect(useTerminalStore.getState().history).toEqual([]);
  });

  it("persists history, font size, and aliases across a reload", async () => {
    const { useTerminalStore } = await import("./terminalStore");
    useTerminalStore.getState().addHistory("ls Documents");
    useTerminalStore.getState().setFontSize(16);
    useTerminalStore.getState().setAlias("ll", "ls -a");

    const persisted = JSON.parse(localStorage.getItem("kagami-terminal") ?? "{}");
    expect(persisted.state.history).toEqual(["ls Documents"]);
    expect(persisted.state.fontSize).toBe(16);
    expect(persisted.state.aliases).toEqual({ ll: "ls -a" });
  });

  it("removeAlias drops just the named alias", async () => {
    const { useTerminalStore } = await import("./terminalStore");
    useTerminalStore.getState().setAlias("ll", "ls -a");
    useTerminalStore.getState().setAlias("gohome", "cd ~");
    useTerminalStore.getState().removeAlias("ll");
    expect(useTerminalStore.getState().aliases).toEqual({ gohome: "cd ~" });
  });

  it("clearHistory empties the persisted history", async () => {
    const { useTerminalStore } = await import("./terminalStore");
    useTerminalStore.getState().addHistory("pwd");
    useTerminalStore.getState().clearHistory();
    expect(useTerminalStore.getState().history).toEqual([]);
  });

  it("migrates a v1 install by filling in the appearance defaults", async () => {
    localStorage.setItem("kagami-terminal", JSON.stringify({
      version: 1,
      state: { history: ["ls"], fontSize: 14, aliases: {} },
    }));
    const { useTerminalStore } = await import("./terminalStore");
    const state = useTerminalStore.getState();
    expect(state.history).toEqual(["ls"]);
    expect(state.fontSize).toBe(14);
    expect(state.fontFamily).toBe("kagami");
    expect(state.promptStyle).toBe("short");
  });

  it("replaces an unrecognised persisted appearance value rather than keeping it", async () => {
    localStorage.setItem("kagami-terminal", JSON.stringify({
      version: 1,
      state: { history: [], fontSize: 12.5, aliases: {}, fontFamily: "wingdings", promptStyle: "loud" },
    }));
    const { useTerminalStore } = await import("./terminalStore");
    expect(useTerminalStore.getState().fontFamily).toBe("kagami");
    expect(useTerminalStore.getState().promptStyle).toBe("short");
  });

  it("persists a chosen font and prompt style", async () => {
    const { useTerminalStore } = await import("./terminalStore");
    useTerminalStore.getState().setFontFamily("courier");
    useTerminalStore.getState().setPromptStyle("minimal");
    const persisted = JSON.parse(localStorage.getItem("kagami-terminal") ?? "{}");
    expect(persisted.state.fontFamily).toBe("courier");
    expect(persisted.state.promptStyle).toBe("minimal");
    expect(persisted.version).toBe(2);
  });
});
