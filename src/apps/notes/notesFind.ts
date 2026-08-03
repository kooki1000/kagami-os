import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Find-and-replace over the editor's document (U11, reworked for D9).
 *
 * The old implementation walked a plain string and moved the textarea's
 * native selection, which is why find had to force Preview off first —
 * there was no selection to move while the preview was showing. A document
 * has real positions, so matches become ranges the editor can decorate in
 * place, and the workaround goes away with the mode it worked around.
 *
 * Pure: takes a document, returns ranges. The decoration plugin that draws
 * them lives in `findHighlight.ts`.
 */

export interface DocMatch {
  /** ProseMirror document positions, directly usable as a range. */
  from: number;
  to: number;
}

/**
 * Text of one block plus, for each character, the document position it sits
 * at. A paragraph can hold non-text leaves (`hardBreak`) that occupy a
 * position while contributing no text, so `textContent`'s offsets don't line
 * up with positions and this walks the children instead. The break counts as
 * a newline, which also stops a query from matching across a line break.
 */
function blockText(block: PMNode, blockPos: number): { text: string; positions: number[] } {
  let text = "";
  const positions: number[] = [];
  block.forEach((child, offset) => {
    const childPos = blockPos + 1 + offset;
    if (child.isText) {
      const value = child.text ?? "";
      for (let i = 0; i < value.length; i++) {
        text += value[i];
        positions.push(childPos + i);
      }
      return;
    }
    text += "\n";
    positions.push(childPos);
  });
  return { text, positions };
}

/**
 * Every case-insensitive match of `query`, as document ranges in reading
 * order. An empty query matches nothing (rather than everything).
 */
export function findInDoc(doc: PMNode, query: string): DocMatch[] {
  if (query === "")
    return [];
  const needle = query.toLowerCase();
  const matches: DocMatch[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock)
      return true;
    const { text, positions } = blockText(node, pos);
    const haystack = text.toLowerCase();
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      const from = positions[at];
      const to = positions[at + needle.length - 1];
      // Defensive: a match can only run off the end if `positions` and
      // `text` disagreed, which would be a bug in blockText rather than
      // input — skip it rather than hand the editor a range it can't map.
      if (from !== undefined && to !== undefined)
        matches.push({ from, to: to + 1 });
      at = haystack.indexOf(needle, at + needle.length);
    }
    // A textblock's children are leaves; nothing below it to search.
    return false;
  });

  return matches;
}

/**
 * Next (`direction: 1`) or previous (`direction: -1`) match index, wrapping
 * at either end. `current` is `null` when nothing is selected yet, which
 * lands on the first match going forward and the last going backward.
 */
export function stepMatch(matchCount: number, current: number | null, direction: 1 | -1): number | null {
  if (matchCount === 0)
    return null;
  if (current === null)
    return direction === 1 ? 0 : matchCount - 1;
  return (current + direction + matchCount) % matchCount;
}

/** Whitespace-delimited word count for the status bar. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Plain character count (code units) — "characters" as a user reads it, not a byte size. */
export function charCount(text: string): number {
  return text.length;
}
