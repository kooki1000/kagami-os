/**
 * The editor's syntax colours (D4) — the one place in the system that
 * hand-authors colour outside the accent derivation, and a deliberate
 * exception rather than an oversight.
 *
 * `ARCHITECTURE.md`'s rule is not to hand-author colours downstream of the
 * accent; it exists so a user-picked accent can't clash with the chrome around
 * it. Highlighting is different in kind. Its hues carry *meaning* — a keyword
 * is not a string is not a comment — and they have to stay distinguishable
 * from one another, which a single derived hue can't promise: some accents
 * would collapse keyword and string into near-identical colours and make code
 * harder to read for exactly the users who picked that accent.
 *
 * So the palette is fixed, one pair for light and dark, contrast-tested
 * against the surface it sits on and against each other (`theme.test.ts`). It
 * is not user-facing and not part of the accent derivation. The editor's
 * chrome — background, gutter, selection, caret — is all tokens, and does
 * follow the look (see `theme.ts`).
 *
 * Kept free of CodeMirror imports so the palette and its contrast test stay
 * readable in Vitest's `node` environment.
 */

/** Six roles that carry meaning, plus two that recede. Kept few on purpose. */
export interface SyntaxPalette {
  keyword: string;
  string: string;
  number: string;
  comment: string;
  callable: string;
  type: string;
  punctuation: string;
}

/** Against `--surface: #faf8f4`. */
export const LIGHT_SYNTAX: SyntaxPalette = {
  keyword: "#9a4a86",
  string: "#3f7a34",
  number: "#a35a1f",
  // Comments recede, but they are still content: this is the lightest grey
  // that still clears AA on the light surface, not the lightest that looked
  // right.
  comment: "#66746c",
  callable: "#1f6bb0",
  type: "#0a7268",
  punctuation: "#5c574f",
};

/** Against `--surface: #201e1a` (the dark theme's window surface). */
export const DARK_SYNTAX: SyntaxPalette = {
  keyword: "#e2a0d0",
  string: "#a3d18c",
  number: "#f0b077",
  comment: "#98a29c",
  callable: "#8cc2f2",
  type: "#68d6c6",
  punctuation: "#b8b2a8",
};
