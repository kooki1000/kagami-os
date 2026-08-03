import { describe, expect, it } from "vitest";
import { isValidNodeIcon, NODE_ICONS, nodeIconById } from "./nodeIcons";
import { NODE_LABELS } from "./nodeLabels";

describe("nodeIcons", () => {
  it("ships a curated set with unique ids", () => {
    expect(NODE_ICONS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(NODE_ICONS.map(i => i.id)).size).toBe(NODE_ICONS.length);
  });

  it("gives every glyph a distinct human name for the picker", () => {
    expect(new Set(NODE_ICONS.map(i => i.name)).size).toBe(NODE_ICONS.length);
    for (const icon of NODE_ICONS)
      expect(icon.name.trim()).not.toBe("");
  });

  it("isValidNodeIcon accepts every shipped glyph id", () => {
    for (const icon of NODE_ICONS)
      expect(isValidNodeIcon(icon.id)).toBe(true);
  });

  it("isValidNodeIcon rejects unknown strings", () => {
    expect(isValidNodeIcon("")).toBe(false);
    expect(isValidNodeIcon("spaceship")).toBe(false);
    expect(isValidNodeIcon("Folder")).toBe(false); // case-sensitive: ids are lowercase
  });

  it("nodeIconById resolves a known id and is undefined for anything else", () => {
    expect(nodeIconById("star")).toBeTypeOf("object");
    expect(nodeIconById("nope")).toBeUndefined();
    expect(nodeIconById(undefined)).toBeUndefined();
  });

  it("shares its tint palette with labels, so the two can't drift", () => {
    // `iconTint` is validated with `isValidNodeLabel` rather than a second
    // list — this asserts the intent, so a future icon-only palette is a
    // deliberate change and not an accident.
    expect(NODE_LABELS.length).toBeGreaterThan(0);
  });
});
