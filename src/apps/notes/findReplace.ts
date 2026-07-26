/**
 * Pure logic behind Notes' find-and-replace overlay (U11). The editor is a
 * plain `<textarea>` (no rich-text/contenteditable layer), so "highlighting"
 * every match isn't possible the way a code editor would — instead the UI
 * moves the textarea's native selection to the current match, same
 * limitation plain-textarea find bars elsewhere accept.
 */

/** Every case-insensitive match start index of `query` in `text`. Empty query has no matches. */
export function findMatches(text: string, query: string): number[] {
  if (!query)
    return [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const matches: number[] = [];
  let from = 0;
  for (let index = haystack.indexOf(needle, from); index !== -1; index = haystack.indexOf(needle, from)) {
    matches.push(index);
    from = index + needle.length;
  }
  return matches;
}

/**
 * Next (`direction: 1`) or previous (`direction: -1`) match index into
 * `matches`, wrapping around at either end. `current` is the previously
 * selected index, or `null` when nothing's selected yet (lands on the
 * first match going forward, the last one going backward).
 */
export function stepMatch(matchCount: number, current: number | null, direction: 1 | -1): number | null {
  if (matchCount === 0)
    return null;
  if (current === null)
    return direction === 1 ? 0 : matchCount - 1;
  return (current + direction + matchCount) % matchCount;
}

/** Replace the single match at `matches[index]` with `replacement`. A no-op if `index` is out of range. */
export function replaceOne(text: string, matches: number[], index: number, queryLength: number, replacement: string): string {
  const at = matches[index];
  if (at === undefined)
    return text;
  return text.slice(0, at) + replacement + text.slice(at + queryLength);
}

/** Replace every case-insensitive occurrence of `query` with `replacement`. */
export function replaceAllMatches(text: string, query: string, replacement: string): string {
  const matches = findMatches(text, query);
  if (matches.length === 0)
    return text;
  let result = "";
  let cursor = 0;
  for (const at of matches) {
    result += text.slice(cursor, at) + replacement;
    cursor = at + query.length;
  }
  return result + text.slice(cursor);
}

/** Whitespace-delimited word count for the status bar. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Plain character count (code units) — matches how "characters" reads to a user, not a byte size. */
export function charCount(text: string): number {
  return text.length;
}
