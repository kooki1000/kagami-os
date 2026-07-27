import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdownPreview";

describe("parseInline", () => {
  it("returns a single text segment for plain text", () => {
    expect(parseInline("hello world")).toEqual([{ type: "text", content: "hello world" }]);
  });

  it("recognizes bold", () => {
    expect(parseInline("a **bold** word")).toEqual([
      { type: "text", content: "a " },
      { type: "bold", content: "bold" },
      { type: "text", content: " word" },
    ]);
  });

  it("recognizes italic without consuming bold markers", () => {
    expect(parseInline("*italic* and **bold**")).toEqual([
      { type: "italic", content: "italic" },
      { type: "text", content: " and " },
      { type: "bold", content: "bold" },
    ]);
  });

  it("recognizes underline via literal <u> tags", () => {
    expect(parseInline("an <u>underline</u> run")).toEqual([
      { type: "text", content: "an " },
      { type: "underline", content: "underline" },
      { type: "text", content: " run" },
    ]);
  });

  it("treats an unterminated marker as literal text", () => {
    expect(parseInline("a * lone star")).toEqual([{ type: "text", content: "a * lone star" }]);
  });

  it("treats stray angle brackets as literal text, never as generic HTML", () => {
    expect(parseInline("1 < 2 and 3 > 2")).toEqual([{ type: "text", content: "1 < 2 and 3 > 2" }]);
    expect(parseInline("<script>alert(1)</script>")).toEqual([{ type: "text", content: "<script>alert(1)</script>" }]);
  });
});

describe("parseMarkdown", () => {
  it("parses headings at every supported level", () => {
    expect(parseMarkdown("# One\n## Two\n### Three")).toEqual([
      { type: "heading", level: 1, segments: [{ type: "text", content: "One" }] },
      { type: "heading", level: 2, segments: [{ type: "text", content: "Two" }] },
      { type: "heading", level: 3, segments: [{ type: "text", content: "Three" }] },
    ]);
  });

  it("groups consecutive plain lines into one paragraph, separated by blank lines", () => {
    expect(parseMarkdown("line one\nline two\n\nsecond para")).toEqual([
      { type: "paragraph", lines: [[{ type: "text", content: "line one" }], [{ type: "text", content: "line two" }]] },
      { type: "paragraph", lines: [[{ type: "text", content: "second para" }]] },
    ]);
  });

  it("groups consecutive bullet lines into one list", () => {
    expect(parseMarkdown("- one\n- two")).toEqual([
      {
        type: "bulletList",
        items: [
          { segments: [{ type: "text", content: "one" }], checked: undefined },
          { segments: [{ type: "text", content: "two" }], checked: undefined },
        ],
      },
    ]);
  });

  it("marks checklist items as checked/unchecked", () => {
    expect(parseMarkdown("- [ ] todo\n- [x] done")).toEqual([
      {
        type: "bulletList",
        items: [
          { segments: [{ type: "text", content: "todo" }], checked: false },
          { segments: [{ type: "text", content: "done" }], checked: true },
        ],
      },
    ]);
  });

  it("groups consecutive numbered lines into one ordered list", () => {
    expect(parseMarkdown("1. first\n2. second")).toEqual([
      {
        type: "numberList",
        items: [
          { segments: [{ type: "text", content: "first" }] },
          { segments: [{ type: "text", content: "second" }] },
        ],
      },
    ]);
  });

  it("breaks a list when a heading interrupts it", () => {
    expect(parseMarkdown("- one\n# Heading\n- two")).toEqual([
      { type: "bulletList", items: [{ segments: [{ type: "text", content: "one" }], checked: undefined }] },
      { type: "heading", level: 1, segments: [{ type: "text", content: "Heading" }] },
      { type: "bulletList", items: [{ segments: [{ type: "text", content: "two" }], checked: undefined }] },
    ]);
  });

  it("skips leading/trailing/multiple blank lines", () => {
    expect(parseMarkdown("\n\none\n\n\ntwo\n\n")).toEqual([
      { type: "paragraph", lines: [[{ type: "text", content: "one" }]] },
      { type: "paragraph", lines: [[{ type: "text", content: "two" }]] },
    ]);
  });

  it("returns an empty array for empty text", () => {
    expect(parseMarkdown("")).toEqual([]);
  });
});
