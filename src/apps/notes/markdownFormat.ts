/**
 * Pure text-transform logic behind Notes' formatting toolbar (U15). The
 * editor is a plain `<textarea>` — these functions take its current text and
 * selection range and return new text plus a new selection range, so the
 * caller (NotesApp.tsx) just applies both back to the DOM node. No markdown
 * is ever parsed here; each function only knows the one syntax it toggles.
 */

export interface TextEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Wrap the selection in `open`/`close` (bold `**`, italic `*`, underline
 * `<u>`/`</u>`), or unwrap it if the selection is already exactly wrapped.
 * An empty selection inserts an empty pair with the cursor left between them
 * (type-as-you-go, like a GitHub comment box's toolbar).
 */
export function toggleInlineWrap(text: string, selectionStart: number, selectionEnd: number, open: string, close: string): TextEdit {
  const selected = text.slice(selectionStart, selectionEnd);

  if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
    const unwrapped = selected.slice(open.length, selected.length - close.length);
    return {
      text: text.slice(0, selectionStart) + unwrapped + text.slice(selectionEnd),
      selectionStart,
      selectionEnd: selectionStart + unwrapped.length,
    };
  }

  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  if (before.endsWith(open) && after.startsWith(close)) {
    return {
      text: before.slice(0, -open.length) + selected + after.slice(close.length),
      selectionStart: selectionStart - open.length,
      selectionEnd: selectionEnd - open.length,
    };
  }

  return {
    text: before + open + selected + close + after,
    selectionStart: selectionStart + open.length,
    selectionEnd: selectionStart + open.length + selected.length,
  };
}

const HEADING_RE = /^(#{1,3}) /;

/** Every line index range `[start, end)` (line indices) touched by a selection. */
function coveredLineRange(lines: string[], selectionStart: number, selectionEnd: number): [number, number] {
  let offset = 0;
  let first = 0;
  let last = lines.length - 1;
  let foundFirst = false;
  for (let i = 0; i < lines.length; i++) {
    const lineStart = offset;
    const lineEnd = offset + lines[i].length;
    if (!foundFirst && selectionStart <= lineEnd) {
      first = i;
      foundFirst = true;
    }
    if (selectionEnd >= lineStart && selectionEnd <= lineEnd + 1) {
      last = i;
      if (selectionEnd === lineStart && i > first)
        last = i - 1;
      break;
    }
    offset = lineEnd + 1; // +1 for the newline
  }
  return [first, Math.max(first, last)];
}

/**
 * Cycle the heading level of every line touched by the selection: plain →
 * H1 → H2 → H3 → plain, based on the first touched line's current level.
 */
export function toggleHeadingLine(text: string, selectionStart: number, selectionEnd: number): TextEdit {
  const lines = text.split("\n");
  const [first, last] = coveredLineRange(lines, selectionStart, selectionEnd);

  const currentLevel = HEADING_RE.exec(lines[first])?.[1].length ?? 0;
  const nextLevel = (currentLevel + 1) % 4;
  const nextPrefix = nextLevel > 0 ? `${"#".repeat(nextLevel)} ` : "";
  const firstLineStart = lineOffset(lines, first);

  let delta = 0;
  let startDelta = 0;
  for (let i = first; i <= last; i++) {
    const stripped = lines[i].replace(HEADING_RE, "");
    const before = lines[i].length;
    lines[i] = nextPrefix + stripped;
    const change = lines[i].length - before;
    delta += change;
    if (i === first)
      startDelta = change;
  }

  const newText = lines.join("\n");
  return {
    text: newText,
    selectionStart: selectionStart + (selectionStart > firstLineStart ? startDelta : 0),
    selectionEnd: selectionEnd + delta,
  };
}

/** Character offset where line `index` starts, in the joined (`\n`-separated) text. */
function lineOffset(lines: string[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i++)
    offset += lines[i].length + 1;
  return offset;
}

const BULLET_RE = /^([ \t]*)[-*] /;
const NUMBER_RE = /^([ \t]*)\d+\. /;

/** Toggle a `- ` bullet prefix on every non-blank line touched by the selection. */
export function toggleBulletList(text: string, selectionStart: number, selectionEnd: number): TextEdit {
  return toggleListPrefix(text, selectionStart, selectionEnd, BULLET_RE, () => "- ");
}

/** Toggle sequential `1. `, `2. `, … numbering on every non-blank line touched by the selection. */
export function toggleNumberList(text: string, selectionStart: number, selectionEnd: number): TextEdit {
  let n = 1;
  return toggleListPrefix(text, selectionStart, selectionEnd, NUMBER_RE, () => `${n++}. `);
}

function toggleListPrefix(text: string, selectionStart: number, selectionEnd: number, prefixRe: RegExp, makePrefix: () => string): TextEdit {
  const lines = text.split("\n");
  const [first, last] = coveredLineRange(lines, selectionStart, selectionEnd);

  const touched = lines.slice(first, last + 1).filter(l => l.trim() !== "");
  const allPrefixed = touched.length > 0 && touched.every(l => prefixRe.test(l));

  let delta = 0;
  let startDelta = 0;
  for (let i = first; i <= last; i++) {
    if (lines[i].trim() === "")
      continue;
    const before = lines[i].length;
    lines[i] = allPrefixed ? lines[i].replace(prefixRe, "$1") : makePrefix() + lines[i];
    const change = lines[i].length - before;
    delta += change;
    if (i === first)
      startDelta = change;
  }

  const newText = lines.join("\n");
  const firstLineStart = lineOffset(lines, first);
  return {
    text: newText,
    selectionStart: selectionStart + (selectionStart > firstLineStart ? startDelta : 0),
    selectionEnd: selectionEnd + delta,
  };
}
