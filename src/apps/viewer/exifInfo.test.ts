import type { FsNode } from "@/system/fs/types";
import { describe, expect, it } from "vitest";
import { buildExifFields } from "./exifInfo";

function makeNode(overrides: Partial<FsNode> = {}): FsNode {
  return {
    id: "n1",
    parentId: "pictures",
    name: "sunset.png",
    type: "file",
    mimeType: "image/png",
    content: "abcd",
    createdAt: 0,
    modifiedAt: Date.UTC(2026, 0, 15),
    ...overrides,
  };
}

describe("buildExifFields", () => {
  it("returns nothing for an undefined node", () => {
    expect(buildExifFields(undefined, null)).toEqual([]);
  });

  it("omits dimensions until the natural size is known", () => {
    const fields = buildExifFields(makeNode(), null);
    expect(fields.map(f => f.label)).not.toContain("Dimensions");
  });

  it("includes dimensions once the natural size is available", () => {
    const fields = buildExifFields(makeNode(), { width: 1920, height: 1080 });
    expect(fields).toContainEqual({ label: "Dimensions", value: "1920 × 1080" });
  });

  it("reports the inline content's byte size", () => {
    const fields = buildExifFields(makeNode({ content: "abcd" }), null);
    expect(fields).toContainEqual({ label: "Size", value: "4 bytes" });
  });

  it("reports a blob-backed file's size from its contentRef", () => {
    const node = makeNode({ content: undefined, contentRef: { hash: "h1", size: 2048 } });
    const fields = buildExifFields(node, null);
    expect(fields).toContainEqual({ label: "Size", value: "2.0 KB" });
  });

  it("falls back to Unknown for a missing mime type", () => {
    const fields = buildExifFields(makeNode({ mimeType: undefined }), null);
    expect(fields).toContainEqual({ label: "Type", value: "Unknown" });
  });

  it("includes the file name and a formatted modified date", () => {
    const fields = buildExifFields(makeNode(), null);
    expect(fields).toContainEqual({ label: "Name", value: "sunset.png" });
    // `formatModified` omits the year for the current year (see
    // lib/format.ts), so a same-year fixture would make this assertion
    // meaningless — a previous-year timestamp exercises the full format.
    const modified = buildExifFields(makeNode({ modifiedAt: Date.UTC(2024, 0, 15) }), null)
      .find(f => f.label === "Modified")
      ?.value;
    expect(modified).toMatch(/2024/);
  });
});
