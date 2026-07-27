/**
 * Pure text-transform logic behind Notes' formatting toolbar. Operates on
 * raw text + selection ranges, not a markdown AST — the editor is a plain
 * `<textarea>` with no rich-formatting API, so callers apply the returned
 * text/selection straight back to the DOM node.
 */

export interface TextEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Wrap the selection in `open`/`close` (bold `**`, italic `*`, underline
 * `<u>`/`</u>`), or unwrap it if the selection is already exactly wrapped.
 * An empty selection inserts an empty pair with the cursor placed between them.
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

// Mirrors markdownPreview.ts's HEADING_RE — kept separate since this one is
// used with String.replace to strip the prefix, not to extract the rest of
// the line.
const HEADING_RE = /^(#{1,3}) /;

/**
 * Every line index range `[first, last]` (inclusive) touched by a selection,
 * plus the character offset where `first` starts in the joined text.
 */
function coveredLineRange(lines: string[], selectionStart: number, selectionEnd: number): [first: number, last: number, firstLineStart: number] {
  let offset = 0;
  let first = 0;
  let last = lines.length - 1;
  let firstLineStart = 0;
  let foundFirst = false;
  for (let i = 0; i < lines.length; i++) {
    const lineStart = offset;
    const lineEnd = offset + lines[i].length;
    if (!foundFirst && selectionStart <= lineEnd) {
      first = i;
      firstLineStart = lineStart;
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
  return [first, Math.max(first, last), firstLineStart];
}

/**
 * Applies `transform` to every line in `[first, last]` (skipping blank lines
 * when `skipBlank`), then shifts the selection by however much each line's
 * length changed — the shared shape behind `toggleHeadingLine` and
 * `toggleListPrefix` below.
 */
function applyLineTransform(
  lines: string[],
  first: number,
  last: number,
  firstLineStart: number,
  selectionStart: number,
  selectionEnd: number,
  transform: (line: string) => string,
  skipBlank: boolean,
): TextEdit {
  let delta = 0;
  let startDelta = 0;
  for (let i = first; i <= last; i++) {
    if (skipBlank && lines[i].trim() === "")
      continue;
    const before = lines[i].length;
    lines[i] = transform(lines[i]);
    const change = lines[i].length - before;
    delta += change;
    if (i === first)
      startDelta = change;
  }
  return {
    text: lines.join("\n"),
    selectionStart: selectionStart + (selectionStart > firstLineStart ? startDelta : 0),
    selectionEnd: selectionEnd + delta,
  };
}

/**
 * Cycle the heading level of every line touched by the selection: plain →
 * H1 → H2 → H3 → plain, based on the first touched line's current level.
 */
export function toggleHeadingLine(text: string, selectionStart: number, selectionEnd: number): TextEdit {
  const lines = text.split("\n");
  const [first, last, firstLineStart] = coveredLineRange(lines, selectionStart, selectionEnd);

  const currentLevel = HEADING_RE.exec(lines[first])?.[1].length ?? 0;
  const nextLevel = (currentLevel + 1) % 4;
  const nextPrefix = nextLevel > 0 ? `${"#".repeat(nextLevel)} ` : "";

  return applyLineTransform(lines, first, last, firstLineStart, selectionStart, selectionEnd, line => nextPrefix + line.replace(HEADING_RE, ""), false);
}

// Mirror markdownPreview.ts's BULLET_LIST_RE/NUMBER_LIST_RE — kept separate
// since toggling off needs the `([ \t]*)` capture group to preserve
// indentation, which the preview side's plain content-extraction doesn't.
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
  const [first, last, firstLineStart] = coveredLineRange(lines, selectionStart, selectionEnd);

  const touched = lines.slice(first, last + 1).filter(l => l.trim() !== "");
  const allPrefixed = touched.length > 0 && touched.every(l => prefixRe.test(l));

  return applyLineTransform(lines, first, last, firstLineStart, selectionStart, selectionEnd, line => allPrefixed ? line.replace(prefixRe, "$1") : makePrefix() + line, true);
}
