/**
 * Pure parser behind Notes' rendered Preview mode (U15). Recognizes only the
 * handful of constructs the formatting toolbar can produce — headings (H1-3),
 * bold/italic/underline, bullet/numbered lists, and the `- [ ]`/`- [x]`
 * checklist syntax the note templates already write. Deliberately not a full
 * CommonMark implementation (no links, code, tables, nesting/combined
 * styles) and never touches a generic HTML parser: the only "HTML" it
 * recognizes is the literal `<u>`/`</u>` pair, matched the same way `**` is —
 * so there's no arbitrary-tag surface to sanitize against. Output is a plain
 * data structure, rendered to JSX by NotePreview.tsx.
 */

export type InlineSegment
  = | { type: "text"; content: string }
    | { type: "bold"; content: string }
    | { type: "italic"; content: string }
    | { type: "underline"; content: string };

export interface ListItem {
  segments: InlineSegment[];
  /** `true`/`false` for a `- [x]`/`- [ ]` checklist line, `undefined` for a plain bullet. */
  checked?: boolean;
}

export type Block
  = | { type: "heading"; level: 1 | 2 | 3; segments: InlineSegment[] }
    | { type: "paragraph"; lines: InlineSegment[][] }
    | { type: "bulletList"; items: ListItem[] }
    | { type: "numberList"; items: ListItem[] };

const HEADING_RE = /^(#{1,3}) (.*)$/;
const CHECKLIST_RE = /^[-*] \[([ x])\] (.*)$/i;
const BULLET_LIST_RE = /^[-*] (.*)$/;
const NUMBER_LIST_RE = /^\d+\. (.*)$/;

/** Splits `line` into styled/plain runs. `**bold**`, `*italic*`, `<u>underline</u>` — no nesting or combining. */
export function parseInline(line: string): InlineSegment[] {
  const inlineRe = /\*\*(.+?)\*\*|<u>(.+?)<\/u>|\*(.+?)\*/g;
  const segments: InlineSegment[] = [];
  let cursor = 0;
  let match = inlineRe.exec(line);
  while (match !== null) {
    if (match.index > cursor)
      segments.push({ type: "text", content: line.slice(cursor, match.index) });
    if (match[1] !== undefined)
      segments.push({ type: "bold", content: match[1] });
    else if (match[2] !== undefined)
      segments.push({ type: "underline", content: match[2] });
    else
      segments.push({ type: "italic", content: match[3] });
    cursor = match.index + match[0].length;
    match = inlineRe.exec(line);
  }
  if (cursor < line.length)
    segments.push({ type: "text", content: line.slice(cursor) });
  return segments;
}

function matchListLine(line: string): { checked?: boolean; rest: string } | null {
  const checklist = CHECKLIST_RE.exec(line);
  if (checklist)
    return { checked: checklist[1].toLowerCase() === "x", rest: checklist[2] };
  const bullet = BULLET_LIST_RE.exec(line);
  if (bullet)
    return { rest: bullet[1] };
  return null;
}

function isSpecialLine(line: string): boolean {
  return HEADING_RE.test(line) || CHECKLIST_RE.test(line) || BULLET_LIST_RE.test(line) || NUMBER_LIST_RE.test(line);
}

/** Parses the note's raw markdown text into a block list for NotePreview to render. */
export function parseMarkdown(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, segments: parseInline(heading[2]) });
      i++;
      continue;
    }

    if (matchListLine(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = matchListLine(lines[i]);
        if (!m)
          break;
        items.push({ segments: parseInline(m.rest), checked: m.checked });
        i++;
      }
      blocks.push({ type: "bulletList", items });
      continue;
    }

    const numbered = NUMBER_LIST_RE.exec(line);
    if (numbered) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = NUMBER_LIST_RE.exec(lines[i]);
        if (!m)
          break;
        items.push({ segments: parseInline(m[1]) });
        i++;
      }
      blocks.push({ type: "numberList", items });
      continue;
    }

    const paraLines: InlineSegment[][] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isSpecialLine(lines[i])) {
      paraLines.push(parseInline(lines[i]));
      i++;
    }
    blocks.push({ type: "paragraph", lines: paraLines });
  }

  return blocks;
}
