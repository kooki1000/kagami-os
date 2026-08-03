import type { JSONContent } from "@tiptap/core";

/**
 * The bridge between what Notes stores (plain `.md` text on disk, unchanged
 * by D9) and what the editor edits (a ProseMirror document).
 *
 * **Why this is hand-written rather than `@tiptap/markdown`.** That package
 * depends on `marked`, a full CommonMark→HTML parser. ROADMAP.md §6
 * decision 8 lets Notes render markdown *outside* the sandbox precisely
 * because its vocabulary is closed and there is no generic-HTML code path
 * anywhere in it; adding a general parser would trade that guarantee for
 * convenience, and G1 explicitly still owes a renderer audit if D1's scope
 * grows. So this file speaks exactly the grammar the app already shipped —
 * H1–H3, bullet/ordered/task lists, `**bold**`, `*italic*`, `<u>` — and
 * anything else in a file stays literal text, visible as the characters the
 * user typed rather than interpreted.
 *
 * `<u>` is matched as a literal two-token string, the same way `**` is. It
 * is never an HTML tag parse, and there is no branch here that could become
 * one.
 *
 * Round-tripping is idempotent: `docToMarkdown(markdownToDoc(text))` is
 * stable after one pass (asserted in the tests), so opening and saving a
 * note without editing it can't churn the file.
 */

const HEADING_RE = /^(#{1,3}) (.*)$/;
const TASK_RE = /^[-*] \[([ x])\] (.*)$/i;
const BULLET_RE = /^[-*] (.*)$/;
const ORDERED_RE = /^\d+\. (.*)$/;

/**
 * Reused across calls in the exec loop below; always run to exhaustion
 * (never `break` early), so `lastIndex` is already 0 by the time a call
 * returns — the explicit reset just makes that safe against future changes.
 */
const INLINE_RE = /\*\*(.+?)\*\*|<u>(.+?)<\/u>|\*(.+?)\*/g;

/** The three marks the schema has. Nothing here can produce any other. */
type MarkName = "bold" | "italic" | "underline";

function textNode(text: string, mark?: MarkName): JSONContent {
  return mark ? { type: "text", text, marks: [{ type: mark }] } : { type: "text", text };
}

/** `**bold**`, `*italic*`, `<u>underline</u>` → text nodes. No nesting or combining. */
export function inlineToNodes(line: string): JSONContent[] {
  INLINE_RE.lastIndex = 0;
  const nodes: JSONContent[] = [];
  let cursor = 0;
  let match = INLINE_RE.exec(line);
  while (match !== null) {
    if (match.index > cursor)
      nodes.push(textNode(line.slice(cursor, match.index)));
    if (match[1] !== undefined)
      nodes.push(textNode(match[1], "bold"));
    else if (match[2] !== undefined)
      nodes.push(textNode(match[2], "underline"));
    else
      nodes.push(textNode(match[3], "italic"));
    cursor = match.index + match[0].length;
    match = INLINE_RE.exec(line);
  }
  if (cursor < line.length)
    nodes.push(textNode(line.slice(cursor)));
  return nodes;
}

/** One list item, wrapping its inline content in the paragraph the schema requires. */
function listItem(type: "listItem" | "taskItem", line: string, checked?: boolean): JSONContent {
  const content = inlineToNodes(line);
  return {
    type,
    ...(checked === undefined ? {} : { attrs: { checked } }),
    // An empty item still needs its paragraph — a childless block is invalid
    // against the schema and ProseMirror would drop the whole item.
    content: [{ type: "paragraph", ...(content.length > 0 ? { content } : {}) }],
  };
}

/** Collect the run of consecutive lines matching `match`, starting at `start`. */
function collectRun<T>(
  lines: string[],
  start: number,
  match: (line: string) => T | null,
): { items: T[]; next: number } {
  const items: T[] = [];
  let i = start;
  while (i < lines.length) {
    const m = match(lines[i]);
    if (m === null)
      break;
    items.push(m);
    i++;
  }
  return { items, next: i };
}

function matchTask(line: string): { checked: boolean; rest: string } | null {
  const m = TASK_RE.exec(line);
  return m ? { checked: m[1].toLowerCase() === "x", rest: m[2] } : null;
}

function matchBullet(line: string): string | null {
  // Order matters: a task line is also bullet-shaped, so tasks are matched
  // first everywhere and a bullet run stops at one.
  if (TASK_RE.test(line))
    return null;
  const m = BULLET_RE.exec(line);
  return m ? m[1] : null;
}

function matchOrdered(line: string): string | null {
  const m = ORDERED_RE.exec(line);
  return m ? m[1] : null;
}

function isBlockLine(line: string): boolean {
  return HEADING_RE.test(line) || TASK_RE.test(line) || BULLET_RE.test(line) || ORDERED_RE.test(line);
}

/**
 * A paragraph's source lines, joined by hard breaks. The app has always
 * treated a single newline as a line break within the paragraph (the old
 * preview rendered it that way), so mapping it to `hardBreak` is what lets
 * an existing note round-trip byte-for-byte instead of gaining blank lines
 * the first time it's saved.
 */
function paragraph(lines: string[]): JSONContent {
  const content: JSONContent[] = [];
  lines.forEach((line, i) => {
    if (i > 0)
      content.push({ type: "hardBreak" });
    content.push(...inlineToNodes(line));
  });
  return { type: "paragraph", ...(content.length > 0 ? { content } : {}) };
}

/** Parse a note's markdown into the editor's document. */
export function markdownToDoc(text: string): JSONContent {
  const lines = text.split("\n");
  const content: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const inline = inlineToNodes(heading[2]);
      content.push({
        type: "heading",
        attrs: { level: heading[1].length },
        ...(inline.length > 0 ? { content: inline } : {}),
      });
      i++;
      continue;
    }

    if (matchTask(line)) {
      const { items, next } = collectRun(lines, i, matchTask);
      content.push({ type: "taskList", content: items.map(t => listItem("taskItem", t.rest, t.checked)) });
      i = next;
      continue;
    }

    if (matchBullet(line) !== null) {
      const { items, next } = collectRun(lines, i, matchBullet);
      content.push({ type: "bulletList", content: items.map(rest => listItem("listItem", rest)) });
      i = next;
      continue;
    }

    if (matchOrdered(line) !== null) {
      const { items, next } = collectRun(lines, i, matchOrdered);
      content.push({ type: "orderedList", attrs: { start: 1 }, content: items.map(rest => listItem("listItem", rest)) });
      i = next;
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockLine(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    content.push(paragraph(paraLines));
  }

  // An empty note is still a valid document: one empty paragraph, which is
  // what the editor needs to have somewhere to put the caret.
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

const MARK_WRAPPERS: Record<MarkName, [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  underline: ["<u>", "</u>"],
};

function isMarkName(name: string | undefined): name is MarkName {
  return name === "bold" || name === "italic" || name === "underline";
}

/** Inline content back to markdown. A hard break is the newline it came from. */
function inlineToMarkdown(content: JSONContent[] | undefined): string {
  if (!content)
    return "";
  return content.map((node) => {
    if (node.type === "hardBreak")
      return "\n";
    const text = node.text ?? "";
    const mark = node.marks?.find(m => isMarkName(m.type))?.type;
    if (!isMarkName(mark) || text === "")
      return text;
    const [open, close] = MARK_WRAPPERS[mark];
    return `${open}${text}${close}`;
  }).join("");
}

/** A list item's text: its single paragraph's inline content. */
function itemText(item: JSONContent): string {
  return inlineToMarkdown(item.content?.[0]?.content);
}

function blockToMarkdown(block: JSONContent): string {
  switch (block.type) {
    case "heading": {
      const level = Number(block.attrs?.level ?? 1);
      return `${"#".repeat(Math.min(3, Math.max(1, level)))} ${inlineToMarkdown(block.content)}`;
    }
    case "bulletList":
      return (block.content ?? []).map(item => `- ${itemText(item)}`).join("\n");
    case "orderedList":
      return (block.content ?? []).map((item, i) => `${i + 1}. ${itemText(item)}`).join("\n");
    case "taskList":
      return (block.content ?? []).map(item => `- [${item.attrs?.checked ? "x" : " "}] ${itemText(item)}`).join("\n");
    default:
      return inlineToMarkdown(block.content);
  }
}

/**
 * Serialize the editor's document back to the markdown stored on disk.
 *
 * Empty paragraphs are dropped. Markdown has no way to say "a blank
 * paragraph here" — blank lines are separators — so keeping one would write
 * leading or doubled newlines that the parser discards on the next open,
 * leaving the file churning between two forms.
 */
export function docToMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .map(blockToMarkdown)
    .filter(block => block !== "")
    .join("\n\n");
}
