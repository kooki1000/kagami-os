import { describe, expect, it } from "vitest";
import { dropWelcomePin, reconcilePinned } from "./dockStore";

// Regression: a persisted `pinnedIds` replaced the defaults wholesale, so an
// app shipped after a user's first visit never reached their dock.

const DEFAULTS = ["files", "notes", "terminal", "player"];

describe("reconcilePinned", () => {
  it("backfills an app added to the registry after the user's last visit", () => {
    // Pre-dates the field, so no knownDefaults at all.
    const stale = DEFAULTS.filter(id => id !== "player");
    expect(reconcilePinned(stale, undefined, DEFAULTS).pinnedIds).toContain("player");
  });

  it("records every current default as offered, so the backfill runs once", () => {
    const stale = DEFAULTS.filter(id => id !== "player");
    expect(reconcilePinned(stale, undefined, DEFAULTS).knownDefaults)
      .toEqual(expect.arrayContaining(DEFAULTS));
  });

  it("does not resurrect an app the user unpinned after it was offered", () => {
    const unpinned = DEFAULTS.filter(id => id !== "terminal");
    expect(reconcilePinned(unpinned, DEFAULTS, DEFAULTS).pinnedIds).not.toContain("terminal");
  });

  it("preserves pins the user added themselves", () => {
    const custom = [...DEFAULTS, "welcome"];
    expect(reconcilePinned(custom, DEFAULTS, DEFAULTS).pinnedIds).toContain("welcome");
  });

  it("never duplicates an id already pinned", () => {
    const { pinnedIds } = reconcilePinned(DEFAULTS, undefined, DEFAULTS);
    expect(new Set(pinnedIds).size).toBe(pinnedIds.length);
  });
});

describe("dropWelcomePin (v1 → v2)", () => {
  it("removes the welcome tile from a persisted dock", () => {
    const migrated = dropWelcomePin({ pinnedIds: [...DEFAULTS, "welcome"], size: "large" });
    expect(migrated).toEqual({ pinnedIds: DEFAULTS, size: "large" });
  });

  it("leaves knownDefaults alone, so welcome still reads as already offered", () => {
    const migrated = dropWelcomePin({
      pinnedIds: ["welcome"],
      knownDefaults: [...DEFAULTS, "welcome"],
    }) as { knownDefaults: string[] };
    expect(migrated.knownDefaults).toContain("welcome");
  });

  it("cannot be undone by reconcilePinned, which only ever adds", () => {
    const migrated = dropWelcomePin({
      pinnedIds: [...DEFAULTS, "welcome"],
      knownDefaults: [...DEFAULTS, "welcome"],
    }) as { pinnedIds: string[]; knownDefaults: string[] };
    // `welcome` is no longer a current default, so nothing backfills it.
    const { pinnedIds } = reconcilePinned(migrated.pinnedIds, migrated.knownDefaults, DEFAULTS);
    expect(pinnedIds).not.toContain("welcome");
  });

  it("passes through payloads it can't read rather than discarding them", () => {
    expect(dropWelcomePin(null)).toBeNull();
    expect(dropWelcomePin({ size: "small" })).toEqual({ size: "small" });
  });
});
