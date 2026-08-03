/**
 * The line-editing half of the REPL: the ⌃A/⌃E/⌃W/⌃U/⌃K bindings every
 * shell has, as pure transforms over a caret and a string.
 *
 * They live here rather than inline in `TerminalApp`'s keydown handler for
 * the same reason `shell.ts` does: the interesting part is the text
 * arithmetic (where a word boundary is, what "kill to end" leaves behind),
 * and that is worth testing without mounting React — which this codebase's
 * `node`-environment unit suites can't do anyway.
 *
 * ⌃L and ⌃C aren't here: they act on the scrollback and the running line
 * rather than on the text being edited, so they have nothing to transform.
 */

export interface LineState {
  value: string;
  /** Caret offset into `value`; a selection's start is close enough for these bindings. */
  caret: number;
}

/** Offset of the start of the word before `caret` — what ⌃W deletes back to. */
function wordStart(value: string, caret: number): number {
  // Skip the whitespace directly behind the caret first, so ⌃W after
  // "ls Documents   " deletes the word and not just the gap.
  let i = caret;
  while (i > 0 && /\s/.test(value[i - 1]))
    i--;
  while (i > 0 && !/\s/.test(value[i - 1]))
    i--;
  return i;
}

/**
 * Apply the readline binding for `key` (the bare letter, ⌃ already
 * established by the caller), or return null when it isn't one — the caller
 * then leaves the event alone rather than swallowing an unrelated chord.
 */
export function applyReadlineKey(key: string, state: LineState): LineState | null {
  const { value, caret } = state;
  const at = Math.max(0, Math.min(caret, value.length));

  switch (key) {
    case "a":
      return { value, caret: 0 };
    case "e":
      return { value, caret: value.length };
    case "w": {
      const start = wordStart(value, at);
      return { value: value.slice(0, start) + value.slice(at), caret: start };
    }
    case "u":
      return { value: value.slice(at), caret: 0 };
    case "k":
      return { value: value.slice(0, at), caret: at };
    default:
      return null;
  }
}
