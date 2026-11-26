import { describe, expect, it } from "vitest";
import { MemoryStorage } from "@/testUtils/memoryStorage";
import { applyDesktopState, collectDesktopState, DESKTOP_STATE_KEYS, parseDesktopState } from "./desktopState";

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const payload = (state: unknown, version = 1): string => JSON.stringify({ state, version });

describe("collectDesktopState", () => {
  it("takes the raw payload of each known store that has one, and nothing else", () => {
    const storage = new MemoryStorage();
    storage.setItem("kagami-dock", payload({ pinnedIds: ["files"] }));
    storage.setItem("kagami:flag:third_party_apps", "on");
    storage.setItem("kagami-session", "{}");
    expect(collectDesktopState(storage)).toEqual({
      format: 1,
      stores: { "kagami-dock": payload({ pinnedIds: ["files"] }) },
    });
  });
});

describe("parseDesktopState", () => {
  it("is null for a missing entry, bad JSON, or the wrong format", () => {
    expect(parseDesktopState(undefined)).toBeNull();
    expect(parseDesktopState(new TextEncoder().encode("{ nope"))).toBeNull();
    expect(parseDesktopState(encode({ format: 2, stores: {} }))).toBeNull();
    expect(parseDesktopState(encode({ format: 1 }))).toBeNull();
  });

  it("keeps known stores with a persisted payload and drops everything else", () => {
    const parsed = parseDesktopState(encode({
      format: 1,
      stores: {
        "kagami-dock": payload({ pinnedIds: [] }),
        "kagami-session": payload({}),
        "kagami-theme": "not json",
        "kagami-settings": JSON.stringify({ nothing: true }),
        "kagami-view-prefs": JSON.stringify([1]),
      },
    }));
    expect(parsed).toEqual({ format: 1, stores: { "kagami-dock": payload({ pinnedIds: [] }) } });
  });

  it("refuses an oversized payload", () => {
    const parsed = parseDesktopState(encode({ format: 1, stores: { "kagami-dock": payload({ junk: "x".repeat(2_100_000) }) } }));
    expect(parsed).toBeNull();
  });

  it("only accepts app grants shaped as lists of capability strings", () => {
    const good = payload({ grants: { app: ["notifications"] } });
    const bad = payload({ grants: { app: [{ cap: 1 }] } });
    expect(parseDesktopState(encode({ format: 1, stores: { "kagami-app-grants": good } }))?.stores).toEqual({ "kagami-app-grants": good });
    expect(parseDesktopState(encode({ format: 1, stores: { "kagami-app-grants": bad } }))).toBeNull();
    expect(parseDesktopState(encode({ format: 1, stores: { "kagami-app-grants": payload({ grants: [] }) } }))).toBeNull();
  });
});

describe("applyDesktopState", () => {
  function fakeStore(name: string, log: string[], fail = false) {
    return {
      persist: {
        getOptions: () => ({ name }),
        rehydrate: async () => {
          if (fail)
            throw new Error("migrate threw");
          log.push(name);
        },
      },
    };
  }

  it("writes each payload and rehydrates its store, skipping stores the snapshot lacks", async () => {
    const storage = new MemoryStorage();
    const log: string[] = [];
    const applied = await applyDesktopState(
      { format: 1, stores: { "kagami-dock": payload({ a: 1 }) } },
      storage,
      [fakeStore("kagami-dock", log), fakeStore("kagami-settings", log)],
    );
    expect(applied).toEqual(["kagami-dock"]);
    expect(storage.getItem("kagami-dock")).toBe(payload({ a: 1 }));
    expect(storage.getItem("kagami-settings")).toBeNull();
    expect(log).toEqual(["kagami-dock"]);
  });

  it("carries on past a store that fails to rehydrate", async () => {
    const storage = new MemoryStorage();
    const log: string[] = [];
    const applied = await applyDesktopState(
      { format: 1, stores: { "kagami-dock": payload({}), "kagami-theme": payload({}) } },
      storage,
      [fakeStore("kagami-dock", log, true), fakeStore("kagami-theme", log)],
    );
    expect(applied).toEqual(["kagami-theme"]);
  });
});

describe("the key list", () => {
  it("matches the storage name of every persisted store it restores", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    try {
      const fresh = await import("./desktopState");
      const names = (await Promise.all([
        import("@/system/settings/settingsStore").then(m => m.useSettingsStore),
        import("@/system/dock/dockStore").then(m => m.useDockStore),
        import("@/system/desktop/desktopLayoutStore").then(m => m.useDesktopLayoutStore),
        import("@/system/theme/themeStore").then(m => m.useThemeStore),
        import("@/system/settings/viewPrefsStore").then(m => m.useViewPrefsStore),
        import("@/system/apps/appGrantsStore").then(m => m.useAppGrantsStore),
        import("@/apps/terminal/terminalStore").then(m => m.useTerminalStore),
        import("@/apps/code/codePrefsStore").then(m => m.useCodePrefsStore),
        import("@/apps/notes/notesPrefsStore").then(m => m.useNotesPrefsStore),
        import("@/apps/browser/browserPrefsStore").then(m => m.useBrowserPrefsStore),
      ])).map(store => store.persist.getOptions().name);
      expect([...names].sort()).toEqual([...fresh.DESKTOP_STATE_KEYS].sort());
    }
    finally {
      vi.unstubAllGlobals();
    }
    expect(DESKTOP_STATE_KEYS.length).toBe(10);
  });
});
