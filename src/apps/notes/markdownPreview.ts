/**
 * Pure parser behind Notes' rendered Preview mode: headings, bold/italic/
 * underline, bullet/numbered lists, and checklist items — not full
 * CommonMark. `<u>`/`</u>` is matched as a literal string, the same way
 * `**` is, never a generic HTML tag parse (see ARCHITECTURE.md's Notes
 * entry). Output is data, rendered to JSX by NotePreview.tsx.
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

// Reused across calls in the exec loop below; always run to exhaustion
// (never `break` early), so `lastIndex` is already 0 by the time a call
// returns — the explicit reset just makes that safe against future changes.
const INLINE_RE = /\*\*(.+?)\*\*|<u>(.+?)<\/u>|\*(.+?)\*/g;

/** Splits `line` into styled/plain runs. `**bold**`, `*italic*`, `<u>underline</u>` — no nesting or combining. */
export function parseInline(line: string): InlineSegment[] {
  INLINE_RE.lastIndex = 0;
  const segments: InlineSegment[] = [];
  let cursor = 0;
  let match = INLINE_RE.exec(line);
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
    match = INLINE_RE.exec(line);
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

function matchNumberLine(line: string): { rest: string } | null {
  const numbered = NUMBER_LIST_RE.exec(line);
  return numbered ? { rest: numbered[1] } : null;
}

/** Collects consecutive lines matched by `match`, starting at `start` — the shared shape behind both list block types below. */
function collectListItems(lines: string[], start: number, match: (line: string) => { checked?: boolean; rest: string } | null): { items: ListItem[]; next: number } {
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const m = match(lines[i]);
    if (!m)
      break;
    items.push({ segments: parseInline(m.rest), checked: m.checked });
    i++;
  }
  return { items, next: i };
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
      const { items, next } = collectListItems(lines, i, matchListLine);
      blocks.push({ type: "bulletList", items });
      i = next;
      continue;
    }

    if (NUMBER_LIST_RE.test(line)) {
      const { items, next } = collectListItems(lines, i, matchNumberLine);
      blocks.push({ type: "numberList", items });
      i = next;
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
