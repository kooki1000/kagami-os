import { describe, expect, it } from "vitest";
import { isValidNodeLabel, NODE_LABELS, nodeLabelById } from "./nodeLabels";

describe("nodeLabels", () => {
  it("ships exactly the ~7 macOS-style swatch colors the plan calls for", () => {
    expect(NODE_LABELS.length).toBe(7);
    expect(new Set(NODE_LABELS.map(l => l.id)).size).toBe(NODE_LABELS.length);
  });

  it("isValidNodeLabel accepts every shipped label id", () => {
    for (const label of NODE_LABELS)
      expect(isValidNodeLabel(label.id)).toBe(true);
  });

  it("isValidNodeLabel rejects unknown strings", () => {
    expect(isValidNodeLabel("")).toBe(false);
    expect(isValidNodeLabel("chartreuse")).toBe(false);
    expect(isValidNodeLabel("RED")).toBe(false); // case-sensitive: ids are lowercase
  });

  it("nodeLabelById resolves a known id and is undefined for anything else", () => {
    expect(nodeLabelById("blue")?.name).toBe("Blue");
    expect(nodeLabelById("nope")).toBeUndefined();
    expect(nodeLabelById(undefined)).toBeUndefined();
  });
});
