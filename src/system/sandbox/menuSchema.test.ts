import { describe, expect, it } from "vitest";
import { SHELL_CHORD_DESCRIPTIONS } from "@/system/shortcuts";
import { parseBadge, parseMenuSections, RESERVED_CHORDS } from "./menuSchema";

const valid = [
  {
    title: "Note",
    items: [
      { label: "New", appCommand: "note.new", shortcut: "⌘N" },
      { label: "Archive", appCommand: "note.archive", shortcut: "⇧⌘A", disabled: true, dividerAfter: true },
    ],
  },
];

describe("parseMenuSections", () => {
  it("accepts a well-formed menu and rebuilds it field by field", () => {
    expect(parseMenuSections(valid)).toEqual(valid);
    const withExtra = [{ title: "A", extra: 1, items: [{ label: "B", appCommand: "b", onClick: "x" }] }];
    expect(parseMenuSections(withExtra)).toEqual([{ title: "A", items: [{ label: "B", appCommand: "b" }] }]);
  });

  it("treats an empty list as valid, so a frame can clear its menus", () => {
    expect(parseMenuSections([])).toEqual([]);
  });

  it("refuses an item that names a shell command", () => {
    expect(parseMenuSections([{ title: "A", items: [{ label: "Quit", appCommand: "q", command: "app.quit" }] }])).toBeNull();
  });

  it("refuses an item with no appCommand", () => {
    expect(parseMenuSections([{ title: "A", items: [{ label: "B" }] }])).toBeNull();
  });

  it("refuses the chords the shell keeps for itself", () => {
    for (const shortcut of RESERVED_CHORDS)
      expect(parseMenuSections([{ title: "A", items: [{ label: "B", appCommand: "b", shortcut }] }])).toBeNull();
  });

  it("reserves every ⌘ chord the shell documents", () => {
    const documented = SHELL_CHORD_DESCRIPTIONS.map(d => d.shortcut).filter(chord => chord.startsWith("⌘"));
    for (const chord of documented)
      expect(RESERVED_CHORDS.has(chord), chord).toBe(true);
  });

  it("refuses a malformed shortcut", () => {
    for (const shortcut of ["Ctrl+N", "⌘", "⌘NN", "⌥⌘N", "⌘n", ""])
      expect(parseMenuSections([{ title: "A", items: [{ label: "B", appCommand: "b", shortcut }] }])).toBeNull();
  });

  it("refuses anything that isn't an array of sections with string fields", () => {
    expect(parseMenuSections(null)).toBeNull();
    expect(parseMenuSections({})).toBeNull();
    expect(parseMenuSections([null])).toBeNull();
    expect(parseMenuSections([{ title: "", items: [] }])).toBeNull();
    expect(parseMenuSections([{ title: "A", items: "nope" }])).toBeNull();
    expect(parseMenuSections([{ title: "A", items: [{ label: 1, appCommand: "b" }] }])).toBeNull();
    expect(parseMenuSections([{ title: "A", items: [{ label: "B", appCommand: "b", disabled: "yes" }] }])).toBeNull();
  });

  it("caps sections, items and string lengths", () => {
    const section = { title: "A", items: [] };
    expect(parseMenuSections(Array.from({ length: 9 }).fill(section))).toBeNull();
    const items = Array.from({ length: 25 }, () => ({ label: "B", appCommand: "b" }));
    expect(parseMenuSections([{ title: "A", items }])).toBeNull();
    expect(parseMenuSections([{ title: "A".repeat(41), items: [] }])).toBeNull();
    expect(parseMenuSections([{ title: "A", items: [{ label: "B".repeat(61), appCommand: "b" }] }])).toBeNull();
  });
});

describe("parseBadge", () => {
  it("accepts short text and counts, clamping large counts", () => {
    expect(parseBadge("new")).toBe("new");
    expect(parseBadge(7)).toBe("7");
    expect(parseBadge(250)).toBe("99+");
  });

  it("clears on null or an empty string", () => {
    expect(parseBadge(null)).toBeNull();
    expect(parseBadge("")).toBeNull();
  });

  it("refuses text too long to be a badge, and anything else", () => {
    expect(parseBadge("12345")).toBeUndefined();
    expect(parseBadge(" 1")).toBeUndefined();
    expect(parseBadge(0)).toBeUndefined();
    expect(parseBadge(1.5)).toBeUndefined();
    expect(parseBadge({})).toBeUndefined();
    expect(parseBadge(undefined)).toBeUndefined();
  });
});
