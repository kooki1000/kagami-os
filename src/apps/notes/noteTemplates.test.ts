import { describe, expect, it } from "vitest";
import { findTemplate, NOTE_TEMPLATES } from "./noteTemplates";

describe("note templates", () => {
  it("has unique ids", () => {
    const ids = NOTE_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has at least a blank template and two others", () => {
    expect(NOTE_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(NOTE_TEMPLATES.find(t => t.id === "blank")?.content).toBe("");
  });

  it("gives non-blank templates actual starter content", () => {
    for (const template of NOTE_TEMPLATES) {
      if (template.id === "blank")
        continue;
      expect(template.content.length).toBeGreaterThan(0);
      expect(template.fileName.length).toBeGreaterThan(0);
    }
  });
});

describe("findTemplate", () => {
  it("finds a template by id", () => {
    expect(findTemplate("checklist").label).toBe("Checklist");
  });

  it("falls back to the first template for an unknown id", () => {
    expect(findTemplate("does-not-exist")).toBe(NOTE_TEMPLATES[0]);
  });
});
