import { getSchema } from "@tiptap/core";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { ALLOWED_MARKS, ALLOWED_NODES, NOTES_EXTENSIONS } from "./editorSchema";
import { docToMarkdown, markdownToDoc } from "./markdownDocument";

// `getSchema` builds the ProseMirror schema from the extension list without
// mounting an editor, so this runs in the plain `node` environment the rest
// of the suite uses — no jsdom, per the repo's testing convention.
const schema = getSchema(NOTES_EXTENSIONS);

describe("notes editor schema (D9, ROADMAP §6 decision 8)", () => {
  it("contains exactly the declared nodes — nothing else can exist in a note", () => {
    expect(Object.keys(schema.nodes).sort()).toEqual([...ALLOWED_NODES].sort());
  });

  it("contains exactly the declared marks", () => {
    expect(Object.keys(schema.marks).sort()).toEqual([...ALLOWED_MARKS].sort());
  });

  it("has no node carrying a URL-shaped attribute", () => {
    // Link and Image are the two StarterKit nodes decision 8 rules out, and
    // an href/src attribute is what makes them a different security
    // question from bold or a bullet.
    const attrs = Object.values(schema.nodes).flatMap(node => Object.keys(node.spec.attrs ?? {}));
    const markAttrs = Object.values(schema.marks).flatMap(mark => Object.keys(mark.spec.attrs ?? {}));
    expect([...attrs, ...markAttrs].filter(a => /href|src|url/i.test(a))).toEqual([]);
  });

  it("declares no node as a raw-HTML or code passthrough", () => {
    const passthrough = Object.values(schema.nodes).filter(node => node.spec.code === true);
    expect(passthrough).toEqual([]);
  });

  it("markdownDocument can only produce node types the schema declares", () => {
    // The two files are written to match; this fails loudly if one drifts.
    const doc = markdownToDoc([
      "# H1",
      "## H2",
      "### H3",
      "",
      "para one",
      "para two",
      "",
      "- bullet",
      "",
      "1. ordered",
      "",
      "- [x] task",
      "",
      "**b** *i* <u>u</u>",
    ].join("\n"));

    const types = new Set<string>();
    const marks = new Set<string>();
    const walk = (node: { type?: string; marks?: { type?: string }[]; content?: unknown[] }): void => {
      if (node.type)
        types.add(node.type);
      for (const mark of node.marks ?? []) {
        if (mark.type)
          marks.add(mark.type);
      }
      for (const child of (node.content ?? []) as Parameters<typeof walk>[0][])
        walk(child);
    };
    walk(doc);

    for (const type of types)
      expect(Object.keys(schema.nodes)).toContain(type);
    for (const mark of marks)
      expect(Object.keys(schema.marks)).toContain(mark);
  });

  it("round-trips a document through the real schema without losing anything", () => {
    const source = "# Title\n\n- [x] done\n- [ ] todo\n\nA **bold** line.";
    // Validate against the schema the editor actually uses, not just the
    // JSON shape: nodeFromJSON throws if the document is invalid.
    const node = schema.nodeFromJSON(markdownToDoc(source));
    node.check();
    expect(docToMarkdown(node.toJSON())).toBe(source);
  });
});

describe("hostile paste is dropped by the schema, not by a filter", () => {
  /**
   * Parse an HTML fragment the way a paste does. This is the one test that
   * needs a DOM; ProseMirror's DOMParser takes any DOM-ish tree, so a
   * hand-built minimal one keeps the suite in `node` without jsdom. Only
   * the handful of members `DOMParser.parse` touches are implemented.
   */
  function parseHtml(html: string) {
    // The cast is the point of the exercise: ProseMirror reads a handful of
    // DOM members, and this supplies exactly those rather than a full `Node`.
    const dom = buildDom(html) as unknown as Node;
    return PMDOMParser.fromSchema(schema).parse(dom);
  }

  it("drops a script element and keeps only its text", () => {
    const doc = parseHtml("<p>before<script>alert(1)</script>after</p>");
    expect(JSON.stringify(doc.toJSON())).not.toContain("script");
  });

  it("drops an image with an onerror handler", () => {
    const doc = parseHtml("<p><img src=x onerror=alert(1)>caption</p>");
    const json = JSON.stringify(doc.toJSON());
    expect(json).not.toContain("image");
    expect(json).not.toContain("onerror");
  });

  it("drops a javascript: link but keeps the text it wrapped", () => {
    const doc = parseHtml("<p><a href=\"javascript:alert(1)\">click me</a></p>");
    const json = JSON.stringify(doc.toJSON());
    expect(json).not.toContain("javascript:");
    expect(json).not.toContain("\"link\"");
    expect(json).toContain("click me");
  });

  it("drops an iframe entirely", () => {
    const doc = parseHtml("<div><iframe src=\"https://example.com\"></iframe></div>");
    expect(JSON.stringify(doc.toJSON())).not.toContain("example.com");
  });

  it("keeps the formatting it does know", () => {
    const doc = parseHtml("<p><strong>bold</strong> and <em>italic</em></p>");
    const json = JSON.stringify(doc.toJSON());
    expect(json).toContain("bold");
    expect(json).toContain("italic");
  });
});

/* ---------------------------------------------------------------------- */

/** Minimal DOM node shape ProseMirror's DOMParser reads. */
interface FakeNode {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  parentNode: FakeNode | null;
  childNodes: FakeNode[];
  firstChild: FakeNode | null;
  nextSibling: FakeNode | null;
  contentEditable?: string;
  getAttribute: (name: string) => string | null;
  hasAttribute: (name: string) => boolean;
  matches: (selector: string) => boolean;
  attributes?: { name: string; value: string }[];
  style?: Record<string, string> & { getPropertyValue: (name: string) => string };
}

/**
 * A tiny HTML parser producing that shape. Deliberately naive — it only has
 * to handle the fragments above, and a real jsdom would pull a dependency
 * into a suite that has stayed DOM-free on purpose.
 */
function buildDom(html: string): FakeNode {
  const root = element("div");
  let current = root;
  // Closing tag, opening tag (attributes must start with whitespace, so the
  // name and the attribute run can't trade characters), or a text run.
  const tokenizer = /<\/([a-z][a-z\d]*)\s*>|<([a-z][a-z\d]*)(\s[^>]*)?>|([^<]+)/gi;

  for (const match of html.matchAll(tokenizer)) {
    const [, closing, tag, attrText, text] = match;
    if (text !== undefined) {
      append(current, textNode(text));
      continue;
    }
    if (closing !== undefined) {
      current = current.parentNode ?? root;
      continue;
    }
    const node = element(tag.toLowerCase(), parseAttrs(attrText ?? ""));
    append(current, node);
    // Void elements never become the insertion point.
    if (!/^(?:img|br|hr|input|meta|link)$/.test(node.nodeName.toLowerCase()))
      current = node;
  }
  return root;
}

function parseAttrs(text: string): { name: string; value: string }[] {
  const attrs: { name: string; value: string }[] = [];
  for (const m of text.matchAll(/([a-z-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi))
    attrs.push({ name: m[1].toLowerCase(), value: m[2] ?? m[3] ?? m[4] ?? "" });
  return attrs;
}

function element(name: string, attrs: { name: string; value: string }[] = []): FakeNode {
  const node: FakeNode = {
    nodeType: 1,
    nodeName: name.toUpperCase(),
    nodeValue: null,
    parentNode: null,
    childNodes: [],
    firstChild: null,
    nextSibling: null,
    contentEditable: "",
    attributes: attrs,
    getAttribute: attrName => attrs.find(a => a.name === attrName)?.value ?? null,
    hasAttribute: attrName => attrs.some(a => a.name === attrName),
    matches: () => false,
    style: Object.assign(Object.create(null), { getPropertyValue: () => "" }) as FakeNode["style"],
  };
  return node;
}

function textNode(text: string): FakeNode {
  return {
    nodeType: 3,
    nodeName: "#text",
    nodeValue: text,
    parentNode: null,
    childNodes: [],
    firstChild: null,
    nextSibling: null,
    getAttribute: () => null,
    hasAttribute: () => false,
    matches: () => false,
  };
}

function append(parent: FakeNode, child: FakeNode): void {
  const last = parent.childNodes.at(-1);
  if (last)
    last.nextSibling = child;
  parent.childNodes.push(child);
  parent.firstChild = parent.childNodes[0];
  child.parentNode = parent;
}
