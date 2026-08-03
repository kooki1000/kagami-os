import { describe, expect, it } from "vitest";
import { docToMarkdown, inlineToNodes, markdownToDoc } from "./markdownDocument";

/** markdown → document → markdown, the trip a note makes on open and save. */
function roundTrip(text: string): string {
  return docToMarkdown(markdownToDoc(text));
}

describe("markdownToDoc", () => {
  it("parses headings with their level", () => {
    expect(markdownToDoc("## Agenda").content).toEqual([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Agenda" }] },
    ]);
  });

  it("parses the three inline marks, and nothing else", () => {
    expect(inlineToNodes("a **b** c *d* e <u>f</u>")).toEqual([
      { type: "text", text: "a " },
      { type: "text", text: "b", marks: [{ type: "bold" }] },
      { type: "text", text: " c " },
      { type: "text", text: "d", marks: [{ type: "italic" }] },
      { type: "text", text: " e " },
      { type: "text", text: "f", marks: [{ type: "underline" }] },
    ]);
  });

  it("groups a run of bullets into one list", () => {
    const doc = markdownToDoc("- one\n- two");
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0].type).toBe("bulletList");
    expect(doc.content?.[0].content).toHaveLength(2);
  });

  it("keeps task items out of the bullet list and records their state", () => {
    const doc = markdownToDoc("- [x] done\n- [ ] todo");
    expect(doc.content?.[0].type).toBe("taskList");
    expect(doc.content?.[0].content?.map(i => i.attrs?.checked)).toEqual([true, false]);
  });

  it("splits a bullet run when a task line interrupts it", () => {
    const doc = markdownToDoc("- plain\n- [ ] task");
    expect(doc.content?.map(b => b.type)).toEqual(["bulletList", "taskList"]);
  });

  it("numbers an ordered list from its own position, not the source markers", () => {
    expect(roundTrip("3. c\n7. d")).toBe("1. c\n2. d");
  });

  it("joins a paragraph's lines with hard breaks rather than splitting the paragraph", () => {
    const doc = markdownToDoc("first\nsecond");
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0].content?.map(n => n.type ?? "text")).toEqual(["text", "hardBreak", "text"]);
  });

  it("gives an empty note a paragraph to put the caret in", () => {
    expect(markdownToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("gives an empty list item its required paragraph", () => {
    // A childless listItem is invalid against the schema, and ProseMirror
    // would drop the whole item rather than render an empty bullet.
    expect(markdownToDoc("- ").content?.[0].content?.[0].content).toEqual([{ type: "paragraph" }]);
  });
});

describe("closed vocabulary", () => {
  // The guarantee ROADMAP §6 decision 8 rests on: this grammar has no
  // branch that turns source text into anything but the nodes and marks
  // listed above, so unsupported markdown stays visible as characters.
  it.each([
    ["a link", "[click](https://example.com)"],
    ["an image", "![alt](https://example.com/x.png)"],
    ["a code fence", "```js\nalert(1)\n```"],
    ["a blockquote", "> quoted"],
    ["a table row", "| a | b |"],
    ["an H4", "#### deeper"],
  ])("leaves %s as literal text", (_label, source) => {
    const doc = markdownToDoc(source);
    const types = new Set<string>();
    const walk = (node: { type?: string; content?: unknown[] }): void => {
      if (node.type)
        types.add(node.type);
      for (const child of (node.content ?? []) as { type?: string; content?: unknown[] }[])
        walk(child);
    };
    walk(doc);
    // A multi-line source (a fence) also yields hardBreak — still nothing
    // beyond plain text and the line breaks between its lines.
    expect([...types].sort().filter(t => t !== "hardBreak")).toEqual(["doc", "paragraph", "text"]);
  });

  it("leaves an HTML tag as text rather than parsing it", () => {
    const doc = markdownToDoc("<script>alert(1)</script>");
    expect(doc.content?.[0].content?.[0]).toEqual({ type: "text", text: "<script>alert(1)</script>" });
  });

  it("treats <u> as a literal two-token string, not a tag parse", () => {
    // The one angle-bracket form the grammar knows — and it knows it the
    // same way it knows `**`, by matching the exact characters.
    expect(inlineToNodes("<u>x</u>")).toEqual([{ type: "text", text: "x", marks: [{ type: "underline" }] }]);
    expect(inlineToNodes("<U>x</U>")).toEqual([{ type: "text", text: "<U>x</U>" }]);
  });
});

describe("round trip", () => {
  const sources = [
    "# Title\n\nA paragraph.",
    "## Agenda\n\n- one\n- two\n\n1. first\n2. second",
    "- [ ] todo\n- [x] done",
    "Some **bold**, some *italic*, some <u>underline</u>.",
    "line one\nline two\n\nnext paragraph",
    "# Title\n\n- [x] ship it\n\nA closing **note**.",
  ];

  it.each(sources)("preserves %j exactly", (source) => {
    expect(roundTrip(source)).toBe(source);
  });

  it.each(sources)("is idempotent for %j", (source) => {
    expect(roundTrip(roundTrip(source))).toBe(roundTrip(source));
  });

  it("normalizes irregular spacing once, then holds steady", () => {
    // Opening and saving an untouched note may tidy it, but only the first
    // time — otherwise every open would rewrite the file.
    const messy = "# Title\n\n\n\npara\n\n\n- a\n- b\n";
    const once = roundTrip(messy);
    expect(once).toBe("# Title\n\npara\n\n- a\n- b");
    expect(roundTrip(once)).toBe(once);
  });
});

describe("docToMarkdown", () => {
  it("clamps a heading level to the three the grammar has", () => {
    const doc = { type: "doc", content: [{ type: "heading", attrs: { level: 6 }, content: [{ type: "text", text: "x" }] }] };
    expect(docToMarkdown(doc)).toBe("### x");
  });

  it("drops a mark on empty text rather than emitting bare wrappers", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "", marks: [{ type: "bold" }] }] }] };
    expect(docToMarkdown(doc)).toBe("");
  });

  it("renders an empty document as an empty file", () => {
    expect(docToMarkdown({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
  });

  it("drops an empty paragraph rather than writing blank lines the parser will discard", () => {
    // Pressing Enter on a blank line is normal editing, but markdown can't
    // record it — writing it out would leave the file flipping between two
    // forms on every save/open cycle.
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "body" }] },
      ],
    };
    expect(docToMarkdown(doc)).toBe("# Title\n\nbody");
  });
});
